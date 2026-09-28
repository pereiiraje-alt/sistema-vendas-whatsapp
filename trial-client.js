(()=>{
  if(typeof pages==='undefined')return;
  const current=pages.taxas;
  const originalRender=Array.isArray(current)?current[0]:null;
  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));

  function renderTrial(){
    if(typeof currentCompany==='undefined'||currentCompany?.plan!=='teste'){
      if(typeof originalRender==='function')return originalRender();
      return;
    }
    const host=document.getElementById('app');
    if(!host)return;
    const end=currentCompany.subscription_expires_at?new Date(currentCompany.subscription_expires_at):null;
    const remaining=end?Math.max(0,end.getTime()-Date.now()):0;
    const days=Math.floor(remaining/(24*60*60*1000));
    const hours=Math.floor((remaining%(24*60*60*1000))/(60*60*1000));
    const minutes=Math.floor((remaining%(60*60*1000))/(60*1000));
    const countdown=remaining>0?`${days}d ${hours}h ${minutes}min`:'Encerrado';
    const endLabel=end&&!Number.isNaN(end.getTime())?end.toLocaleString('pt-BR'):'—';
    host.innerHTML=`<div class="panel"><h2 style="margin:0 0 6px">Meu plano</h2><p class="muted" style="margin:0 0 18px">Você está usando o teste gratuito da JP Leilões.</p>
      <div class="row"><span>Plano atual</span><b>Teste gratuito</b></div>
      <div class="row"><span>Duração</span><b>4 dias</b></div>
      <div class="row"><span>Valor durante o teste</span><b>R$ 0,00</b></div>
      <div class="row"><span>Tempo restante</span><b>${safe(countdown)}</b></div>
      <div class="row"><span>Fim do teste</span><b>${safe(endLabel)}</b></div>
      <p class="muted" style="margin-top:16px">Quando os 4 dias terminarem, o acesso será pausado automaticamente. No próximo login você deverá escolher entre <b>5% por venda</b> ou <b>R$ 129,90 por mês</b> para continuar usando a plataforma.</p></div>`;
  }

  pages.taxas=[renderTrial,'Meu plano','Teste gratuito, plano atual e condições de cobrança'];

  async function sessionToken(){
    try{const {data}=await db.auth.getSession();return data?.session?.access_token||''}catch(_){return ''}
  }

  function createMpWelcomeModal(){
    let modal=document.getElementById('mpWelcomeModal');
    if(modal)return modal;
    modal=document.createElement('dialog');
    modal.id='mpWelcomeModal';
    modal.innerHTML=`<div style="max-width:520px;padding:4px">
      <div class="modal-head"><div><h2 style="margin:0">Receba seus pagamentos</h2><p class="muted" style="margin:6px 0 0">Conecte a conta Mercado Pago da sua empresa.</p></div><button type="button" id="mpWelcomeClose">×</button></div>
      <div class="panel" style="margin:14px 0 0"><p style="margin-top:0">Para receber os pagamentos dos lotes arrematados, conecte sua conta do Mercado Pago à JP Leilões.</p>
      <div class="row"><span>Recebimento das vendas</span><b>Direto no seu Mercado Pago</b></div>
      <div class="row"><span>Segurança</span><b>Conexão oficial Mercado Pago</b></div>
      <p class="muted" style="margin-bottom:0">Você pode fazer isso agora. Enquanto a conta não estiver conectada, este aviso aparecerá novamente nos próximos acessos.</p></div>
      <div class="actions" style="margin-top:16px"><button type="button" class="ghost" id="mpWelcomeLater">Fazer depois</button><button type="button" class="primary" id="mpWelcomeConnect">Conectar Mercado Pago</button></div>
      <p class="muted" id="mpWelcomeMessage" style="margin-top:10px"></p>
    </div>`;
    document.body.appendChild(modal);
    const close=()=>modal.close();
    modal.querySelector('#mpWelcomeClose').onclick=close;
    modal.querySelector('#mpWelcomeLater').onclick=close;
    modal.querySelector('#mpWelcomeConnect').onclick=async()=>{
      const btn=modal.querySelector('#mpWelcomeConnect'),msg=modal.querySelector('#mpWelcomeMessage');
      btn.disabled=true;btn.textContent='Abrindo Mercado Pago...';msg.textContent='';
      try{
        if(typeof window.connectMercadoPago!=='function')throw new Error('Conexão do Mercado Pago ainda não está disponível. Atualize a página.');
        await window.connectMercadoPago();
      }catch(e){msg.textContent=e?.message||'Não foi possível abrir o Mercado Pago.';btn.disabled=false;btn.textContent='Conectar Mercado Pago'}
    };
    return modal;
  }

  async function offerMercadoPagoConnection(){
    try{
      if(typeof isPublicLot!=='undefined'&&isPublicLot)return;
      if(typeof currentCompany==='undefined'||!currentCompany||currentCompany.plan!=='teste')return;
      const key=`jp_mp_welcome_${currentCompany.id||'company'}`;
      if(sessionStorage.getItem(key)==='shown')return;
      const token=await sessionToken();if(!token)return;
      const r=await fetch('/api/mercadopago-status',{headers:{Authorization:`Bearer ${token}`}}),data=await r.json().catch(()=>({}));
      if(!r.ok||data.connected||!data.canConnect)return;
      sessionStorage.setItem(key,'shown');
      const modal=createMpWelcomeModal();if(!modal.open)modal.showModal();
    }catch(e){console.warn('Aviso inicial Mercado Pago:',e?.message||e)}
  }

  let attempts=0;
  const waitForCompany=setInterval(()=>{
    attempts++;
    if((typeof currentCompany!=='undefined'&&currentCompany)||attempts>=12){
      clearInterval(waitForCompany);
      if(typeof currentCompany!=='undefined'&&currentCompany)setTimeout(offerMercadoPagoConnection,700);
    }
  },500);

  if(!document.querySelector('script[data-billing-client]')){
    const billing=document.createElement('script');
    billing.src='billing-client.js?v=20260928-1';
    billing.dataset.billingClient='1';
    document.body.appendChild(billing);
  }

  if(!document.querySelector('#nav button[data-page="suporte"]')){
    const btn=document.createElement('button');
    btn.type='button';btn.dataset.page='suporte';btn.textContent='💬 Suporte';
    const nav=document.querySelector('#nav');
    const config=nav?.querySelector('[data-page="config"]');
    if(nav)config?nav.insertBefore(btn,config):nav.appendChild(btn);
  }
  if(!document.querySelector('script[data-support-client]')){
    const support=document.createElement('script');
    support.src='support-client.js?v=20260928-3';
    support.dataset.supportClient='1';
    document.body.appendChild(support);
  }
})();