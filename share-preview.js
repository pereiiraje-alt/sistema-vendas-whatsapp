(()=>{
  if(typeof shareWhats!=='function')return;

  // Envia uma única mensagem no WhatsApp com as informações primeiro
  // e o link do lote por último. A URL foi reduzida para ficar mais limpa.
  shareWhats=async function(id){
    const l=(typeof lots!=='undefined'&&lots.find(x=>x.id===id))||await loadPublicLot(id);
    const preview=new URL('/api/share','https://jpleiloes.com.br');
    preview.searchParams.set('l',l.id);

    const starts=l.starts?endTime(l.starts):'agora';
    const ends=l.ends?endTime(l.ends):'a definir';
    const msg=`🔨 *${l.name||'JP Leilões'}*\n\n*Avaliação:* ${money(l.valuation)}\n*Lance inicial:* ${money(l.start)}\n*Acréscimo do lance:* ${money(l.step)}\n*Começa:* ${starts}\n*Termina:* ${ends}\n\n👉 Veja o lote e dê seu lance:\n${preview.toString()}`;

    window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
  };
})();