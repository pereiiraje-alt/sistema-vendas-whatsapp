(()=>{
  if(typeof shareWhats!=='function')return;
  shareWhats=async function(id){
    const l=(typeof lots!=='undefined'&&lots.find(x=>x.id===id))||await loadPublicLot(id);
    const preview=new URL('/api/share',location.origin);
    preview.searchParams.set('l',l.id);
    preview.searchParams.set('v','3');

    const starts=l.starts?endTime(l.starts):'agora';
    const ends=l.ends?endTime(l.ends):'a definir';
    const msg=`*Avaliação:* ${money(l.valuation)}\n*Lance inicial:* ${money(l.start)}\n*Acréscimo do lance:* ${money(l.step)}\n*Começa:* ${starts}\n*Termina:* ${ends}\n\n${preview.toString()}`;
    window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
  };
})();