(()=>{
  const GATEWAY_API='/api/whatsapp-gateway';
  let pollTimer=null;

  function tokenKey(){
    return currentCompany?.id?'jp_whatsapp_gateway_'+currentCompany.id:'jp_whatsapp_gateway';
  }
  function getToken(){
    try{return localStorage.getItem(tokenKey())||''}catch{return ''}
  }
  function setToken(token){
    try{localStorage.setItem(tokenKey(),token)}catch{}
  }
  function clearToken(){
    try{localStorage.removeItem(tokenKey())}catch{}
  }
  function stopPolling(){
    if(pollTimer){clearInterval(pollTimer);pollTimer=null}
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
      .select('status,phone,available_groups,last_seen,last_error,updated_at,worker_version')
      .eq('company_id',currentCompany.id).maybeSingle();
    if(error)throw error;
    return data||null;
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
    setToken(token);
    return token;
  }

  async function ensureToken(){
    return getToken()||await createDeviceToken();
  }

  async function gatewayRequest(path,body={}){
    const token=getToken();
    if(!token)throw new Error('Inicie uma nova conexão do WhatsApp.');

    const sessionResult=await db.auth.getSession();
    const accessToken=sessionResult?.data?.session?.access_token;
    if(!accessToken)throw new Error('Sessão da empresa expirada. Entre novamente.');

    const action=String(path||'').replace(/^\/+|\/+$/g,'');
    const response=await fetch(GATEWAY_API,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${accessToken}`
      },
      body:JSON.stringify({action,token,...body}),
      cache:'no-store'
    });
    const raw=await response.text();
    let data={};
    try{data=raw?JSON.parse(raw):{}}catch{data={error:raw}}
    if(!response.ok)throw new Error(data?.error||'Falha na conexão com o WhatsApp.');
    return data;
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
        p_lot_id:lotId,p_force:!!force
      });
      if(error)throw error;
      const count=Number(data||0);
      if(!silent)alert(count?'Produto enviado para a fila do WhatsApp.':'Este produto já estava na fila ou já foi enviado.');
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
      const device=await getDevice();
      return {
        online:device?.status==='ONLINE',
        phone:device?.phone||null,
        groups:Array.isArray(device?.available_groups)?device.available_groups:[]
      };
    }catch(e){
      return {online:false,groups:[],phone:null,error:e.message||String(e)};
    }
  };

  window.jpWhatsappSendLotToGroups=async function(lotId,groupIds,{silent=false}={}){
    if(!currentCompany?.id||!lotId)return false;
    const ids=[...new Set((groupIds||[]).map(String).filter(Boolean))];
    if(!ids.length)return false;
    try{
      const {data,error}=await db.rpc('enqueue_company_whatsapp_lot_groups',{
        p_lot_id:lotId,p_group_ids:ids
      });
      if(error)throw error;
      const count=Number(data||0);
      if(!silent)alert(count?'Produto enviado para os grupos selecionados.':'Este produto já estava na fila para estes grupos.');
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
        p_phone:String(phone||''),p_message:text
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
    return ({
      ONLINE:'Conectado',
      OFFLINE:'Desconectado',
      CONECTANDO:'Conectando...',
      AGUARDANDO_QR:'Aguardando QR Code',
      AGUARDANDO_CODIGO:'Aguardando código',
      ERRO:'Erro'
    })[status]||status||'Desconectado';
  }

  function renderState(root,state){
    const wrap=root.querySelector('[data-wa-state]');
    if(!wrap)return;
    wrap.hidden=false;

    const status=root.querySelector('[data-wa-status]');
    if(status)status.textContent=statusLabel(state?.status);

    const qrWrap=root.querySelector('[data-wa-qr-wrap]');
    const qrImg=root.querySelector('[data-wa-qr-img]');
    if(qrWrap){
      qrWrap.hidden=!state?.qr;
      if(state?.qr&&qrImg)qrImg.src=state.qr;
    }

    const codeWrap=root.querySelector('[data-wa-code-wrap]');
    const codeEl=root.querySelector('[data-wa-code]');
    if(codeWrap){
      codeWrap.hidden=!state?.pairingCode;
      if(state?.pairingCode&&codeEl){
        const value=String(state.pairingCode).replace(/\s/g,'');
        codeEl.textContent=value.replace(/(.{4})/g,'$1 ').trim();
        codeEl.dataset.value=value;
      }
    }

    const err=root.querySelector('[data-wa-error]');
    const message=state?.error||state?.lastError||'';
    if(err){err.hidden=!message;err.textContent=message}
  }

  function watchConnection(root){
    stopPolling();
    let failures=0;
    pollTimer=setInterval(async()=>{
      try{
        const state=await gatewayRequest('/status');
        failures=0;
        renderState(root,state);
        if(state.status==='ONLINE'){
          stopPolling();
          setTimeout(()=>renderWhatsappPage(),600);
        }
      }catch(e){
        failures++;
        const err=root.querySelector('[data-wa-error]');
        if(err){err.hidden=false;err.textContent=e.message||String(e)}
        if(failures>=5)stopPolling();
      }
    },1800);
  }

  async function renderWhatsappPage(){
    if(!currentCompany){
      app.innerHTML='<div class="panel">Faça login como empresa.</div>';
      return;
    }

    title.textContent='WhatsApp';
    subtitle.textContent='Conecte pelo celular uma vez e use os envios automáticos';

    let settings,device;
    try{
      settings=await getSettings();
      device=await getDevice();
    }catch(e){
      app.innerHTML='<div class="panel"><h3>WhatsApp</h3><p>'+esc(e.message||e)+'</p></div>';
      return;
    }

    const groups=Array.isArray(device?.available_groups)?device.available_groups:[];
    const online=device?.status==='ONLINE';
    const centralReady=online&&String(device?.worker_version||'').startsWith('central-');

    app.innerHTML=`<section class="panel wa-simple">
      <div class="wa-simple-head">
        <div>
          <small>WHATSAPP AUTOMÁTICO</small>
          <h2>${centralReady?'✅ WhatsApp conectado':online?'⚠️ Atualize a conexão':'Conecte seu WhatsApp pelo celular'}</h2>
          <p>${centralReady
            ?'Pronto para enviar leilões, mensagens aos compradores e lembretes automaticamente.'
            :online
              ?'Existe uma conexão antiga. Faça a nova conexão pelo celular para usar o gateway central.'
              :'Não precisa instalar programa nem deixar computador ligado.'}</p>
        </div>
        <span class="badge ${online?'wa-online':'wa-offline'}">${statusLabel(device?.status)}</span>
      </div>

      ${device?.last_error?`<div class="wa-error">${esc(device.last_error)}</div>`:''}

      ${centralReady?`
        <div class="wa-connected">
          <div class="wa-phone">
            <span>✓</span>
            <div>
              <small>WHATSAPP CONECTADO</small>
              <b>${esc(device?.phone||'Conta conectada')}</b>
              <em>Gateway central ativo • computador não precisa ficar ligado</em>
            </div>
          </div>
          <div class="wa-connected-actions">
            <button class="ghost mini" type="button" data-wa-refresh>Atualizar</button>
            ${getToken()?'<button class="ghost mini" type="button" data-wa-disconnect>Desconectar</button>':''}
          </div>
        </div>

        <div class="wa-section">
          <small>GRUPOS DISPONÍVEIS</small>
          <h3>Escolha os grupos ao criar cada produto</h3>
          <p class="muted">Os grupos abaixo são carregados automaticamente da conta conectada.</p>
          <div class="wa-group-list">
            ${groups.length?groups.map(g=>`<div class="wa-group-item"><span>💬</span><b>${esc(String(g.name||g.id||'Grupo'))}</b></div>`).join(''):'<p class="muted">Nenhum grupo encontrado ainda.</p>'}
          </div>
        </div>
      `:`
        <div class="wa-mobile-connect">
          <div class="wa-connect-card">
            <div class="wa-connect-icon">📱</div>
            <div>
              <small>RECOMENDADO • FUNCIONA SÓ COM CELULAR</small>
              <h3>Conectar com código</h3>
              <p>Digite o número com DDD. O JP Leilões gera um código para vincular sua conta do WhatsApp.</p>
              <div class="wa-phone-input">
                <span>+55</span>
                <input data-wa-phone-input inputmode="numeric" autocomplete="tel" placeholder="41 99999-9999">
              </div>
            </div>
            <button class="primary" type="button" data-wa-phone-start>Gerar código</button>
          </div>

          <button class="ghost wa-qr-button" type="button" data-wa-qr-start>Estou em outro aparelho — mostrar QR Code</button>

          <div class="wa-cloud-state" data-wa-state hidden>
            <div class="wa-cloud-status-row">
              <span class="wa-cloud-dot"></span>
              <div><small>STATUS DA CONEXÃO</small><b data-wa-status>Conectando...</b></div>
            </div>

            <div class="wa-code-wrap" data-wa-code-wrap hidden>
              <small>CÓDIGO DE VINCULAÇÃO</small>
              <div class="wa-pair-code" data-wa-code></div>
              <button class="ghost mini" type="button" data-wa-copy-code>Copiar código</button>
              <ol>
                <li>Abra o WhatsApp no celular.</li>
                <li>Entre em <b>Aparelhos conectados</b>.</li>
                <li>Toque em <b>Conectar um aparelho</b>.</li>
                <li>Escolha <b>Conectar com número de telefone</b> ou opção equivalente.</li>
                <li>Digite o código mostrado acima.</li>
              </ol>
            </div>

            <div class="wa-qr-wrap" data-wa-qr-wrap hidden>
              <h3>Escaneie este QR Code no WhatsApp</h3>
              <img data-wa-qr-img alt="QR Code do WhatsApp">
            </div>

            <div class="wa-error" data-wa-error hidden></div>
          </div>
        </div>
      `}

      <details class="wa-help">
        <summary>Como funciona?</summary>
        <p>Depois da primeira conexão, a sessão fica salva no gateway central do JP Leilões. O cliente pode fechar o navegador e continuar usando somente o celular. Se o WhatsApp encerrar a sessão, basta conectar novamente.</p>
      </details>
    </section>`;

    const root=app.querySelector('.wa-simple');

    root.querySelector('[data-wa-phone-start]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      let phone=String(root.querySelector('[data-wa-phone-input]')?.value||'').replace(/\D/g,'');
      if(!phone)return alert('Informe o número do WhatsApp com DDD.');
      btn.disabled=true;
      try{
        if(!getToken())await createDeviceToken();
        const state=await gatewayRequest('/pairing-code',{phone});
        renderState(root,state);
        watchConnection(root);
      }catch(err){
        alert('Não foi possível gerar o código: '+(err.message||err));
      }finally{btn.disabled=false}
    });

    root.querySelector('[data-wa-qr-start]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      btn.disabled=true;
      try{
        if(!getToken())await createDeviceToken();
        const state=await gatewayRequest('/connect');
        renderState(root,state);
        watchConnection(root);
      }catch(err){
        alert('Não foi possível iniciar a conexão: '+(err.message||err));
      }finally{btn.disabled=false}
    });

    root.querySelector('[data-wa-copy-code]')?.addEventListener('click',async()=>{
      const el=root.querySelector('[data-wa-code]');
      const value=el?.dataset.value||el?.textContent||'';
      if(!value)return;
      try{
        await navigator.clipboard.writeText(value);
        alert('Código copiado.');
      }catch{
        prompt('Copie o código:',value);
      }
    });

    root.querySelectorAll('[data-wa-refresh]').forEach(btn=>btn.addEventListener('click',()=>renderWhatsappPage()));

    root.querySelector('[data-wa-disconnect]')?.addEventListener('click',async e=>{
      if(!confirm('Desconectar este WhatsApp do JP Leilões?'))return;
      const btn=e.currentTarget;
      btn.disabled=true;
      try{
        await gatewayRequest('/disconnect');
        clearToken();
        await renderWhatsappPage();
      }catch(err){
        alert('Não foi possível desconectar: '+(err.message||err));
      }finally{btn.disabled=false}
    });
  }

  window.jpWhatsappPage=renderWhatsappPage;
  if(typeof pages!=='undefined')pages.whatsapp=[renderWhatsappPage,'WhatsApp','Conexão e envios automáticos'];

  const style=document.createElement('style');
  style.textContent=`
    .wa-simple{max-width:860px}
    .wa-simple-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
    .wa-simple-head h2{margin:4px 0 6px}.wa-simple-head p{margin:0;color:#617267;max-width:620px}
    .wa-simple-head small,.wa-section>small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#7a8a80}
    .wa-online{background:#e9f8ef!important;color:#08783f!important}.wa-offline{background:#f3f4f6!important;color:#667085!important}
    .wa-error{padding:12px 14px;border:1px solid #fecaca;background:#fff7f7;color:#b42318;border-radius:12px;margin:16px 0}
    .wa-connected{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:20px 0;padding:14px;border:1px solid #cfe8d9;background:#f2fbf5;border-radius:14px}
    .wa-connected-actions{display:flex;gap:7px;flex-wrap:wrap}
    .wa-phone{display:flex;gap:10px;align-items:center}.wa-phone>span{width:32px;height:32px;border-radius:50%;background:#0a8147;color:#fff;display:grid;place-items:center;font-weight:900}
    .wa-phone small{display:block;color:#75867c;font-size:9px;font-weight:900}.wa-phone b{display:block;margin-top:2px}.wa-phone em{display:block;margin-top:3px;color:#08783f;font-size:11px;font-style:normal;font-weight:750}
    .wa-section{margin-top:20px}.wa-section h3{margin:4px 0}.wa-section p{margin:0 0 12px}
    .wa-group-list{display:grid;gap:8px;margin:10px 0 18px}.wa-group-item{display:flex;gap:10px;align-items:center;border:1px solid #e1e9e4;background:#fff;padding:12px;border-radius:12px}
    .wa-mobile-connect{margin-top:22px}
    .wa-connect-card{border:1px solid #dce7e1;background:#fbfdfc;border-radius:18px;padding:22px;display:grid;grid-template-columns:52px 1fr auto;gap:15px;align-items:center}
    .wa-connect-icon{width:52px;height:52px;border-radius:16px;background:#e9f8ef;color:#08783f;display:grid;place-items:center;font-size:24px;font-weight:900}
    .wa-connect-card h3{margin:0 0 5px}.wa-connect-card p{margin:0;color:#617267}.wa-connect-card small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#7a8a80}
    .wa-phone-input{display:flex;align-items:center;border:1px solid #ccd9d1;border-radius:11px;background:#fff;margin-top:12px;overflow:hidden}
    .wa-phone-input span{padding:11px 10px;background:#eef4f0;font-weight:800}.wa-phone-input input{border:0!important;outline:0;flex:1;min-width:0;padding:11px}
    .wa-qr-button{margin-top:10px}
    .wa-cloud-state{margin-top:14px;border:1px solid #dce7e1;border-radius:17px;padding:18px;background:#f8fbf9}
    .wa-cloud-status-row{display:flex;gap:10px;align-items:center}.wa-cloud-status-row small,.wa-code-wrap>small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#7a8a80}.wa-cloud-status-row b{display:block;margin-top:2px}
    .wa-cloud-dot{width:11px;height:11px;border-radius:50%;background:#0b8148;box-shadow:0 0 0 5px #dff4e8}
    .wa-code-wrap{margin-top:18px;text-align:center}.wa-pair-code{font:900 36px/1.1 monospace;letter-spacing:.12em;color:#173c2b;background:#fff;border:1px dashed #aac0b3;border-radius:14px;padding:18px;margin:7px auto 10px;max-width:380px}
    .wa-code-wrap ol{text-align:left;max-width:520px;margin:18px auto 0;color:#53645a;line-height:1.7}
    .wa-qr-wrap{text-align:center;margin-top:18px}.wa-qr-wrap img{display:block;max-width:320px;width:100%;margin:12px auto;border-radius:12px}
    .wa-help{margin-top:20px;color:#617267}.wa-help summary{cursor:pointer;font-weight:800}
    @media(max-width:650px){
      .wa-simple-head{flex-direction:column}
      .wa-connect-card{grid-template-columns:1fr;text-align:left}
      .wa-connect-icon{margin:0}
      .wa-connect-card>button,.wa-qr-button{width:100%}
      .wa-connected{align-items:flex-start;flex-direction:column}.wa-connected button{width:100%}
      .wa-pair-code{font-size:29px}.wa-code-wrap ol{padding-left:22px}
    }
  `;
  document.head.appendChild(style);
})();