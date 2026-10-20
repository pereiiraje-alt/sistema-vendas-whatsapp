(()=>{
  async function getSettings(){
    if(!currentCompany?.id)return null;
    let {data,error}=await db.from('company_whatsapp_settings').select('*').eq('company_id',currentCompany.id).maybeSingle();
    if(error)throw error;
    if(!data){
      const inserted=await db.from('company_whatsapp_settings').insert({
        company_id:currentCompany.id,
        enabled:false,
        auto_send_on_publish:false,
        selected_groups:[]
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
      .eq('company_id',currentCompany.id)
      .maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function saveSettings(patch){
    const {data,error}=await db.from('company_whatsapp_settings')
      .update({...patch,updated_at:new Date().toISOString()})
      .eq('company_id',currentCompany.id)
      .select()
      .single();
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
    return ({
      ONLINE:'Conectado',
      OFFLINE:'Desconectado',
      CONECTANDO:'Conectando',
      AGUARDANDO_QR:'Aguardando QR Code',
      ERRO:'Erro'
    })[status]||status||'Desconectado';
  }

  async function renderWhatsappPage(){
    if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';
    title.textContent='WhatsApp automático';
    subtitle.textContent='Envio de foto + dados do leilão para grupos autorizados';

    let settings,device;
    try{
      settings=await getSettings();
      device=await getDevice();
    }catch(e){
      app.innerHTML='<div class="panel"><h3>WhatsApp automático</h3><p>'+esc(e.message||e)+'</p></div>';
      return;
    }

    const groups=Array.isArray(device?.available_groups)?device.available_groups:[];
    const selected=new Set(Array.isArray(settings?.selected_groups)?settings.selected_groups:[]);
    const online=device?.status==='ONLINE';
    const lastSeen=device?.last_seen?new Date(device.last_seen).toLocaleString('pt-BR'):'Nunca';

    app.innerHTML=`<section class="panel wa-auto-panel">
      <div class="wa-auto-head">
        <div>
          <small>ENVIO SEM API OFICIAL</small>
          <h2>WhatsApp dos leilões</h2>
          <p>O computador conectado envia automaticamente a foto real de cada produto, os valores e o link do lance para os grupos escolhidos.</p>
        </div>
        <span class="badge ${online?'wa-online':'wa-offline'}">${statusLabel(device?.status)}</span>
      </div>

      <div class="wa-device-card">
        <div><small>NÚMERO CONECTADO</small><b>${esc(device?.phone||'Nenhum')}</b></div>
        <div><small>ÚLTIMO SINAL DO COMPUTADOR</small><b>${esc(lastSeen)}</b></div>
        <div><small>GRUPOS ENCONTRADOS</small><b>${groups.length}</b></div>
      </div>

      ${device?.last_error?`<div class="wa-error">${esc(device.last_error)}</div>`:''}

      <div class="wa-setup-box">
        <div><small>PASSO 1</small><h3>Conectar o computador</h3><p>Instale o conector no computador que ficará ligado, depois gere o código e conecte o WhatsApp pelo QR Code.</p></div>
        <div class="wa-auto-actions">
          <a class="ghost wa-download" href="/instalar-jp-whatsapp.cmd" download>⬇ Baixar instalador do computador</a>
          <button class="primary" type="button" data-wa-generate>Gerar código do computador</button>
        </div>
        <div class="wa-token-box" data-wa-token hidden>
          <label>Código de conexão</label>
          <div><input readonly data-wa-token-value><button class="ghost" type="button" data-wa-copy>Copiar</button></div>
          <small>Esse código aparece uma única vez. Cole no programa do computador e depois escaneie o QR Code do WhatsApp.</small>
        </div>
      </div>

      <div class="wa-auto-options">
        <label><input type="checkbox" data-wa-enabled ${settings.enabled?'checked':''}> Ativar integração do WhatsApp</label>
        <label><input type="checkbox" data-wa-auto ${settings.auto_send_on_publish?'checked':''}> Enviar automaticamente quando o leilão for publicado</label>
      </div>

      <div class="wa-auto-groups-head">
        <div><small>PASSO 2</small><h3>Escolha os grupos autorizados</h3><p class="muted">Os grupos aparecem quando o programa do computador está conectado ao WhatsApp.</p></div>
        <button class="ghost mini" type="button" data-wa-refresh>Atualizar grupos</button>
      </div>

      <div class="wa-group-list" data-wa-groups>
        ${groups.length?groups.map(g=>{
          const id=String(g.id||'');
          const name=String(g.name||id);
          return `<label class="wa-group-item"><input type="checkbox" value="${esc(id)}" ${selected.has(id)?'checked':''}><span><b>${esc(name)}</b><small>${esc(id)}</small></span></label>`;
        }).join(''):'<p class="muted">Nenhum grupo carregado ainda. Abra o programa no computador, conecte o WhatsApp e clique em “Atualizar grupos”.</p>'}
      </div>

      <div class="wa-auto-actions">
        <button class="primary" type="button" data-wa-save>Salvar configuração</button>
        <button class="whatsapp" type="button" data-wa-send-now ${currentAuction?.id?'':'disabled'}>Enviar leilão atual agora</button>
      </div>

      <div class="wa-queue-note">
        <b>Como funciona:</b> ao publicar, o JP Leilões coloca cada produto em uma fila segura. O computador conectado pega essa fila e manda a foto + mensagem para os grupos selecionados.
      </div>
      <p class="muted wa-auto-note">O computador precisa permanecer ligado com o programa aberto. Como não usa a API oficial, o WhatsApp pode pedir um novo QR Code em algumas situações.</p>
    </section>`;

    const root=app.querySelector('.wa-auto-panel');

    root.querySelector('[data-wa-generate]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      btn.disabled=true;
      try{
        const token=await createDeviceToken();
        const box=root.querySelector('[data-wa-token]');
        const input=root.querySelector('[data-wa-token-value]');
        input.value=token;
        box.hidden=false;
        alert('Código gerado. Agora abra o programa JP Leilões WhatsApp no computador e cole este código.');
      }catch(err){alert('Não foi possível gerar o código: '+(err.message||err))}
      finally{btn.disabled=false}
    });

    root.querySelector('[data-wa-copy]')?.addEventListener('click',async()=>{
      const value=root.querySelector('[data-wa-token-value]')?.value||'';
      if(!value)return;
      try{await navigator.clipboard.writeText(value);alert('Código copiado.')}catch{prompt('Copie o código:',value)}
    });

    root.querySelector('[data-wa-refresh]')?.addEventListener('click',()=>renderWhatsappPage());

    root.querySelector('[data-wa-save]')?.addEventListener('click',async()=>{
      const chosen=[...root.querySelectorAll('[data-wa-groups] input[type="checkbox"]:checked')].map(x=>x.value);
      try{
        await saveSettings({
          enabled:root.querySelector('[data-wa-enabled]').checked,
          auto_send_on_publish:root.querySelector('[data-wa-auto]').checked,
          selected_groups:chosen
        });
        alert('Configuração salva.');
        await renderWhatsappPage();
      }catch(e){alert('Não foi possível salvar: '+(e.message||e))}
    });

    root.querySelector('[data-wa-send-now]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      btn.disabled=true;
      try{
        const chosen=[...root.querySelectorAll('[data-wa-groups] input[type="checkbox"]:checked')].map(x=>x.value);
        if(!chosen.length)throw new Error('Selecione pelo menos um grupo.');
        settings=await saveSettings({
          enabled:true,
          selected_groups:chosen,
          auto_send_on_publish:root.querySelector('[data-wa-auto]').checked
        });
        const count=await enqueueAuction(currentAuction.id,true);
        alert(count?count+' produto(s) adicionado(s) à fila de envio.':'Nenhum produto novo para enviar.');
      }catch(err){alert('Não foi possível enviar: '+(err.message||err))}
      finally{btn.disabled=false}
    });
  }

  window.jpWhatsappPage=renderWhatsappPage;
  if(typeof pages!=='undefined')pages.whatsapp=[renderWhatsappPage,'WhatsApp automático','Envio automático de fotos para grupos'];

  const secondary=document.querySelector('#secondaryMenuBody');
  if(secondary&&!secondary.querySelector('[data-page="whatsapp"]')){
    const btn=document.createElement('button');
    btn.dataset.page='whatsapp';
    btn.textContent='💬 WhatsApp automático';
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
    .wa-auto-panel{max-width:980px}
    .wa-auto-head,.wa-auto-groups-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
    .wa-auto-head h2,.wa-auto-groups-head h3,.wa-setup-box h3{margin:4px 0 6px}
    .wa-auto-head p,.wa-setup-box p{margin:0;color:#617267}
    .wa-online{background:#e9f8ef!important;color:#08783f!important}.wa-offline{background:#f3f4f6!important;color:#667085!important}
    .wa-device-card{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}
    .wa-device-card>div{border:1px solid #e2e9e5;border-radius:14px;padding:13px;background:#fbfcfb;display:flex;flex-direction:column;gap:5px}
    .wa-device-card small,.wa-setup-box small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#7a8a80}
    .wa-device-card b{font-size:14px}
    .wa-error{padding:12px 14px;border:1px solid #fecaca;background:#fff7f7;color:#b42318;border-radius:12px;margin:12px 0}
    .wa-setup-box{border:1px solid #dce7e1;background:#f8fbf9;border-radius:16px;padding:16px;margin:18px 0}
    .wa-setup-box>.primary{margin-top:13px}
    .wa-token-box{margin-top:14px;padding:13px;border-radius:12px;background:#fff;border:1px solid #dce7e1}
    .wa-token-box>div{display:flex;gap:8px;margin:7px 0}.wa-token-box input{flex:1;min-width:0;font-family:monospace;font-size:13px}
    .wa-auto-options{display:grid;gap:10px;margin:18px 0 22px}
    .wa-auto-options label{display:flex;gap:9px;align-items:center;font-weight:700}
    .wa-group-list{display:grid;gap:8px;margin:12px 0 18px}
    .wa-group-item{display:flex;gap:10px;align-items:center;border:1px solid #e1e9e4;background:#fff;padding:11px 12px;border-radius:12px}
    .wa-group-item span{display:flex;flex-direction:column;min-width:0}.wa-group-item small{color:#849188;overflow-wrap:anywhere}
    .wa-auto-actions{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}\n    .wa-download{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;min-height:42px;box-sizing:border-box}
    .wa-queue-note{padding:12px 14px;border:1px solid #bbdfca;background:#f0faf4;border-radius:12px;color:#245f3e;margin-top:16px}
    .wa-auto-note{margin-top:12px}
    @media(max-width:650px){
      .wa-auto-head,.wa-auto-groups-head{flex-direction:column}
      .wa-device-card{grid-template-columns:1fr}
      .wa-auto-actions>*{width:100%}
      .wa-token-box>div{flex-direction:column}
      .wa-token-box button{width:100%}
    }
  `;
  document.head.appendChild(style);
})();