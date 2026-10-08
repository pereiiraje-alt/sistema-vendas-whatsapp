(()=>{
  if(typeof db==='undefined'||typeof pages==='undefined')return;
  const nav=document.querySelector('#nav');
  if(!nav)return;
  let btn=nav.querySelector('[data-page="automacoes"]');
  if(!btn){
    btn=document.createElement('button');
    btn.type='button';btn.dataset.page='automacoes';btn.textContent='⚡ Automações';
    const config=nav.querySelector('[data-page="config"]');
    config?nav.insertBefore(btn,config):nav.appendChild(btn);
  }

  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const truth=v=>v===true;
  async function getToken(){const r=await db.auth.getSession();return r?.data?.session?.access_token||''}
  async function mpStatus(){const token=await getToken();if(!token)throw new Error('Sessão expirada.');const r=await fetch('/api/mercadopago-status',{headers:{Authorization:'Bearer '+token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Não foi possível consultar o Mercado Pago.');return d}
  async function ensureSettings(){
    if(!currentCompany?.id)throw new Error('Empresa não identificada.');
    let {data,error}=await db.from('company_automation_settings').select('*').eq('company_id',currentCompany.id).maybeSingle();
    if(error)throw error;
    if(!data){
      const row={company_id:currentCompany.id};
      const ins=await db.from('company_automation_settings').insert(row).select().single();
      if(ins.error)throw ins.error;data=ins.data;
    }
    return data;
  }
  async function saveSettings(payload){
    const {error}=await db.from('company_automation_settings').upsert({company_id:currentCompany.id,...payload,updated_at:new Date().toISOString()},{onConflict:'company_id'});
    if(error)throw error;
  }
  function css(){
    if(document.getElementById('automation-center-style'))return;
    const s=document.createElement('style');s.id='automation-center-style';s.textContent=`
      .auto-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.auto-card{border:1px solid #e3ebe6;border-radius:18px;padding:20px;background:#fff;box-shadow:0 10px 28px rgba(5,42,27,.05)}.auto-card h3{margin:0 0 5px}.auto-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.auto-icon{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:#eaf9f0;font-size:23px}.auto-status{padding:6px 9px;border-radius:999px;font-size:12px;font-weight:800;background:#eef4f0;color:#315b47}.auto-status.on{background:#e4f8ec;color:#0d7a40}.auto-status.warn{background:#fff5e7;color:#a15b00}.auto-switch{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-top:1px solid #edf2ef}.auto-switch:first-of-type{margin-top:14px}.auto-switch input{width:19px;height:19px}.auto-note{margin-top:12px;padding:11px 13px;border-radius:12px;background:#f5f8f6;color:#5f7067;font-size:13px;line-height:1.5}.auto-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.auto-import{margin-top:18px}.auto-import table{min-width:720px}.auto-import-wrap{overflow:auto}.auto-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}.auto-kpis .card{min-height:108px}.auto-muted{color:#6b7b72;font-size:13px}.auto-file{display:block;margin-top:10px;padding:12px;border:1px dashed #b9c9bf;border-radius:12px;background:#fafcfb}@media(max-width:900px){.auto-grid{grid-template-columns:1fr}.auto-kpis{grid-template-columns:1fr}.auto-import table{min-width:650px}}
    `;document.head.appendChild(s);
  }
  function parseCsv(text){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++;}else quoted=!quoted;}else if((ch===','||ch===';')&&!quoted){row.push(cell.trim());cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[];}else cell+=ch;}
    if(cell||row.length){row.push(cell.trim());if(row.some(Boolean))rows.push(row)}
    if(rows.length<2)return [];
    const head=rows[0].map(x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_'));
    return rows.slice(1).map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
  }
  async function importLots(file,msg){
    if(!file)throw new Error('Escolha um arquivo CSV.');
    if(!currentAuction?.id)throw new Error('Crie ou ative um leilão antes de importar lotes.');
    const text=await file.text(),rows=parseCsv(text);if(!rows.length)throw new Error('O CSV não possui linhas válidas.');
    const {data:last}=await db.from('lots').select('lot_number').eq('auction_id',currentAuction.id).order('lot_number',{ascending:false}).limit(1).maybeSingle();
    let number=Number(last?.lot_number||0);
    const payload=[];
    for(const x of rows){
      const title=x.titulo||x.title||x.nome||x.produto;if(!title)continue;
      number++;
      const valuation=Number(String(x.avaliacao||x.valuation||0).replace(',','.'))||0;
      const start=Number(String(x.lance_inicial||x.starting_bid||x.inicial||0).replace(',','.'))||0;
      const step=Number(String(x.incremento||x.min_increment||x.passo||1).replace(',','.'))||1;
      const duration=Math.max(1,Number(x.duracao_minutos||x.duration_minutes||x.duracao||180)||180);
      payload.push({company_id:currentCompany.id,auction_id:currentAuction.id,lot_number:number,title:String(title),description:String(x.descricao||x.description||''),image_url:String(x.imagem||x.image_url||''),valuation,starting_bid:start,current_bid:start,min_increment:step,status:'live',starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+duration*60000).toISOString()});
    }
    if(!payload.length)throw new Error('Nenhum lote válido foi encontrado. Use a coluna titulo.');
    msg.textContent='Importando '+payload.length+' lote(s)...';
    const {error}=await db.from('lots').insert(payload);if(error)throw error;
    return payload.length;
  }
  async function render(){
    css();document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x===btn));title.textContent='Automações e integrações';subtitle.textContent='Conecte pagamentos, mensagens e importação de lotes';
    app.innerHTML='<div class="panel"><p>Carregando automações...</p></div>';
    try{
      const [s,mp]=await Promise.all([ensureSettings(),mpStatus().catch(e=>({connected:false,canConnect:false,error:e.message}))]);
      const automaticCount=[s.whatsapp_winner_enabled,s.payment_reminder_enabled,s.outbid_notice_enabled,s.auto_share_new_lot].filter(Boolean).length;
      app.innerHTML=`<div class="auto-kpis"><div class="card"><small>Automações configuradas</small><h2>${automaticCount}</h2><span class="up">Preferências desta empresa</span></div><div class="card"><small>Mercado Pago</small><h2>${mp.connected?'OK':'—'}</h2><span class="up">${mp.connected?'Conectado':'Não conectado'}</span></div><div class="card"><small>Importação</small><h2>CSV</h2><span class="up">Cadastro em lote disponível</span></div></div>
      <div class="auto-grid">
        <section class="auto-card"><div class="auto-top"><div><div class="auto-icon">💬</div><h3>WhatsApp</h3><p class="auto-muted">Mensagens de pós-leilão e cobrança.</p></div><span class="auto-status ${s.whatsapp_winner_enabled?'on':'warn'}">${s.whatsapp_winner_enabled?'Ativo':'Desligado'}</span></div>
          <label class="auto-switch"><span><b>Mensagem ao ganhador</b><br><small>Prepara nome, lote, valor e link de pagamento.</small></span><input id="awWinner" type="checkbox" ${truth(s.whatsapp_winner_enabled)?'checked':''}></label>
          <label class="auto-switch"><span><b>Lembrete de pagamento</b><br><small>Deixa o lembrete disponível no fluxo do arrematante.</small></span><input id="awPayment" type="checkbox" ${truth(s.payment_reminder_enabled)?'checked':''}></label>
          <label class="auto-switch"><span><b>Aviso de lance superado</b><br><small>Preferência salva para a automação de notificações.</small></span><input id="awOutbid" type="checkbox" ${truth(s.outbid_notice_enabled)?'checked':''}></label>
          <div class="auto-actions"><button class="primary" id="awWinners" type="button">Abrir arrematantes</button></div>
          <div class="auto-note">Sem API oficial do WhatsApp, o sistema consegue preparar e abrir a mensagem, mas o envio final continua dependendo da confirmação no WhatsApp. Envio 100% em segundo plano exige uma integração oficial.</div></section>

        <section class="auto-card"><div class="auto-top"><div><div class="auto-icon">💳</div><h3>Mercado Pago</h3><p class="auto-muted">PIX/cartão e confirmação de pagamento.</p></div><span class="auto-status ${mp.connected?'on':'warn'}">${mp.connected?'Conectado':'Não conectado'}</span></div>
          <div class="auto-switch"><span><b>Status da conta</b><br><small>${safe(mp.error|| (mp.connected?'Conta pronta para receber pagamentos.':'Conecte a conta desta empresa.'))}</small></span><b>${mp.connected?'✓':'—'}</b></div>
          <div class="auto-actions"><button class="primary" id="awMp" type="button">${mp.connected?'Reconectar Mercado Pago':'Conectar Mercado Pago'}</button></div>
          <div class="auto-note">Os pagamentos aprovados continuam sendo associados aos arremates e usados no pós-leilão.</div></section>

        <section class="auto-card"><div class="auto-top"><div><div class="auto-icon">📣</div><h3>Divulgação automática</h3><p class="auto-muted">Preferências para divulgação dos lotes.</p></div><span class="auto-status ${s.auto_share_new_lot?'on':'warn'}">${s.auto_share_new_lot?'Ligada':'Desligada'}</span></div>
          <label class="auto-switch"><span><b>Divulgar novo lote automaticamente</b><br><small>Marca os novos lotes para o fluxo de divulgação.</small></span><input id="awShare" type="checkbox" ${truth(s.auto_share_new_lot)?'checked':''}></label>
          <label class="auto-switch"><span><b>Facebook</b><br><small>Usar quando a conta Meta da empresa estiver conectada.</small></span><input id="awFacebook" type="checkbox" ${truth(s.facebook_enabled)?'checked':''}></label>
          <label class="auto-switch"><span><b>Instagram</b><br><small>Usar conta profissional quando estiver conectada.</small></span><input id="awInstagram" type="checkbox" ${truth(s.instagram_enabled)?'checked':''}></label>
          <div class="auto-note">As preferências já ficam salvas por empresa. A conexão de Facebook/Instagram precisa ser autorizada pela própria empresa na Meta antes de publicar automaticamente.</div></section>

        <section class="auto-card"><div class="auto-top"><div><div class="auto-icon">📦</div><h3>Importar lotes</h3><p class="auto-muted">Cadastre vários lotes de uma vez.</p></div><span class="auto-status on">Disponível</span></div>
          <input class="auto-file" id="awCsv" type="file" accept=".csv,text/csv">
          <div class="auto-note">Colunas aceitas: <b>titulo</b>, descricao, avaliacao, lance_inicial, incremento, duracao_minutos e imagem. O lote será criado no leilão ativo.</div>
          <div class="auto-actions"><button class="primary" id="awImport" type="button">Importar CSV</button></div><p id="awImportMsg" class="auto-muted"></p></section>
      </div>
      <div class="panel auto-import"><h3>Integrações preparadas para evolução</h3><p class="muted">A central agora concentra as funções reais já disponíveis e as preferências por empresa. Bling, Mercado Livre e publicação automática pela Meta podem ser conectados pelas APIs oficiais sem mudar o restante do painel.</p><div class="row"><span>Bling ERP</span><b class="badge warn">Aguardando conexão</b></div><div class="row"><span>Mercado Livre</span><b class="badge warn">Aguardando conexão</b></div><div class="row"><span>Facebook / Instagram</span><b class="badge warn">Aguardando autorização Meta da empresa</b></div></div>`;

      const save=async()=>{
        await saveSettings({whatsapp_winner_enabled:document.querySelector('#awWinner').checked,payment_reminder_enabled:document.querySelector('#awPayment').checked,outbid_notice_enabled:document.querySelector('#awOutbid').checked,auto_share_new_lot:document.querySelector('#awShare').checked,facebook_enabled:document.querySelector('#awFacebook').checked,instagram_enabled:document.querySelector('#awInstagram').checked});
      };
      ['awWinner','awPayment','awOutbid','awShare','awFacebook','awInstagram'].forEach(id=>document.getElementById(id)?.addEventListener('change',async e=>{e.target.disabled=true;try{await save()}catch(err){alert('Erro ao salvar: '+err.message)}finally{e.target.disabled=false}}));
      document.querySelector('#awWinners').onclick=()=>document.querySelector('#nav [data-page="arrematantes"]')?.click();
      document.querySelector('#awMp').onclick=()=>{if(typeof window.connectMercadoPago==='function')window.connectMercadoPago();else document.querySelector('#nav [data-page="config"]')?.click()};
      document.querySelector('#awImport').onclick=async()=>{const msg=document.querySelector('#awImportMsg');try{const n=await importLots(document.querySelector('#awCsv').files[0],msg);msg.textContent=n+' lote(s) importado(s) com sucesso.';if(typeof loadLots==='function')await loadLots()}catch(err){msg.textContent='Erro: '+err.message}};
    }catch(error){app.innerHTML=`<div class="panel"><h3>Automações e integrações</h3><p>Não foi possível carregar: ${safe(error.message||error)}</p></div>`}
  }
  pages.automacoes=[render,'Automações e integrações','Conecte pagamentos, mensagens e importação de lotes'];
  btn.onclick=async()=>{document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');await render();document.querySelector('.sidebar')?.classList.remove('open')};
  window.renderAutomationCenter=render;
})();