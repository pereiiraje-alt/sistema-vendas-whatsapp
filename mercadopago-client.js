(()=>{
  if(typeof db==='undefined')return;

  async function sessionToken(){
    const {data}=await db.auth.getSession();
    return data?.session?.access_token||'';
  }

  async function mpStatus(){
    const token=await sessionToken();
    if(!token)throw new Error('Sessão expirada.');
    const r=await fetch('/api/mercadopago-status',{headers:{Authorization:`Bearer ${token}`}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Não foi possível consultar o Mercado Pago.');
    return data;
  }

  const moneyBRL=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const percentBR=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  async function planDetails(){
    try{
      if(typeof currentCompany==='undefined'||!currentCompany?.plan)return null;
      const {data,error}=await db.from('platform_plans')
        .select('code,name,price,charge_type,percentage,billing_period,description')
        .eq('code',currentCompany.plan)
        .limit(1)
        .maybeSingle();
      if(error)throw error;
      return data||null;
    }catch(e){
      console.warn('Plano do cliente:',e);
      return null;
    }
  }

  function planType(plan){
    if(plan?.charge_type==='percentage')return 'Por porcentagem';
    if(plan?.billing_period==='monthly'&&Number(plan?.price||0)>0)return 'Mensal';
    return 'Cortesia';
  }

  function feeBody(plan){
    const percentagePlan=plan?.charge_type==='percentage';
    const platformFee=Number(plan?.percentage||currentCompany?.platform_fee_value||0);
    const monthlyPrice=Number(plan?.price||0);

    if(percentagePlan){
      return `<div class="row"><span>Tipo do plano</span><b>Por porcentagem</b></div>
        <div class="row"><span>Plano atual</span><b>${safe(plan?.name||'Plano por venda')}</b></div>
        <div class="row"><span>Taxa da plataforma</span><b>${percentBR(platformFee)} por venda paga</b></div>
        <div class="row"><span>Taxa do Mercado Pago</span><b>Variável conforme PIX, cartão, parcelamento e prazo</b></div>
        <div class="row"><span>Como é calculado</span><b>Venda − ${percentBR(platformFee)} − tarifa Mercado Pago</b></div>
        <p class="muted" style="margin-top:12px">A plataforma desconta somente ${percentBR(platformFee)} de cada venda paga. Além disso, o Mercado Pago pode cobrar a tarifa própria de processamento, conforme a forma de pagamento e as condições da conta do vendedor.</p>`;
    }

    if(plan?.billing_period==='monthly'&&monthlyPrice>0){
      return `<div class="row"><span>Tipo do plano</span><b>Mensal</b></div>
        <div class="row"><span>Plano atual</span><b>${safe(plan?.name||'Plano mensal')}</b></div>
        <div class="row"><span>Mensalidade</span><b>${moneyBRL(monthlyPrice)} por mês</b></div>
        <div class="row"><span>Comissão da plataforma sobre vendas</span><b>0%</b></div>
        <div class="row"><span>Taxas do Mercado Pago nas vendas</span><b>Conforme PIX, cartão, parcelamento e prazo</b></div>
        <p class="muted" style="margin-top:12px">Neste plano a plataforma não cobra porcentagem sobre as vendas. A cobrança da plataforma é somente a mensalidade de ${moneyBRL(monthlyPrice)}. O Mercado Pago continua podendo aplicar as tarifas próprias de processamento dos pagamentos.</p>`;
    }

    return `<div class="row"><span>Tipo do plano</span><b>Cortesia</b></div>
      <div class="row"><span>Plano atual</span><b>${safe(plan?.name||'Cortesia')}</b></div>
      <div class="row"><span>Taxa da plataforma</span><b>0%</b></div>
      <div class="row"><span>Mensalidade</span><b>R$ 0,00</b></div>
      <p class="muted" style="margin-top:12px">Plano liberado manualmente pelo administrador, sem cobrança da plataforma.</p>`;
  }

  async function renderFeeExplanation(host){
    if(document.getElementById('clientFeePanel'))return;
    const plan=await planDetails();
    if(!plan)return;
    host.insertAdjacentHTML('beforeend',`<div class="panel" id="clientFeePanel"><h3>Meu plano</h3><p class="muted">Consulte seu plano atual e veja como as cobranças funcionam.</p>${feeBody(plan)}</div>`);
  }

  async function renderTaxPage(){
    const host=document.getElementById('app');
    if(!host)return;
    host.innerHTML='<div class="panel"><h3>Carregando seu plano...</h3><p class="muted">Consultando as condições da sua conta.</p></div>';
    const plan=await planDetails();
    if(!plan){
      host.innerHTML='<div class="panel"><h3>Meu plano</h3><p class="muted">Não foi possível identificar o plano desta empresa. Atualize a página ou entre novamente.</p></div>';
      return;
    }
    const type=planType(plan);
    const intro=type==='Mensal'
      ? 'Seu plano é mensal. Abaixo estão a mensalidade e as condições aplicáveis às vendas.'
      : type==='Por porcentagem'
        ? 'Seu plano é por porcentagem. Abaixo estão separadas a taxa da plataforma e a tarifa do Mercado Pago.'
        : 'Seu plano é uma cortesia liberada pelo administrador.';
    host.innerHTML=`<div class="panel"><h2 style="margin:0 0 6px">Meu plano</h2><p class="muted" style="margin:0 0 18px">${intro}</p>${feeBody(plan)}${plan.description?`<div style="margin-top:18px;padding-top:16px;border-top:1px solid #e5e7eb"><b>Descrição do plano</b><p class="muted">${safe(plan.description)}</p></div>`:''}</div>
      <div class="panel"><h3>Entenda as cobranças</h3><p class="muted">A cobrança da plataforma e as tarifas do Mercado Pago são valores diferentes. No plano mensal, a plataforma cobra apenas a mensalidade. No plano por porcentagem, a plataforma cobra o percentual indicado acima em cada venda paga. As tarifas do Mercado Pago dependem do meio de pagamento e das condições da conta.</p></div>`;
  }

  if(typeof pages!=='undefined'){
    pages.taxas=[renderTaxPage,'Meu plano','Veja seu plano atual e as taxas aplicáveis'];
  }

  async function renderMpPanel(){
    if(!document.querySelector('[data-page="config"]')?.classList.contains('active'))return;
    const host=document.getElementById('app');
    if(!host)return;

    if(!document.getElementById('mpConnectionPanel')){
      host.insertAdjacentHTML('beforeend',`<div class="panel" id="mpConnectionPanel"><h3>Mercado Pago</h3><p class="muted">Conecte a conta Mercado Pago da empresa para receber pagamentos dos lotes arrematados.</p><div id="mpConnectionStatus" class="row"><span>Status</span><b class="badge">Consultando...</b></div><div style="margin-top:14px"><button class="primary" id="mpConnectButton" type="button">Conectar Mercado Pago</button></div><p class="muted" style="margin-top:10px">O pagamento será processado diretamente na conta Mercado Pago desta empresa.</p></div>`);
      const status=document.getElementById('mpConnectionStatus');
      const button=document.getElementById('mpConnectButton');
      try{
        const data=await mpStatus();
        if(data.connected){
          status.innerHTML='<span>Status</span><b class="badge">Conectado ✓</b>';
          button.textContent='Reconectar Mercado Pago';
        }else{
          status.innerHTML='<span>Status</span><b class="badge">Não conectado</b>';
        }
        button.disabled=!data.canConnect;
        if(!data.canConnect)button.textContent='Somente proprietário/gerente pode conectar';
      }catch(e){
        status.innerHTML=`<span>Status</span><b class="badge">${safe(e.message||'Erro')}</b>`;
      }
    }

    await renderFeeExplanation(host);
  }

  window.connectMercadoPago=async function(){
    const button=document.getElementById('mpConnectButton');
    try{
      if(button){button.disabled=true;button.textContent='Abrindo Mercado Pago...';}
      const token=await sessionToken();
      if(!token)throw new Error('Faça login novamente.');
      const r=await fetch('/api/mercadopago-connect',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.url)throw new Error(data.error||'Não foi possível iniciar a conexão.');
      location.href=data.url;
    }catch(e){
      alert(e.message||'Não foi possível conectar o Mercado Pago.');
      if(button){button.disabled=false;button.textContent='Conectar Mercado Pago';}
    }
  };

  document.addEventListener('click',e=>{
    if(e.target?.matches?.('[data-page="config"]'))setTimeout(renderMpPanel,80);
    if(e.target?.id==='mpConnectButton')connectMercadoPago();
  });

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const response=await nativeFetch(input,init);
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes('/api/select-payment-method')){
      response.clone().json().then(data=>{
        if(!data?.checkoutUrl)return;
        setTimeout(()=>{
          const box=document.getElementById('winnerPayment');
          if(!box)return;
          let a=box.querySelector('.pay-checkout');
          if(!a){a=document.createElement('a');a.className='pay-checkout';a.target='_blank';a.rel='noopener';box.appendChild(a);}
          a.href=data.checkoutUrl;
          a.textContent='Pagar agora no Mercado Pago';
          const s=document.getElementById('paymentChoiceStatus');
          if(s)s.innerHTML='Forma selecionada. <b>Pagamento online pronto.</b>';
        },30);
      }).catch(()=>{});
    }
    return response;
  };

  const mpResult=new URLSearchParams(location.search).get('mp');
  if(mpResult&&!isPublicLot){
    setTimeout(()=>{
      document.querySelector('[data-page="config"]')?.click();
      setTimeout(()=>{
        if(mpResult==='connected')alert('Mercado Pago conectado com sucesso.');
        else if(mpResult==='error')alert('Não foi possível concluir a conexão com o Mercado Pago. Tente novamente.');
        const u=new URL(location.href);u.searchParams.delete('mp');history.replaceState({},'',u.pathname+u.search);
      },250);
    },700);
  }
})();