(()=>{
  if(document.body.classList.contains('public-lot'))return;

  const finalizedLots=new Set();
  let closingAuction=false;
  let painting=false;

  function isEnded(lot){
    if(!lot?.ends)return false;
    const endMs=new Date(lot.ends).getTime();
    return Number.isFinite(endMs)&&Date.now()>=endMs;
  }

  async function finalizeLot(lot){
    if(!lot?.id||finalizedLots.has(lot.id))return;
    finalizedLots.add(lot.id);
    try{
      const session=await db.auth.getSession();
      const token=session?.data?.session?.access_token;
      if(!token)throw new Error('Sessão expirada.');
      const response=await fetch('/api/finalize-lot',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({lotId:lot.id})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Não foi possível finalizar o lote.');
      lot.status='ended';
    }catch(error){
      finalizedLots.delete(lot.id);
      console.error('Finalização automática do lote:',error);
    }
  }

  async function closeAuctionIfFinished(){
    if(closingAuction||typeof currentAuction==='undefined'||!currentAuction?.id||currentAuction.status==='ended'||typeof lots==='undefined')return;
    const auctionLots=lots.filter(l=>l.auctionId===currentAuction.id);
    if(!auctionLots.length||!auctionLots.every(isEnded))return;

    closingAuction=true;
    try{
      await Promise.all(auctionLots.map(finalizeLot));
      if(typeof db!=='undefined'){
        const endedAt=new Date().toISOString();
        const {error}=await db.from('auctions').update({status:'ended',ends_at:endedAt}).eq('id',currentAuction.id);
        if(error)throw error;
        currentAuction={...currentAuction,status:'ended',ends_at:endedAt};
      }
    }catch(error){
      console.error('Encerramento automático do leilão:',error);
    }finally{
      closingAuction=false;
    }
  }

  function paintEndedCards(){
    if(painting||typeof lots==='undefined')return;
    painting=true;
    try{
      document.querySelectorAll('.product').forEach(card=>{
        const timer=card.querySelector('.timer[data-end]');
        if(!timer)return;
        const endMs=new Date(timer.dataset.end).getTime();
        if(!Number.isFinite(endMs)||Date.now()<endMs)return;

        if(timer.textContent!=='ENCERRADO')timer.textContent='ENCERRADO';
        timer.classList.add('auction-ended-timer');

        const action=card.querySelector('button.primary.full');
        if(action){
          if(action.textContent!=='Ver resultado')action.textContent='Ver resultado';
          action.classList.add('auction-result-button');
          const match=String(action.getAttribute('onclick')||'').match(/openLot\(['\"]([^'\"]+)/);
          if(match){
            const lot=lots.find(l=>String(l.id)===match[1]);
            if(lot)finalizeLot(lot);
          }
        }
      });

      const auctionLots=currentAuction?.id?lots.filter(l=>l.auctionId===currentAuction.id):[];
      const allEnded=auctionLots.length>0&&auctionLots.every(isEnded);
      const label=document.querySelector('.auction-head .live');
      if(label&&allEnded){
        if(label.textContent!=='● ENCERRADO')label.textContent='● ENCERRADO';
        label.classList.add('auction-ended-label');
      }

      if(allEnded)closeAuctionIfFinished();
    }finally{
      painting=false;
    }
  }

  if(!document.getElementById('auction-expiry-style')){
    const style=document.createElement('style');
    style.id='auction-expiry-style';
    style.textContent=`
      .auction-ended-timer{color:#6b7280!important;font-weight:800}
      .auction-ended-label{color:#6b7280!important}
      .auction-result-button{background:#374151!important}
    `;
    document.head.appendChild(style);
  }

  setInterval(paintEndedCards,1000);
  setTimeout(paintEndedCards,100);
  setTimeout(paintEndedCards,500);
})();