(()=>{
  const lotId=new URLSearchParams(location.search).get('lote');
  if(!lotId||typeof db==='undefined')return;

  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const clock=v=>new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  let busy=false;

  async function refreshBidHistory(){
    if(busy)return;
    const panel=document.querySelector('.bidhistory');
    if(!panel)return;
    busy=true;
    try{
      const {data:bids,error}=await db.from('bids')
        .select('id,amount,created_at,participant_id')
        .eq('lot_id',lotId)
        .order('created_at',{ascending:false})
        .limit(20);
      if(error)throw error;

      const ids=[...new Set((bids||[]).map(x=>x.participant_id).filter(Boolean))];
      const names={};
      if(ids.length){
        const {data:people}=await db.from('participants').select('id,full_name').in('id',ids);
        (people||[]).forEach(p=>{names[p.id]=p.full_name||'Participante'});
      }

      const rows=(bids||[]).map((b,i)=>`<div class="row"><span><b>${i===0?'🥇 ':''}${safe(names[b.participant_id]||'Participante')}</b><br><small>${clock(b.created_at)}</small></span><b>${brl(b.amount)}</b></div>`).join('');
      panel.innerHTML=`<h3>Quem já deu lance</h3>${rows||'<p class="muted">Nenhum lance ainda — seja o primeiro!</p>'}`;

      if(bids?.length){
        const {data:lot}=await db.from('lots').select('current_bid,min_increment').eq('id',lotId).maybeSingle();
        if(lot){
          const big=document.querySelector('.bidbox .bigprice');
          if(big)big.textContent=brl(lot.current_bid);
          const btn=document.querySelector('.bidbox .bidbtn');
          if(btn&&typeof participant!=='undefined'&&participant){btn.textContent='Dar lance de '+brl((Number(lot.current_bid)||0)+(Number(lot.min_increment)||0));}
        }
      }
    }catch(err){
      console.warn('Atualização dos lances:',err?.message||err);
    }finally{busy=false;}
  }

  const observer=new MutationObserver(()=>refreshBidHistory());
  observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  setTimeout(refreshBidHistory,300);
  setInterval(refreshBidHistory,4000);
})();