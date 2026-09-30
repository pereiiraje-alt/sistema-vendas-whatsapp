(()=>{
  if(typeof db==='undefined'||typeof pages==='undefined')return;

  const nav=document.getElementById('nav');
  if(nav&&!nav.querySelector('[data-page="mensalidade"]')){
    const button=document.createElement('button');
    button.type='button';button.dataset.page='mensalidade';button.textContent='🧾 Mensalidade';
    const config=nav.querySelector('[data-page="config"]');
    nav.insertBefore(button,config||null);
  }

  const safe=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>v?new Date(v).toLocaleString('pt-BR'):'—';

  async function token(){const{data}=await db.auth.getSession();return data?.session?.access_token||''}
  async function billing(){
    const t=await token();if(!t)throw new Error('Sessão expirada.');
    const r=await fetch('/api/platform-subscription',{headers:{Authorization:`Bearer ${t}`}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Não foi possível consultar a mensalidade.');
    return data;
  }

  async function renderBillingPage(){
    const host=document.getElementById('app');if(!host)return;
    host.innerHTML='<div class="panel"><h3>Mensalidade</h3><p class="muted">Consultando sua assinatura...</p></div>';
    try{
      const info=await billing();
      if(!info.monthly){
        host.innerHTML=`<div class="panel"><h2 style="margin:0 0 8px">Pagamento de mensalidade</h2><p class="muted">Seu plano atual não possui mensalidade recorrente.</p><div class="row"><span>Plano atual</span><b>${safe(info.plan||'—')}</b></div><p class="muted" style="margin-top:14px">Esta área será usada quando a empresa estiver no plano mensal de R$ 129,90.</p></div>`;
        return;
      }
      let status='Ativa';
      if(info.dueSoon)status='Próxima do vencimento';
      if(info.inGrace)status='Vencida — período de tolerância';
      if(info.overdueBlocked)status='Bloqueada por atraso';
      if(info.status==='pending'||info.status==='missing')status='Aguardando pagamento';
      const notice=info.dueSoon?`<div class="panel"><h3>⚠ Mensalidade próxima do vencimento</h3><p>Sua mensalidade vence em <b>${Number(info.daysUntilDue||0)} dia(s)</b>. Regularize até a data de vencimento para evitar interrupções.</p></div>`:info.inGrace?`<div class="panel"><h3>⚠ Mensalidade vencida</h3><p>O vencimento passou há <b>${Number(info.overdueDays||0)} dia(s)</b>. O sistema continuará liberado por até 5 dias após o vencimento. Depois disso, o acesso será bloqueado até a regularização.</p></div>`:info.overdueBlocked?`<div class="panel"><h3>⛔ Acesso bloqueado por falta de pagamento</h3><p>A mensalidade está vencida há mais de 5 dias. O acesso só será liberado novamente após a regularização do pagamento.</p></div>`:'';
      host.innerHTML=`${notice}<div class="panel"><h2 style="margin:0 0 8px">Pagamento de mensalidade</h2><div class="row"><span>Valor</span><b>${money(info.amount||129.90)}</b></div><div class="row"><span>Status</span><b>${safe(status)}</b></div><div class="row"><span>Próximo vencimento</span><b>${safe(date(info.nextPaymentAt))}</b></div>${info.graceEndsAt?`<div class="row"><span>Bloqueio após</span><b>${safe(date(info.graceEndsAt))}</b></div>`:''}${info.checkoutUrl?`<div style="margin-top:16px"><a class="primary" href="${safe(info.checkoutUrl)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">Pagar / regularizar mensalidade</a></div>`:''}<p class="muted" style="margin-top:14px">No plano mensal, a JP Leilões cobra R$ 129,90 por mês. Cinco dias antes do vencimento você recebe um aviso. Após o vencimento há 5 dias de tolerância; depois, o sistema bloqueia até o pagamento ser regularizado.</p></div>`;
    }catch(e){host.innerHTML=`<div class="panel"><h3>Mensalidade</h3><p>${safe(e.message||e)}</p></div>`}
  }

  pages.mensalidade=[renderBillingPage,'Mensalidade','Vencimento, pagamento e status da assinatura'];

  if(nav){
    const button=nav.querySelector('[data-page="mensalidade"]');
    if(button)button.onclick=async()=>{
      nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));
      const title=document.getElementById('title'),subtitle=document.getElementById('subtitle');
      if(title)title.textContent='Mensalidade';
      if(subtitle)subtitle.textContent='Vencimento, pagamento e status da assinatura';
      const sidebar=document.querySelector('.sidebar');
      if(sidebar)sidebar.classList.remove('open');
      await renderBillingPage();
    };
  }

  async function automaticWarning(){
    try{
      const info=await billing();
      if(!info.monthly||info.overdueBlocked)return;
      let text='';
      if(info.dueSoon)text=`Sua mensalidade de ${money(info.amount||129.90)} vence em ${Number(info.daysUntilDue||0)} dia(s).`;
      else if(info.inGrace)text=`Sua mensalidade está vencida há ${Number(info.overdueDays||0)} dia(s). Após 5 dias do vencimento, o sistema será bloqueado até o pagamento.`;
      if(!text)return;
      const key=`jp-billing-warning-${new Date().toISOString().slice(0,10)}-${info.dueSoon?'due':'grace'}`;
      if(localStorage.getItem(key))return;
      localStorage.setItem(key,'1');
      setTimeout(()=>alert(text+'\n\nConsulte a aba Mensalidade para mais detalhes.'),500);
    }catch(_){ }
  }

  // Dados básicos que o próprio cliente pode editar.
  const configPage=pages.config;
  const originalConfig=Array.isArray(configPage)?configPage[0]:null;
  async function renderClientConfig(){
    if(typeof originalConfig==='function')await originalConfig();
    const host=document.getElementById('app');
    if(!host||typeof currentCompany==='undefined'||!currentCompany)return;

    const profile=document.createElement('div');
    profile.className='panel';
    profile.innerHTML=`<div class="toolbar"><div><h3 style="margin:0">Dados da empresa</h3><p class="muted" style="margin:6px 0 0">Atualize somente os dados de contato da sua empresa.</p></div></div>
      <form id="clientCompanyForm" class="grid2">
        <label>Nome da empresa<input name="name" required value="${safe(currentCompany.name||'')}"></label>
        <label>Responsável<input name="responsible_name" required value="${safe(currentCompany.responsible_name||'')}"></label>
        <label>Telefone / WhatsApp<input name="phone" inputmode="tel" placeholder="(41) 99999-9999" value="${safe(currentCompany.phone||'')}"></label>
        <div style="align-self:end"><button class="primary" type="submit">Salvar dados</button></div>
      </form>
      <p class="muted" style="margin:14px 0 0">Plano, cobrança, vencimento e demais dados continuam administrados pela JP Leilões.</p>`;
    host.prepend(profile);

    const form=profile.querySelector('#clientCompanyForm');
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('button[type="submit"]');
      const fd=new FormData(form);
      const payload={
        name:String(fd.get('name')||'').trim(),
        responsible_name:String(fd.get('responsible_name')||'').trim(),
        phone:String(fd.get('phone')||'').trim()||null,
        updated_at:new Date().toISOString()
      };
      if(!payload.name||!payload.responsible_name)return alert('Informe o nome da empresa e o responsável.');
      button.disabled=true;button.textContent='Salvando...';
      try{
        const {error}=await db.from('companies').update(payload).eq('id',currentCompany.id);
        if(error)throw error;
        Object.assign(currentCompany,payload);
        const companyName=document.getElementById('companyName');if(companyName)companyName.textContent=currentCompany.name;
        alert('Dados da empresa atualizados com sucesso.');
        button.textContent='Salvo ✓';
        setTimeout(()=>{button.disabled=false;button.textContent='Salvar dados'},1200);
      }catch(e){
        alert('Não foi possível salvar os dados: '+(e?.message||e));
        button.disabled=false;button.textContent='Salvar dados';
      }
    };
  }
  if(Array.isArray(configPage))pages.config=[renderClientConfig,configPage[1]||'Configurações',configPage[2]||'Dados da empresa e configurações'];

  setTimeout(automaticWarning,1200);
})();