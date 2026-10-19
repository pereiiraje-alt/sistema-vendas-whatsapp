(()=>{
  if(typeof shareWhats!=='function')return;

  shareWhats=async function(id){
    const l=(typeof lots!=='undefined'&&lots.find(x=>x.id===id))||await loadPublicLot(id);
    const preview=new URL('/api/share',location.origin);
    preview.searchParams.set('l',l.id);
    preview.searchParams.set('v',Date.now().toString());

    const starts=l.starts?endTime(l.starts):'agora';
    const ends=l.ends?endTime(l.ends):'a definir';
    const msg=`🔨 *${l.name||'JP Leilões'}*\n\n*Avaliação:* ${money(l.valuation)}\n*Lance inicial:* ${money(l.start)}\n*Acréscimo do lance:* ${money(l.step)}\n*Começa:* ${starts}\n*Termina:* ${ends}\n\n👉 Veja o produto e dê seu lance:\n${preview.toString()}`;

    window.location.href='https://wa.me/?text='+encodeURIComponent(msg);
  };

  if(new URLSearchParams(location.search).has('lote')&&!document.querySelector('script[data-bid-history-live]')){
    const script=document.createElement('script');
    script.src='/bid-history-live.js?v=20260930-1';
    script.dataset.bidHistoryLive='1';
    document.body.appendChild(script);
  }
})();