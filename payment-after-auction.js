(()=>{
  if(typeof openLot!=='function'||typeof loadPublicLot!=='function')return;
  const baseOpenLot=openLot;
  let lastFinalization=null;

  function styleOnce(){
    if(document.getElementById('winner-payment-style'))return;
    const s=document.createElement('style');
    s.id='winner-payment-style';
    s.textContent=`
      .winner-pay{margin-top:18px;padding:18px;border:1px solid #bbf7d0;border-radius:16px;background:#f0fdf4;text-align:left}
      .winner-pay h3{margin:0 0 6px;color:#065f46;font-size:20px}
      .winner-pay .pay-total{font-size:28px;font-weight:800;color:#047857;margin:8px 0 14px}
      .winner-pay .pay-label{display:block;font-weight:700;margin:10px 0 8px}
      .pay-methods{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
      .pay-method{border:1px solid #d1d5db;background:#fff;border-radius:12px;padding:14px 8px;font-weight:700;cursor:pointer;color:#111827}
      .pay-method:hover,.pay-method.active{border-color:#16a34a;background:#dcfce7;color:#166534}
      .pay-note{font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.4}
      .pay-status{margin-top:12px;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #d1fae5;font-size:14px}
      .pay-success{color:#166534;font-weight:700}
      .pay-checkout{display:block;text-align:center;margin-top:12px;padding:12px;border-radius:10px;background:#16a34a;color:#fff;text-decoration:none;font-weight:800}
      @media(max-width:520px){.pay-methods{grid-template-columns:1fr}.winner-pay .pay-total{font-size:24px}}
    `;
    document.head.appendChild(s);
  }

  async function finalize(id){
    const response=await fetch('/api/finalize-lot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lotId:id})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Não foi possível finalizar o lote.');
    return data;
  }

  function methodLabel(m){return m==='pix'?'PIX':m==='card'?'Cartão':''}

  function renderWinnerPayment(box,id,data){
    const a=data.arremate;
    const payment=data.payment;
    const amount=Number(a.total_amount||a.winning_bid||0);
    const paid=payment?.status==='paid';
    const selected=['pix','card'].includes(payment?.method)?payment.method:'';
    box.insertAdjacentHTML('beforeend',`
      <div class="winner-pay" id="winnerPayment">
        <h3>🏆 Parabéns, você arrematou!</h3>
        <div>Valor do lote:</div>
        <div class="pay-total">${money(amount)}</div>
        ${paid?`<div class="pay-status pay-success">✓ Pagamento aprovado</div>`:`
          <span class="pay-label">Escolha a forma de pagamento</span>
          <div class="pay-methods">
            <button class="pay-method ${selected==='pix'?'active':''}" type="button" onclick="choosePaymentMethod('${id}','pix')">PIX</button>
            <button class="pay-method ${selected==='card'?'active':''}" type="button" onclick="choosePaymentMethod('${id}','card')">Cartão</button>
          </div>
          <div id="paymentChoiceStatus" class="pay-status">${selected?`Forma selecionada: <b>${methodLabel(selected)}</b>`:'Selecione PIX ou cartão para continuar.'}</div>
          <div id="paymentCheckoutWrap">${payment?.checkout_url?`<a class="pay-checkout" href="${esc(payment.checkout_url)}" target="_blank" rel="noopener">Continuar para pagamento</a>`:''}</div>
          <p class="pay-note">No plano por porcentagem, a comissão do LanceCerto é separada automaticamente pelo Mercado Pago e o restante segue para a conta do vendedor.</p>
        `}
      </div>`);
  }

  async function enhancedOpenLot(id){
    let l;
    try{l=await loadPublicLot(id)}catch{return baseOpenLot(id)}
    const ended=!!(l.ends&&Date.now()>=new Date(l.ends));
    if(!ended)return baseOpenLot(id);

    try{lastFinalization=await finalize(id)}catch(e){console.error('Finalização do lote:',e)}
    await baseOpenLot(id);
    styleOnce();
    const box=document.querySelector('.bidbox');
    if(!box||!lastFinalization)return;

    if(!lastFinalization.sold){
      box.insertAdjacentHTML('beforeend','<div class="pay-status">Leilão encerrado sem arrematante.</div>');
      return;
    }

    if(typeof participant!=='undefined'&&participant?.id===lastFinalization.arremate?.participant_id){
      renderWinnerPayment(box,id,lastFinalization);
    }else{
      box.insertAdjacentHTML('beforeend','<div class="pay-status">Leilão encerrado. A forma de pagamento aparece somente para o participante vencedor.</div>');
    }
  }

  window.choosePaymentMethod=async function(id,method){
    const status=document.getElementById('paymentChoiceStatus');
    try{
      if(!['pix','card'].includes(method))throw new Error('Escolha PIX ou cartão.');
      if(status)status.textContent='Preparando pagamento no Mercado Pago...';
      const session=await db.auth.getSession();
      const token=session?.data?.session?.access_token;
      if(!token)throw new Error('Sua sessão expirou. Entre novamente com a conta usada para dar o lance.');
      const response=await fetch('/api/select-payment-method',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({lotId:id,method})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Não foi possível salvar a forma de pagamento.');
      document.querySelectorAll('.pay-method').forEach(b=>b.classList.remove('active'));
      const labels={pix:'PIX',card:'Cartão'};
      const buttons=[...document.querySelectorAll('.pay-method')];
      const active=buttons.find(b=>b.textContent.trim()===labels[method]);
      if(active)active.classList.add('active');
      if(status)status.innerHTML=`Forma selecionada: <b>${labels[method]}</b>. ${data.onlineReady?'Pagamento pronto. Clique abaixo para continuar.':'A empresa ainda precisa conectar o Mercado Pago.'}`;
      const wrap=document.getElementById('paymentCheckoutWrap');
      if(wrap&&data.checkoutUrl){
        wrap.innerHTML=`<a class="pay-checkout" href="${esc(data.checkoutUrl)}" target="_blank" rel="noopener">Pagar com ${labels[method]}</a>`;
      }
    }catch(e){if(status)status.textContent=e.message;else alert(e.message)}
  };

  openLot=enhancedOpenLot;
  window.openLot=enhancedOpenLot;

  const publicId=new URLSearchParams(location.search).get('lote');
  if(publicId)setTimeout(()=>enhancedOpenLot(publicId),350);
})();