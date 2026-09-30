(()=>{
  if(typeof shareWhats!=='function')return;

  // Compartilha somente o link com preview Open Graph + as informações.
  // Assim o WhatsApp monta uma única mensagem: foto/preview em cima e texto embaixo,
  // em vez de enviar o texto e a imagem como duas mensagens separadas.
  shareWhats=async function(id){
    const l=(typeof lots!=='undefined'&&lots.find(x=>x.id===id))||await loadPublicLot(id);
    const preview=new URL('/api/share','https://jpleiloes.com.br');
    preview.searchParams.set('l',l.id);
    preview.searchParams.set('v',String(Date.now()));

    const starts=l.starts?endTime(l.starts):'agora';
    const ends=l.ends?endTime(l.ends):'a definir';
    const msg=`${preview.toString()}\n\n🔨 *${l.name||'JP Leilões'}*\n\n*Avaliação:* ${money(l.valuation)}\n*Lance inicial:* ${money(l.start)}\n*Acréscimo do lance:* ${money(l.step)}\n*Começa:* ${starts}\n*Termina:* ${ends}\n\n👉 Veja o lote e dê seu lance.`;

    window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
  };
})();