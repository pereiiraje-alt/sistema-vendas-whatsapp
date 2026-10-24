(()=>{
  const CLOUD_API='https://whatsapp-cloud-production-b8c1.up.railway.app';
  let cloudPollTimer=null;

  function cloudTokenKey(){
    return currentCompany?.id?'jp_whatsapp_cloud_'+currentCompany.id:'jp_whatsapp_cloud';
  }
  function getCloudToken(){
    try{return localStorage.getItem(cloudTokenKey())||''}catch{return ''}
  }
  function setCloudToken(token){
    try{localStorage.setItem(cloudTokenKey(),token)}catch{}
  }
  function clearCloudToken(){
    try{localStorage.removeItem(cloudTokenKey())}catch{}
  }
  async function ensureCloudToken(){
    let token=getCloudToken();
    if(token)return token;
    token=await createDeviceToken();
    setCloudToken(token);
    return token;
  }
  async function cloudRequest(path,{method='GET',body}={}){
    const token=getCloudToken();
    if(!token)throw new Error('Inicie a conexão do WhatsApp primeiro.');
    const response=await fetch(CLOUD_API+path,{
      method,
      headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,
      cache:'no-store'
    });
    const raw=await response.text();
    let data={};
    try{data=raw?JSON.parse(raw):{}}catch{data={error:raw}}
    if(!response.ok)throw new Error(data?.error||'Falha na conexão com o WhatsApp.');
    return data;
  }
  function stopCloudPolling(){
    if(cloudPollTimer){clearInterval(cloudPollTimer);cloudPollTimer=null}
  }

  async function getSettings(){
    if(!currentCompany?.id)return null;
    let {data,error}=await db.from('company_whatsapp_settings').select('*').eq('company_id',currentCompany.id).maybeSingle();
    if(error)throw error;
    if(!data){
      const inserted=await db.from('company_whatsapp_settings').insert({
        company_id:currentCompany.id,enabled:false,auto_send_on_publish:false,selected_groups:[]
      }).select().single();
      if(inserted.error)throw inserted.error;
      data=inserted.data;
    }
    return data;
  }

  async function getDevice(){
    if(!currentCompany?.id)return null;
    const {data,error}=await db.from('company_whatsapp_devices')
      .select('status,phone,available_groups,last_seen,last_error,updated_at')
      .eq('company_id',currentCompany.id).maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function saveSettings(patch){
    const {data,error}=await db.from('company_whatsapp_settings')
      .update({...patch,updated_at:new Date().toISOString()})
      .eq('company_id',currentCompany.id).select().single();
    if(error)throw error;
    return data;
  }

  function randomToken(){
    const bytes=new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  }

  async function createDeviceToken(){
    const token=randomToken();
    const {error}=await db.rpc('configure_company_whatsapp_device',{p_token:token});
    if(error)throw error;
    return token;
  }

  async function enqueueAuction(auctionId,force=false){
    const {data,error}=await db.rpc('enqueue_company_whatsapp_auction',{p_auction_id:auctionId,p_force:!!force});
    if(error)throw error;
    return Number(data||0);
  }

  window.jpWhatsappSendAuction=async function(auctionId,{silent=false}={}){
    if(!currentCompany?.id||!auctionId)return false;
    try{
      const count=await enqueueAuction(auctionId,false);
      if(!silent&&count)alert(count+' produto(s) adicionado(s) à fila do WhatsApp.');
      return count>0;
    }catch(e){
      console.warn('WhatsApp automático:',e);
      if(!silent)alert('WhatsApp automático: '+(e.message||e));
      return false;
    }
  };

  window.jpWhatsappSendLot=async function(lotId,{silent=false,force=true}={}){
    if(!currentCompany?.id||!lotId)return false;
    try{
      const {data,error}=await db.rpc('enqueue_company_whatsapp_lot',{
        p_lot_id:lotId,
        p_force:!!force
      });
      if(error)throw error;
      const count=Number(data||0);
      if(!silent){
        alert(count
          ?'Produto enviado para a fila do WhatsApp.'
          :'Este produto já estava na fila ou já foi enviado.');
      }
      return count>0;
    }catch(e){
      console.warn('WhatsApp produto:',e);
      if(!silent)alert('Não foi possível enviar para o WhatsApp: '+(e.message||e));
      return false;
    }
  };

  window.jpWhatsappGetProductGroups=async function(){
    if(!currentCompany?.id)return {online:false,groups:[],phone:null};
    try{
      let device=await getDevice();
      if(getCloudToken()){
        try{
          const cloud=await Promise.race([
            cloudRequest('/api/status'),
            new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo limite da nuvem WhatsApp')),5000))
          ]);
          if(cloud){
            device={
              ...(device||{}),
              status:cloud.status||device?.status,
              phone:cloud.phone||device?.phone,
              available_groups:Array.isArray(cloud.groups)&&cloud.groups.length?cloud.groups:(device?.available_groups||[])
            };
          }
        }catch(e){console.warn('Grupos WhatsApp Cloud:',e)}
      }
      return {
        online:device?.status==='ONLINE',
        phone:device?.phone||null,
        groups:Array.isArray(device?.available_groups)?device.available_groups:[]
      };
    }catch(e){
      console.warn('Carregar grupos do produto:',e);
      return {online:false,groups:[],phone:null,error:e.message||String(e)};
    }
  };

  window.jpWhatsappSendLotToGroups=async function(lotId,groupIds,{silent=false}={}){
    if(!currentCompany?.id||!lotId)return false;
    const ids=[...new Set((groupIds||[]).map(String).filter(Boolean))];
    if(!ids.length)return false;
    try{
      const {data,error}=await db.rpc('enqueue_company_whatsapp_lot_groups',{
        p_lot_id:lotId,
        p_group_ids:ids
      });
      if(error)throw error;
      const count=Number(data||0);
      if(!silent){
        alert(count
          ?'Produto enviado para os grupos selecionados.'
          :'Este produto já estava na fila para estes grupos.');
      }
      return count>0;
    }catch(e){
      console.warn('WhatsApp por grupos:',e);
      if(!silent)alert('Não foi possível enviar para os grupos: '+(e.message||e));
      return false;
    }
  };

  window.jpWhatsappSendDirect=async function(phone,message,{silent=false}={}){
    try{
      const text=String(message||'').trim();
      if(!text)throw new Error('Mensagem vazia.');
      const {data,error}=await db.rpc('enqueue_company_whatsapp_direct',{
        p_phone:String(phone||''),
        p_message:text
      });
      if(error)throw error;
      const queued=Number(data||0)>0;
      if(!silent)alert(queued?'Mensagem colocada na fila do WhatsApp.':'Não foi possível criar o envio.');
      return queued;
    }catch(e){
      console.warn('WhatsApp direto:',e);
      if(!silent)alert('Não foi possível enviar pelo WhatsApp conectado: '+(e.message||e));
      return false;
    }
  };

  function statusLabel(status){
    return ({ONLINE:'Conectado',OFFLINE:'Desconectado',CONECTANDO:'Conectando...',
      AGUARDANDO_QR:'Aguardando QR Code',AGUARDANDO_CODIGO:'Aguardando código no WhatsApp',ERRO:'Erro'})[status]||status||'Desconectado';
  }

  function renderCloudState(root,state){
    const box=root.querySelector('[data-wa-cloud-state]');
    if(!box)return;
    box.hidden=false;
    const status=box.querySelector('[data-wa-cloud-status]');
    if(status)status.textContent=statusLabel(state?.status);

    const qrWrap=box.querySelector('[data-wa-qr-wrap]');
    const qrImg=box.querySelector('[data-wa-qr-img]');
    if(qrWrap){
      qrWrap.hidden=!state?.qr;
      if(state?.qr&&qrImg)qrImg.src=state.qr;
    }

    const codeWrap=box.querySelector('[data-wa-code-wrap]');
    const codeEl=box.querySelector('[data-wa-code]');
    if(codeWrap){
      codeWrap.hidden=!state?.pairingCode;
      if(state?.pairingCode&&codeEl){
        const value=String(state.pairingCode);
        codeEl.textContent=value.replace(/(.{4})/g,'$1 ').trim();
        codeEl.dataset.value=value;
      }
    }

    const err=box.querySelector('[data-wa-cloud-error]');
    if(err){
      err.hidden=!state?.lastError;
      err.textContent=state?.lastError||'';
    }
  }

  function watchCloud(root){
    stopCloudPolling();
    let failures=0;
    cloudPollTimer=setInterval(async()=>{
      try{
        const state=await cloudRequest('/api/status');
        failures=0;
        renderCloudState(root,state);
        if(state.status==='ONLINE'){
          stopCloudPolling();
          setTimeout(()=>renderWhatsappPage(),600);
        }
      }catch(e){
        failures++;
        const err=root.querySelector('[data-wa-cloud-error]');
        if(err){err.hidden=false;err.textContent=e.message||e}
        if(failures>=4)stopCloudPolling();
      }
    },1500);
  }

  async function renderWhatsappPage(){
    if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';
    title.textContent='WhatsApp';
    subtitle.textContent='Conecte uma vez e escolha os grupos ao criar cada produto';

    let settings,device;
    try{
      settings=await getSettings();
      device=await getDevice();
    }catch(e){
      app.innerHTML='<div class="panel"><h3>WhatsApp</h3><p>'+esc(e.message||e)+'</p></div>';
      return;
    }

    const groups=Array.isArray(device?.available_groups)?device.available_groups:[];
    const selected=new Set(Array.isArray(settings?.selected_groups)?settings.selected_groups:[]);
    const online=device?.status==='ONLINE';

    app.innerHTML=`<section class="panel wa-simple">
      <div class="wa-simple-head">
        <div>
          <small>WHATSAPP AUTOMÁTICO</small>
          <h2>${online?'✅ WhatsApp conectado':'Conecte seu WhatsApp'}</h2>
          <p>${online?'Conectado e pronto para enviar seus leilões. Escolha abaixo os grupos que receberão as divulgações.':'Faça a conexão uma vez e depois use tudo pelo painel do JP Leilões.'}</p>
        </div>
        <span class="badge ${online?'wa-online':'wa-offline'}">${statusLabel(device?.status)}</span>
      </div>

      ${device?.last_error?`<div class="wa-error">${esc(device.last_error)}</div>`:''}

      ${online?`
        <div class="wa-connected">
          <div class="wa-phone"><span>✓</span><div><small>WHATSAPP CONECTADO E PRONTO</small><b>${esc(device?.phone||'Conta conectada')}</b><em>Envios de leilões disponíveis</em></div></div>
          <div class="wa-connected-actions">
            <button class="ghost mini" type="button" data-wa-refresh>Atualizar status</button>
            <button class="ghost mini" type="button" data-wa-local-start>Usar conector do computador</button>
          </div>
        </div>

        <div class="wa-section">
          <small>GRUPOS DISPONÍVEIS</small>
          <h3>Escolha os grupos ao criar cada produto</h3>
          <p class="muted">Não existe mais grupo automático. Ao tocar em “Criar produto”, você decide em quais grupos aquele produto será publicado.</p>
          <div class="wa-group-list" data-wa-groups>
            ${groups.length?groups.map(g=>{
              const name=String(g.name||g.id||'Grupo');
              return `<div class="wa-group-item wa-group-readonly"><span>💬</span><b>${esc(name)}</b></div>`;
            }).join(''):'<p class="muted">Nenhum grupo encontrado ainda. Clique em “Atualizar grupos”.</p>'}
          </div>
        </div>
      `:`

        <div class="wa-connect-options">
          <div class="wa-connect-card wa-local-card">
            <div class="wa-connect-icon">PC</div>
            <div>
              <small>SEM META • SEM RAILWAY</small>
              <h3>Usar conector do computador</h3>
              <p>O mesmo conector envia leilões para grupos e lembretes diretamente aos compradores.</p>
            </div>
            <a class="primary wa-download-link" href="/instalar-jp-whatsapp.cmd" download>Baixar / atualizar</a>
          </div>
          <div class="wa-connect-card">
            <div class="wa-connect-icon">#</div>
            <div>
              <small>PASSO 2</small>
              <h3>Gerar código do computador</h3>
              <p>Gere o código, abra o conector instalado e cole esse código na tela local.</p>
            </div>
            <button class="primary" type="button" data-wa-local-start>Gerar código</button>
          </div>
        </div>

        <div class="wa-local-code-wrap" data-wa-local-code-wrap hidden>
          <small>CÓDIGO DO COMPUTADOR</small>
          <div class="wa-pair-code" data-wa-local-code></div>
          <div class="row">
            <button class="ghost mini" type="button" data-wa-local-copy>Copiar código</button>
            <a class="ghost mini" href="http://localhost:8765" target="_blank" rel="noopener">Abrir conector</a>
          </div>
          <ol>
            <li>Baixe ou atualize o conector.</li>
            <li>Abra “JP Leilões WhatsApp” no computador.</li>
            <li>Cole o código acima.</li>
            <li>Clique em “Conectar WhatsApp” e escaneie o QR Code.</li>
          </ol>
        </div>
      `}

      <details class="wa-help">
        <summary>Ajuda e conexão</summary>
        <p>O conector fica no computador da empresa e precisa permanecer aberto. Ele envia leilões para grupos e lembretes de pagamento diretamente pelo mesmo WhatsApp conectado, sem Meta e sem abrir WhatsApp externo.</p>
      </details>
    </section>`;

    const root=app.querySelector('.wa-simple');

    async function startLocalConnector(){
      try{
        clearCloudToken();
        const token=await createDeviceToken();
        const wrap=root.querySelector('[data-wa-local-code-wrap]');
        const code=root.querySelector('[data-wa-local-code]');
        if(wrap&&code){
          code.textContent=token.replace(/(.{4})/g,'$1 ').trim();
          code.dataset.value=token;
          wrap.hidden=false;
          wrap.scrollIntoView({behavior:'smooth',block:'center'});
        }else{
          prompt('Código do computador:',token);
        }
      }catch(err){
        alert('Não foi possível gerar o código do computador: '+(err.message||err));
      }
    }
    root.querySelectorAll('[data-wa-local-start]').forEach(btn=>btn.addEventListener('click',startLocalConnector));
    root.querySelector('[data-wa-local-copy]')?.addEventListener('click',async()=>{
      const el=root.querySelector('[data-wa-local-code]');
      const value=el?.dataset.value||'';
      if(!value)return;
      try{await navigator.clipboard.writeText(value);alert('Código copiado.')}
      catch{prompt('Copie o código:',value)}
    });

    root.querySelector('[data-wa-qr-start]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      btn.disabled=true;
      try{
        await ensureCloudToken();
        const state=await cloudRequest('/api/connect',{method:'POST'});
        renderCloudState(root,state);
        watchCloud(root);
      }catch(err){alert('Não foi possível iniciar a conexão: '+(err.message||err))}
      finally{btn.disabled=false}
    });

    root.querySelector('[data-wa-phone-start]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      const phone=String(root.querySelector('[data-wa-phone-input]')?.value||'').trim();
      if(!phone)return alert('Informe o número do WhatsApp com DDD.');
      btn.disabled=true;
      try{
        await ensureCloudToken();
        const state=await cloudRequest('/api/pairing-code',{method:'POST',body:{phone}});
        renderCloudState(root,state);
        watchCloud(root);
      }catch(err){alert('Não foi possível gerar o código: '+(err.message||err))}
      finally{btn.disabled=false}
    });

    root.querySelector('[data-wa-copy-code]')?.addEventListener('click',async()=>{
      const el=root.querySelector('[data-wa-code]');
      const value=el?.dataset.value||el?.textContent||'';
      if(!value)return;
      try{await navigator.clipboard.writeText(value);alert('Código copiado.')}catch{prompt('Copie o código:',value)}
    });

    root.querySelectorAll('[data-wa-refresh]').forEach(btn=>btn.addEventListener('click',async()=>{
      try{
        await renderWhatsappPage();
      }catch(err){alert('Não foi possível atualizar os grupos: '+(err.message||err))}
    }));

    root.querySelector('[data-wa-disconnect]')?.addEventListener('click',async e=>{
      if(!confirm('Desconectar este WhatsApp do JP Leilões?'))return;
      const btn=e.currentTarget;
      btn.disabled=true;
      try{
        if(!getCloudToken())throw new Error('Esta conexão foi feita pelo conector antigo.');
        await cloudRequest('/api/disconnect',{method:'POST'});
        await renderWhatsappPage();
      }catch(err){alert('Não foi possível desconectar: '+(err.message||err))}
      finally{btn.disabled=false}
    });

    root.querySelector('[data-wa-save]')?.addEventListener('click',async()=>{
      const chosen=[...root.querySelectorAll('[data-wa-groups] input[type="checkbox"]:checked')].map(x=>x.value);
      try{
        await saveSettings({
          enabled:root.querySelector('[data-wa-enabled]').checked,
          auto_send_on_publish:root.querySelector('[data-wa-auto]').checked,
          selected_groups:chosen
        });
        alert('WhatsApp configurado.');
        await renderWhatsappPage();
      }catch(e){alert('Não foi possível salvar: '+(e.message||e))}
    });

    root.querySelector('[data-wa-send-now]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      btn.disabled=true;
      try{
        const chosen=[...root.querySelectorAll('[data-wa-groups] input[type="checkbox"]:checked')].map(x=>x.value);
        if(!chosen.length)throw new Error('Selecione pelo menos um grupo.');
        await saveSettings({
          enabled:true,selected_groups:chosen,
          auto_send_on_publish:root.querySelector('[data-wa-auto]').checked
        });
        const count=await enqueueAuction(currentAuction.id,true);
        alert(count?count+' produto(s) enviados para a fila do WhatsApp.':'Nenhum produto novo para enviar.');
      }catch(err){alert('Não foi possível enviar: '+(err.message||err))}
      finally{btn.disabled=false}
    });
  }

  window.jpWhatsappPage=renderWhatsappPage;
  if(typeof pages!=='undefined')pages.whatsapp=[renderWhatsappPage,'WhatsApp','Conexão e envios automáticos'];

  const secondary=document.querySelector('#secondaryMenuBody');
  if(secondary&&!secondary.querySelector('[data-page="whatsapp"]')){
    const btn=document.createElement('button');
    btn.dataset.page='whatsapp';
    btn.textContent='💬 WhatsApp';
    btn.onclick=async()=>{
      document.querySelectorAll('#nav button[data-page]').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      await renderWhatsappPage();
      if(window.matchMedia('(max-width:650px)').matches&&typeof closeMobileMenu==='function')closeMobileMenu();
    };
    secondary.prepend(btn);
  }

  const style=document.createElement('style');
  style.textContent=`
    .wa-simple{max-width:860px}
    .wa-simple-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
    .wa-simple-head h2{margin:4px 0 6px}.wa-simple-head p{margin:0;color:#617267;max-width:620px}
    .wa-simple-head small,.wa-section>small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#7a8a80}
    .wa-online{background:#e9f8ef!important;color:#08783f!important}.wa-offline{background:#f3f4f6!important;color:#667085!important}
    .wa-error{padding:12px 14px;border:1px solid #fecaca;background:#fff7f7;color:#b42318;border-radius:12px;margin:16px 0}
    .wa-connect-card{margin-top:22px;border:1px solid #dce7e1;background:#fbfdfc;border-radius:18px;padding:22px;display:grid;grid-template-columns:52px 1fr auto;gap:15px;align-items:center}
    .wa-connect-icon{width:52px;height:52px;border-radius:16px;background:#e9f8ef;color:#08783f;display:grid;place-items:center;font-size:24px;font-weight:900}
    .wa-connect-card h3{margin:0 0 5px}.wa-connect-card p{margin:0;color:#617267}
    .wa-download-link{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;white-space:nowrap}
    .wa-local-code-wrap{margin-top:18px;padding:18px;border:1px solid #dce7e1;border-radius:16px;background:#f8fbf9}
    .wa-local-code-wrap>small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#7a8a80}
    .wa-local-code-wrap .wa-pair-code{margin:10px 0}
    .wa-local-code-wrap ol{margin:12px 0 0;padding-left:20px;color:#52645a}
    .wa-connect-main{min-height:44px}
    .wa-connect-started .wa-connect-main{display:none}
    .wa-setup{margin-top:14px;border:1px solid #dce7e1;border-radius:16px;padding:16px;background:#f8fbf9}
    .wa-step{display:flex;gap:10px;align-items:flex-start;margin:12px 0}.wa-step b{width:27px;height:27px;flex:0 0 27px;border-radius:50%;background:#173c2b;color:#fff;display:grid;place-items:center}
    .wa-download{display:inline-flex;align-items:center;text-decoration:none;margin:0 0 8px;padding:10px 14px;border-radius:10px}
    .wa-token-row{display:flex;gap:8px}.wa-token-row input{flex:1;min-width:0;font-family:monospace}
    .wa-connected{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:20px 0;padding:14px;border:1px solid #cfe8d9;background:#f2fbf5;border-radius:14px}
    .wa-connected-actions{display:flex;gap:7px;flex-wrap:wrap}
    .wa-phone{display:flex;gap:10px;align-items:center}.wa-phone>span{width:32px;height:32px;border-radius:50%;background:#0a8147;color:#fff;display:grid;place-items:center;font-weight:900}
    .wa-phone small{display:block;color:#75867c;font-size:9px;font-weight:900}.wa-phone b{display:block;margin-top:2px}.wa-phone em{display:block;margin-top:3px;color:#08783f;font-size:11px;font-style:normal;font-weight:750}
    .wa-section{margin-top:20px}.wa-section h3{margin:4px 0}.wa-section p{margin:0 0 12px}
    .wa-group-list{display:grid;gap:8px;margin:10px 0 18px}
    .wa-group-item{display:flex;gap:10px;align-items:center;border:1px solid #e1e9e4;background:#fff;padding:12px;border-radius:12px}
    .wa-simple-options{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}
    .wa-simple-options label{display:flex;gap:10px;align-items:flex-start;border:1px solid #e1e9e4;border-radius:13px;padding:13px;background:#fff}
    .wa-simple-options small{display:block;color:#849188;margin-top:3px}
    .wa-simple-actions{display:flex;gap:9px;flex-wrap:wrap}
    .wa-help{margin-top:20px;color:#617267}.wa-help summary{cursor:pointer;font-weight:800}
    .wa-connect-options{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}
    .wa-connect-options .wa-connect-card{margin-top:0;display:flex;flex-direction:column;align-items:stretch;text-align:left}
    .wa-connect-options .wa-connect-card>button{margin-top:auto}
    .wa-connect-options .wa-connect-card small,.wa-code-wrap>small,.wa-cloud-status-row small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#7a8a80}
    .wa-phone-input{display:flex;align-items:center;border:1px solid #ccd9d1;border-radius:11px;background:#fff;margin-top:12px;overflow:hidden}
    .wa-phone-input span{padding:11px 10px;background:#eef4f0;font-weight:800}.wa-phone-input input{border:0!important;outline:0;flex:1;min-width:0;padding:11px}
    .wa-cloud-state{margin-top:14px;border:1px solid #dce7e1;border-radius:17px;padding:18px;background:#f8fbf9}
    .wa-cloud-status-row{display:flex;gap:10px;align-items:center}.wa-cloud-status-row small,.wa-cloud-status-row b{display:block}.wa-cloud-status-row b{margin-top:2px}
    .wa-cloud-dot{width:11px;height:11px;border-radius:50%;background:#0b8148;box-shadow:0 0 0 5px #dff4e8}
    .wa-qr-wrap{text-align:center;margin-top:18px}.wa-qr-wrap img{display:block;max-width:320px;width:100%;margin:12px auto;border-radius:12px}
    .wa-code-wrap{margin-top:18px;text-align:center}.wa-pair-code{font:900 36px/1.1 monospace;letter-spacing:.12em;color:#173c2b;background:#fff;border:1px dashed #aac0b3;border-radius:14px;padding:18px;margin:7px auto 10px;max-width:380px}
    .wa-code-wrap ol{text-align:left;max-width:520px;margin:18px auto 0;color:#53645a;line-height:1.7}
    @media(max-width:650px){
      .wa-simple-head{flex-direction:column}.wa-connect-card{grid-template-columns:1fr;text-align:center}.wa-connect-icon{margin:auto}
      .wa-connect-main,.wa-download,.wa-setup>button{width:100%;justify-content:center}
      .wa-token-row{flex-direction:column}.wa-simple-options{grid-template-columns:1fr}.wa-simple-actions>*{width:100%}
      .wa-connected{align-items:flex-start;flex-direction:column}.wa-connected button{width:100%}
      .wa-connect-options{grid-template-columns:1fr}.wa-connect-options .wa-connect-card{text-align:left}.wa-connect-options .wa-connect-icon{margin:0}
      .wa-connect-options .wa-connect-card>button{width:100%}.wa-pair-code{font-size:29px}.wa-code-wrap ol{padding-left:22px}
    }
  `;
  document.head.appendChild(style);
})();