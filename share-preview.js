(()=>{
  if(typeof shareWhats!=='function')return;
  shareWhats=async function(id){
    const l=(typeof lots!=='undefined'&&lots.find(x=>x.id===id))||await loadPublicLot(id);
    const preview=new URL('/api/share',location.origin);
    preview.searchParams.set('l',l.id);

    const msg=`🔨 *LEILÃO AO VIVO: ${l.name}*\n\n*Lote:* #${l.number}\n*Avaliação:* ${money(l.valuation)}\n*Lance inicial:* ${money(l.start)}\n*Lance atual:* ${money(l.current)}\n*Incremento:* ${money(l.step)}\n*Termina:* ${l.ends?endTime(l.ends):'a definir'}\n\n👉 Veja a foto e dê seu lance:\n${preview.toString()}`;
    window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
  };
})();