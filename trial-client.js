(()=>{
  if(typeof pages==='undefined')return;
  const current=pages.taxas;
  const originalRender=Array.isArray(current)?current[0]:null;
  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

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
})();