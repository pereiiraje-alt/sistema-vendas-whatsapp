(()=>{
  let attempts=0;
  const install=()=>{
    if(typeof openLot!=='function'||typeof db==='undefined')return false;
    if(window.__auctionRegistrationTrackerInstalled)return true;
    window.__auctionRegistrationTrackerInstalled=true;
    const originalOpenLot=openLot;
    let lastKey='';
    let lastAt=0;

    async function track(lotId){
      try{
        if(!participant?.id||!lotId)return;
        const key=`${participant.id}:${lotId}`;
        if(key===lastKey&&Date.now()-lastAt<30000)return;
        const {data:{session}}=await db.auth.getSession();
        if(!session?.access_token)return;
        lastKey=key;lastAt=Date.now();
        await fetch('/api/register-auction-participant',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
          body:JSON.stringify({participantId:participant.id,lotId})
        }).catch(()=>{});
      }catch(error){console.warn('Registro do participante no leilão:',error?.message||error)}
    }

    window.openLot=openLot=async function(id){
      const result=await originalOpenLot(id);
      setTimeout(()=>track(id),0);
      return result;
    };
    return true;
  };
  const timer=setInterval(()=>{attempts++;if(install()||attempts>120)clearInterval(timer)},50);
})();