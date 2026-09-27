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

  async function renderFeeExplanation(host){
    if(document.getElementById('clientFeePanel'))return;
    const plan=await planDetails();
    if(!plan)return;

    const percentagePlan=plan.charge_type==='percentage';
    const platformFee=Number(plan.percentage||currentCompany?.platform_fee_value||0);
    const monthlyPrice=Number(plan.price||0);

    const body=percentagePlan
      ? `<div class="row"><span>Taxa da plataforma</span><b>${percentBR(platformFee)} por venda paga</b></div>
         <div class="row"><span>Tarifa do Mercado Pago</span><b>Variável conforme PIX, cartão e prazo</b></div>
         <div class="row"><span>Como é descontado</span><b>${percentBR(platformFee)} + tarifa do Mercado Pago</b></div>
         <p class="muted" style="margin-top:12px">A taxa de ${percentBR(platformFee)} pertence à plataforma. A tarifa do Mercado Pago é uma cobrança separada do próprio meio de pagamento e pode variar conforme a forma de pagamento, parcelamento e prazo de recebimento. O percentual exato do Mercado Pago é exibido nas condições da conta e da transação.</p>`
      : plan.billing_period==='monthly'&&monthlyPrice>0
        ? `<div class="row"><span>Plano da plataforma</span><b>${moneyBRL(monthlyPrice)} por mês</b></div>
           <div class="row"><span>Comissão sobre vendas</span><b>0%</b></div>
           <div class="row"><span>Tarifa do Mercado Pago</span><b>Descontada da cobrança mensal</b></div>
           <p class="muted" style="margin-top:12px">Neste plano não há comissão percentual da plataforma sobre as vendas. A mensalidade é de ${moneyBRL(monthlyPrice)} e o Mercado Pago desconta a tarifa de processamento da própria cobrança da assinatura, conforme as condições da conta.</p>`
        : `<div class="row"><span>Taxa da plataforma</span><b>0%</b></div><div class="row"><span>Plano</span><b>Cortesia</b></div>`;

    host.insertAdjacentHTML('beforeend',`<div class="panel" id="clientFeePanel"><h3>Seu plano e taxas</h3><p class="muted">Veja claramente o que pertence à plataforma e o que é cobrado pelo Mercado Pago.</p>${body}</div>`);
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
        status.innerHTML=`<span>Status</span><b class="badge">${String(e.message||'Erro')}</b>`;
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