(()=>{
  const DEFAULT_GATEWAY='';
  const apiHeaders=async()=>{
    const {data}=await db.auth.getSession();
    const token=data?.session?.access_token;
    if(!token)throw new Error('Sessão expirada. Entre novamente.');
    return {'Content-Type':'application/json',Authorization:'Bearer '+token};
  };

  async function getSettings(){
    if(!currentCompany?.id)return null;
    let {data,error}=await db.from('company_whatsapp_settings').select('*').eq('company_id',currentCompany.id).maybeSingle();
    if(error)throw error;
    if(!data){
      const payload={company_id:currentCompany.id,enabled:false,auto_send_on_publish:false,selected_groups:[],gateway_url:DEFAULT_GATEWAY||null};
      const inserted=await db.from('company_whatsapp_settings').insert(payload).select().single();
      if(inserted.error)throw inserted.error;
      data=inserted.data;
    }
    return data;
  }

  async function saveSettings(patch){
    const payload={...patch,updated_at:new Date().toISOString()};
    const {data,error}=await db.from('company_whatsapp_settings').update(payload).eq('company_id',currentCompany.id).select().single();
    if(error)throw error;
    return data;
  }

  function gatewayOf(settings){
    return String(settings?.gateway_url||DEFAULT_GATEWAY||'').replace(/\/$/,'');
  }

  async function gw(path,{method='GET',body=null,settings=null}={}){
    settings=settings||await getSettings();
    const base=gatewayOf(settings);
    if(!base)throw new Error('Gateway do WhatsApp ainda não configurado.');
    const headers=await apiHeaders();
    const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||data.message||'Falha na comunicação com o WhatsApp.');
    return data;
  }

  async function refreshStatus(root,settings){
    try{
      const st=await gw('/status',{settings});
      const status=st.status||'OFFLINE';
      const label={ONLINE:'Conectado',OFFLINE:'Desconectado',CONNECTING:'Conectando',CONECTANDO:'Conectando',WAITING_QR:'Aguardando QR Code',AGUARDANDO_QR:'Aguardando QR Code',ERROR:'Erro',ERRO:'Erro'}[status]||status;
      const badge=root.querySelector('[data-wa-status]');
      if(badge)badge.textContent=label;
      const phone=root.querySelector('[data-wa-phone]');
      if(phone)phone.textContent=st.phone?('Número conectado: '+st.phone):'Nenhum número conectado';
      const qr=root.querySelector('[data-wa-qr]');
      if(qr){
        if(st.qr_data_url||st.qr){
          qr.innerHTML='<p><b>Escaneie o QR Code no WhatsApp</b></p><img src="'+esc(st.qr_data_url||st.qr)+'" alt="QR Code do WhatsApp">';
        }else qr.innerHTML='';
      }
      if(['ONLINE'].includes(status))await loadGroups(root,settings);
      if(['CONNECTING','CONECTANDO','WAITING_QR','AGUARDANDO_QR'].includes(status))setTimeout(()=>{if(root.isConnected)refreshStatus(root,settings)},2500);
    }catch(e){
      const badge=root.querySelector('[data-wa-status]');
      if(badge)badge.textContent='Indisponível';
      const err=root.querySelector('[data-wa-error]');
      if(err)err.textContent=e.message||e;
    }
  }

  async function loadGroups(root,settings){
    const box=root.querySelector('[data-wa-groups]');
    if(!box)return;
    try{
      const result=await gw('/groups',{settings});
      const groups=Array.isArray(result)?result:(result.groups||[]);
      const selected=new Set(Array.isArray(settings.selected_groups)?settings.selected_groups:[]);
      box.innerHTML=groups.length?groups.map(g=>{
        const id=String(g.id||g.group_id||'');
        const name=String(g.name||g.subject||id);
        return '<label class="wa-group-item"><input type="checkbox" value="'+esc(id)+'" '+(selected.has(id)?'checked':'')+'><span><b>'+esc(name)+'</b><small>'+esc(id)+'</small></span></label>';
      }).join(''):'<p class="muted">Nenhum grupo encontrado neste WhatsApp.</p>';
    }catch(e){box.innerHTML='<p class="muted">'+esc(e.message||e)+'</p>'}
  }

  async function sendLot(lot,settings){
    const groups=Array.isArray(settings.selected_groups)?settings.selected_groups.filter(Boolean):[];
    if(!groups.length)throw new Error('Selecione pelo menos um grupo do WhatsApp.');
    if(!lot?.image)throw new Error('O produto precisa ter uma foto para envio automático.');
    const link=typeof offerShareUrl==='function'?offerShareUrl(lot.id):(location.origin+'/?lote='+encodeURIComponent(lot.id));
    const caption='🔨 *'+(lot.name||'JP Leilões')+'*\n\n*Produto:* #'+(lot.number||'-')+'\n*Avaliação:* '+money(lot.valuation)+'\n*Lance inicial:* '+money(lot.start)+'\n*Oferta atual:* '+money(lot.current)+'\n*Acréscimo:* '+money(lot.step)+'\n*Termina:* '+(lot.ends?endTime(lot.ends):'a definir')+'\n\n👉 Dê seu lance:\n'+link;
    return gw('/send',{
      method:'POST',
      settings,
      body:{
        groups,
        image_url:lot.image,
        caption,
        idempotency_key:'lot:'+lot.id+':'+String(lot.current||lot.start||0)
      }
    });
  }

  window.jpWhatsappSendAuction=async function(auctionId,{silent=false}={}){
    if(!currentCompany?.id)return false;
    const settings=await getSettings();
    if(!settings?.enabled||!settings?.auto_send_on_publish)return false;
    if(!gatewayOf(settings))return false;
    const {data,error}=await db.from('lots').select('*').eq('auction_id',auctionId).eq('company_id',currentCompany.id).order('lot_number');
    if(error)throw error;
    const auctionLots=(data||[]).map(normalize);
    if(!auctionLots.length)return false;
    let sent=0,failed=0;
    for(const lot of auctionLots){
      try{await sendLot(lot,settings);sent++}
      catch(e){failed++;console.warn('WhatsApp automático:',e)}
      await new Promise(r=>setTimeout(r,1200));
    }
    if(!silent)alert('WhatsApp: '+sent+' produto(s) enviado(s)'+(failed?' · '+failed+' falha(s)':'')+'.');
    return sent>0;
  };

  async function renderWhatsappPage(){
    if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';
    title.textContent='WhatsApp automático';
    subtitle.textContent='Conecte por QR Code e envie fotos dos produtos para seus grupos';
    let settings;
    try{settings=await getSettings()}catch(e){app.innerHTML='<div class="panel"><h3>WhatsApp automático</h3><p>'+esc(e.message||e)+'</p></div>';return}
    const base=gatewayOf(settings);
    app.innerHTML=`<section class="panel wa-auto-panel">
      <div class="wa-auto-head"><div><small>AUTOMAÇÃO</small><h2>WhatsApp dos leilões</h2><p>Conecte um número por QR Code, escolha os grupos e envie a foto real do produto junto com os dados do leilão.</p></div><span class="badge" data-wa-status>Carregando...</span></div>
      <div class="wa-auto-status"><b data-wa-phone>Nenhum número conectado</b><span data-wa-error></span></div>
      ${base?'':'<div class="wa-auto-warning">O gateway está sendo preparado. Assim que ficar online, esta tela liberará a conexão por QR Code.</div>'}
      <div data-wa-qr class="wa-auto-qr"></div>
      <div class="wa-auto-actions">
        <button class="primary" data-wa-connect ${base?'':'disabled'}>Conectar WhatsApp</button>
        <button class="ghost" data-wa-refresh ${base?'':'disabled'}>Atualizar</button>
        <button class="ghost" data-wa-disconnect ${base?'':'disabled'}>Desconectar</button>
      </div>
      <hr>
      <div class="wa-auto-options">
        <label><input type="checkbox" data-wa-enabled ${settings.enabled?'checked':''}> Ativar integração</label>
        <label><input type="checkbox" data-wa-auto ${settings.auto_send_on_publish?'checked':''}> Enviar automaticamente quando o leilão for publicado</label>
      </div>
      <div class="wa-auto-groups-head"><div><small>GRUPOS AUTORIZADOS</small><h3>Escolha onde enviar</h3></div><button class="ghost mini" data-wa-load-groups ${base?'':'disabled'}>Atualizar grupos</button></div>
      <div data-wa-groups class="wa-group-list"><p class="muted">Conecte o WhatsApp para carregar os grupos.</p></div>
      <div class="wa-auto-actions">
        <button class="primary" data-wa-save>Salvar configuração</button>
        <button class="whatsapp" data-wa-send-now ${currentAuction?.id?'':'disabled'}>Enviar leilão atual agora</button>
      </div>
      <p class="muted wa-auto-note">Sem API oficial: o envio depende da sessão do WhatsApp Web permanecer conectada. Use apenas grupos em que sua empresa tem autorização para publicar.</p>
    </section>`;

    const root=app.querySelector('.wa-auto-panel');
    root.querySelector('[data-wa-connect]')?.addEventListener('click',async e=>{
      e.currentTarget.disabled=true;
      try{await gw('/connect',{method:'POST',settings});await refreshStatus(root,settings)}
      catch(err){alert(err.message||err)}
      finally{if(e.currentTarget.isConnected)e.currentTarget.disabled=false}
    });
    root.querySelector('[data-wa-disconnect]')?.addEventListener('click',async()=>{
      if(!confirm('Desconectar o WhatsApp desta empresa?'))return;
      try{await gw('/disconnect',{method:'POST',settings});await refreshStatus(root,settings)}catch(e){alert(e.message||e)}
    });
    root.querySelector('[data-wa-refresh]')?.addEventListener('click',()=>refreshStatus(root,settings));
    root.querySelector('[data-wa-load-groups]')?.addEventListener('click',()=>loadGroups(root,settings));
    root.querySelector('[data-wa-save]')?.addEventListener('click',async()=>{
      const groups=[...root.querySelectorAll('[data-wa-groups] input[type="checkbox"]:checked')].map(x=>x.value);
      try{
        settings=await saveSettings({
          enabled:root.querySelector('[data-wa-enabled]').checked,
          auto_send_on_publish:root.querySelector('[data-wa-auto]').checked,
          selected_groups:groups
        });
        alert('Configuração do WhatsApp salva.');
      }catch(e){alert(e.message||e)}
    });
    root.querySelector('[data-wa-send-now]')?.addEventListener('click',async()=>{
      try{
        const groups=[...root.querySelectorAll('[data-wa-groups] input[type="checkbox"]:checked')].map(x=>x.value);
        settings=await saveSettings({enabled:true,selected_groups:groups});
        const {data,error}=await db.from('lots').select('*').eq('auction_id',currentAuction.id).eq('company_id',currentCompany.id).order('lot_number');
        if(error)throw error;
        const auctionLots=(data||[]).map(normalize);
        if(!auctionLots.length)throw new Error('Este leilão não tem produtos.');
        let sent=0;
        for(const lot of auctionLots){await sendLot(lot,settings);sent++;await new Promise(r=>setTimeout(r,1200))}
        alert(sent+' produto(s) enviado(s) ao WhatsApp.');
      }catch(e){alert('Não foi possível enviar: '+(e.message||e))}
    });
    if(base)refreshStatus(root,settings);
  }

  window.jpWhatsappPage=renderWhatsappPage;
  if(typeof pages!=='undefined')pages.whatsapp=[renderWhatsappPage,'WhatsApp automático','Conexão, grupos e envio de fotos'];
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
    .wa-auto-head h2,.wa-auto-groups-head h3{margin:4px 0 6px}
    .wa-auto-head p{margin:0;color:#617267}
    .wa-auto-status{display:flex;flex-direction:column;gap:4px;margin:16px 0}
    .wa-auto-warning{padding:12px 14px;border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:12px;margin:12px 0}
    .wa-auto-qr{text-align:center;margin:16px 0}
    .wa-auto-qr img{width:min(320px,90%);height:auto;background:#fff;padding:12px;border-radius:16px;border:1px solid #e5e7eb}
    .wa-auto-actions{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}
    .wa-auto-options{display:grid;gap:10px;margin:14px 0 20px}
    .wa-auto-options label{display:flex;gap:9px;align-items:center;font-weight:700}
    .wa-group-list{display:grid;gap:8px;margin:12px 0 18px}
    .wa-group-item{display:flex;gap:10px;align-items:center;border:1px solid #e1e9e4;background:#fff;padding:11px 12px;border-radius:12px}
    .wa-group-item span{display:flex;flex-direction:column;min-width:0}.wa-group-item small{color:#849188;overflow-wrap:anywhere}
    .wa-auto-note{margin-top:12px}
    @media(max-width:650px){.wa-auto-head,.wa-auto-groups-head{flex-direction:column}.wa-auto-actions>*{width:100%}}
  `;
  document.head.appendChild(style);
})();