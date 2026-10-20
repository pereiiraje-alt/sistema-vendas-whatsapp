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

  function statusLabel(status){
    return ({ONLINE:'Conectado',OFFLINE:'Desconectado',CONECTANDO:'Conectando',
      AGUARDANDO_QR:'Aguardando QR Code',ERRO:'Erro'})[status]||status||'Desconectado';
  }

  async function renderWhatsappPage(){
    if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';
    title.textContent='WhatsApp';
    subtitle.textContent='Conecte uma vez, escolha os grupos e deixe o JP Leilões enviar';

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
          <h2>${online?'WhatsApp conectado':'Conecte seu WhatsApp'}</h2>
          <p>${online?'Pronto. Escolha abaixo os grupos que receberão seus leilões.':'Faça a conexão uma vez e depois use tudo pelo painel do JP Leilões.'}</p>
        </div>
        <span class="badge ${online?'wa-online':'wa-offline'}">${statusLabel(device?.status)}</span>
      </div>

      ${device?.last_error?`<div class="wa-error">${esc(device.last_error)}</div>`:''}

      ${online?`
        <div class="wa-connected">
          <div class="wa-phone"><span>✓</span><div><small>NÚMERO CONECTADO</small><b>${esc(device?.phone||'WhatsApp conectado')}</b></div></div>
          <button class="ghost mini" type="button" data-wa-refresh>Atualizar grupos</button>
        </div>

        <div class="wa-section">
          <small>GRUPOS</small>
          <h3>Onde você quer divulgar?</h3>
          <p class="muted">Marque somente os grupos autorizados para receber os leilões.</p>
          <div class="wa-group-list" data-wa-groups>
            ${groups.length?groups.map(g=>{
              const id=String(g.id||'');
              const name=String(g.name||id);
              return `<label class="wa-group-item"><input type="checkbox" value="${esc(id)}" ${selected.has(id)?'checked':''}><span><b>${esc(name)}</b></span></label>`;
            }).join(''):'<p class="muted">Nenhum grupo encontrado ainda. Clique em “Atualizar grupos”.</p>'}
          </div>
        </div>

        <div class="wa-simple-options">
          <label><input type="checkbox" data-wa-enabled ${settings.enabled?'checked':''}> <span><b>WhatsApp ativo</b><small>Permite os envios do JP Leilões</small></span></label>
          <label><input type="checkbox" data-wa-auto ${settings.auto_send_on_publish?'checked':''}> <span><b>Enviar ao publicar</b><small>Dispara automaticamente os produtos do leilão</small></span></label>
        </div>

        <div class="wa-simple-actions">
          <button class="primary" type="button" data-wa-save>Salvar</button>
          <button class="whatsapp" type="button" data-wa-send-now ${currentAuction?.id?'':'disabled'}>Enviar leilão atual</button>
        </div>
      `:`
        <div class="wa-connect-card">
          <div class="wa-connect-icon">◉</div>
          <div>
            <h3>Conectar WhatsApp</h3>
            <p>O JP Leilões prepara a conexão e mostra o passo a passo. Depois de conectado, seus grupos aparecem aqui automaticamente.</p>
          </div>
          <button class="primary wa-connect-main" type="button" data-wa-start>Conectar WhatsApp</button>
        </div>

        <div class="wa-setup" data-wa-setup hidden>
          <div class="wa-step"><b>1</b><span>Baixe e abra o conector uma única vez neste computador.</span></div>
          <a class="ghost wa-download" href="/instalar-jp-whatsapp.cmd" download>Baixar conector</a>
          <div class="wa-step"><b>2</b><span>Copie o código abaixo e cole no conector.</span></div>
          <div class="wa-token-row"><input readonly data-wa-token-value><button class="ghost" type="button" data-wa-copy>Copiar</button></div>
          <div class="wa-step"><b>3</b><span>Escaneie o QR Code que aparecer e volte para esta tela.</span></div>
          <button class="primary" type="button" data-wa-refresh>Já conectei · atualizar</button>
        </div>
      `}

      <details class="wa-help">
        <summary>Ajuda e conexão</summary>
        <p>Hoje a conexão usa uma sessão do WhatsApp Web. Depois de conectado, o uso normal é feito direto pelo painel.</p>
      </details>
    </section>`;

    const root=app.querySelector('.wa-simple');

    root.querySelector('[data-wa-start]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      btn.disabled=true;
      try{
        const token=await createDeviceToken();
        root.querySelector('[data-wa-token-value]').value=token;
        root.querySelector('[data-wa-setup]').hidden=false;
        btn.closest('.wa-connect-card').classList.add('wa-connect-started');
      }catch(err){alert('Não foi possível iniciar a conexão: '+(err.message||err))}
      finally{btn.disabled=false}
    });

    root.querySelector('[data-wa-copy]')?.addEventListener('click',async()=>{
      const value=root.querySelector('[data-wa-token-value]')?.value||'';
      if(!value)return;
      try{await navigator.clipboard.writeText(value);alert('Código copiado.')}catch{prompt('Copie o código:',value)}
    });

    root.querySelectorAll('[data-wa-refresh]').forEach(btn=>btn.addEventListener('click',()=>renderWhatsappPage()));

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
    .wa-connect-main{min-height:44px}
    .wa-connect-started .wa-connect-main{display:none}
    .wa-setup{margin-top:14px;border:1px solid #dce7e1;border-radius:16px;padding:16px;background:#f8fbf9}
    .wa-step{display:flex;gap:10px;align-items:flex-start;margin:12px 0}.wa-step b{width:27px;height:27px;flex:0 0 27px;border-radius:50%;background:#173c2b;color:#fff;display:grid;place-items:center}
    .wa-download{display:inline-flex;align-items:center;text-decoration:none;margin:0 0 8px;padding:10px 14px;border-radius:10px}
    .wa-token-row{display:flex;gap:8px}.wa-token-row input{flex:1;min-width:0;font-family:monospace}
    .wa-connected{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:20px 0;padding:14px;border:1px solid #cfe8d9;background:#f2fbf5;border-radius:14px}
    .wa-phone{display:flex;gap:10px;align-items:center}.wa-phone>span{width:32px;height:32px;border-radius:50%;background:#0a8147;color:#fff;display:grid;place-items:center;font-weight:900}
    .wa-phone small{display:block;color:#75867c;font-size:9px;font-weight:900}.wa-phone b{display:block;margin-top:2px}
    .wa-section{margin-top:20px}.wa-section h3{margin:4px 0}.wa-section p{margin:0 0 12px}
    .wa-group-list{display:grid;gap:8px;margin:10px 0 18px}
    .wa-group-item{display:flex;gap:10px;align-items:center;border:1px solid #e1e9e4;background:#fff;padding:12px;border-radius:12px}
    .wa-simple-options{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}
    .wa-simple-options label{display:flex;gap:10px;align-items:flex-start;border:1px solid #e1e9e4;border-radius:13px;padding:13px;background:#fff}
    .wa-simple-options small{display:block;color:#849188;margin-top:3px}
    .wa-simple-actions{display:flex;gap:9px;flex-wrap:wrap}
    .wa-help{margin-top:20px;color:#617267}.wa-help summary{cursor:pointer;font-weight:800}
    @media(max-width:650px){
      .wa-simple-head{flex-direction:column}.wa-connect-card{grid-template-columns:1fr;text-align:center}.wa-connect-icon{margin:auto}
      .wa-connect-main,.wa-download,.wa-setup>button{width:100%;justify-content:center}
      .wa-token-row{flex-direction:column}.wa-simple-options{grid-template-columns:1fr}.wa-simple-actions>*{width:100%}
      .wa-connected{align-items:flex-start;flex-direction:column}.wa-connected button{width:100%}
    }
  `;
  document.head.appendChild(style);
})();