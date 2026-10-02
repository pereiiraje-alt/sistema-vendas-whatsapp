(()=>{
  const esc=v=>String(v||'').trim().toLowerCase();

  async function loadPaymentLinks(){
    try{
      if(!window.db||!window.currentCompany?.id)return new Map();

      const {data:wins,error:winsError}=await db.from('arremates')
        .select('id,participant_id')
        .eq('company_id',currentCompany.id);
      if(winsError)throw winsError;
      if(!wins?.length)return new Map();

      const arremateIds=wins.map(x=>x.id).filter(Boolean);
      const participantIds=[...new Set(wins.map(x=>x.participant_id).filter(Boolean))];

      const [{data:payments,error:paymentsError},{data:participants,error:participantsError}]=await Promise.all([
        db.from('payments').select('arremate_id,status,checkout_url').in('arremate_id',arremateIds),
        db.from('participants').select('id,email').in('id',participantIds)
      ]);
      if(paymentsError)throw paymentsError;
      if(participantsError)throw participantsError;

      const participantById=new Map((participants||[]).map(p=>[String(p.id),esc(p.email)]));
      const winById=new Map((wins||[]).map(w=>[String(w.id),w]));
      const linksByEmail=new Map();

      for(const payment of payments||[]){
        if(payment?.status==='paid'||payment?.status==='cancelled'||!payment?.checkout_url)continue;
        const win=winById.get(String(payment.arremate_id));
        const email=win?participantById.get(String(win.participant_id)):'';
        if(!email)continue;
        if(!linksByEmail.has(email))linksByEmail.set(email,[]);
        const arr=linksByEmail.get(email);
        if(!arr.includes(payment.checkout_url))arr.push(payment.checkout_url);
      }
      return linksByEmail;
    }catch(error){
      console.error('Links de pagamento:',error);
      return new Map();
    }
  }

  function appendPaymentLinks(message,links){
    if(!links?.length)return message;
    const clean=String(message||'').replace(/\n*Link(?:s)? para pagamento:[\s\S]*$/i,'').trim();
    const block=links.length===1
      ?`\n\n💳 Link para pagamento:\n${links[0]}`
      :`\n\n💳 Links para pagamento:\n${links.map((u,i)=>`${i+1}. ${u}`).join('\n')}`;
    return clean+block;
  }

  function patchWhatsAppHref(href,links){
    try{
      const url=new URL(href,location.origin);
      const oldText=url.searchParams.get('text')||'';
      url.searchParams.set('text',appendPaymentLinks(oldText,links));
      return url.toString();
    }catch{return href}
  }

  function patchEmailHref(href,links){
    try{
      const idx=href.indexOf('?');
      const base=idx>=0?href.slice(0,idx):href;
      const query=idx>=0?href.slice(idx+1):'';
      const params=new URLSearchParams(query);
      params.set('body',appendPaymentLinks(params.get('body')||'',links));
      return `${base}?${params.toString()}`;
    }catch{return href}
  }

  let running=false;
  async function apply(){
    if(running)return;
    const table=document.querySelector('.winner-table-wrap table');
    if(!table)return;
    running=true;
    try{
      const linksByEmail=await loadPaymentLinks();
      table.querySelectorAll('tbody tr').forEach(row=>{
        const emailEl=row.querySelector('.winner-contact');
        const email=esc(emailEl?.textContent);
        const links=linksByEmail.get(email)||[];
        if(!links.length)return;
        const wa=row.querySelector('a.winner-notify.whatsapp');
        if(wa&&!wa.dataset.paymentLinkPatched){
          wa.href=patchWhatsAppHref(wa.href,links);
          wa.dataset.paymentLinkPatched='1';
          wa.title='Enviar notificação com link de pagamento';
        }
        const mail=row.querySelector('a.winner-notify.email');
        if(mail&&!mail.dataset.paymentLinkPatched){
          mail.href=patchEmailHref(mail.getAttribute('href')||'',links);
          mail.dataset.paymentLinkPatched='1';
          mail.title='Enviar e-mail com link de pagamento';
        }
      });
    }finally{running=false}
  }

  const observer=new MutationObserver(()=>setTimeout(apply,120));
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(apply,500);
  window.applyWinnerPaymentLinks=apply;
})();