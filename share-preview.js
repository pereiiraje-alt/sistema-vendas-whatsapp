(()=>{
  if(typeof shareWhats!=='function')return;

  async function imageFileFromLot(l){
    if(!l?.image)return null;
    try{
      const response=await fetch(l.image,{cache:'no-store'});
      if(!response.ok)throw new Error('Falha ao carregar imagem');
      const blob=await response.blob();
      const type=blob.type||'image/jpeg';
      const ext=type.includes('png')?'png':type.includes('webp')?'webp':'jpg';
      return new File([blob],`lote-${l.number||'jp'}.${ext}`,{type});
    }catch(error){
      console.warn('JP Leilões: não foi possível anexar a foto automaticamente',error);
      return null;
    }
  }

  shareWhats=async function(id){
    const l=(typeof lots!=='undefined'&&lots.find(x=>x.id===id))||await loadPublicLot(id);
    const preview=new URL('/api/share','https://jpleiloes.com.br');
    preview.searchParams.set('l',l.id);
    preview.searchParams.set('v',String(Date.now()));

    const starts=l.starts?endTime(l.starts):'agora';
    const ends=l.ends?endTime(l.ends):'a definir';
    const msg=`🔨 *${l.name||'JP Leilões'}*\n\n*Avaliação:* ${money(l.valuation)}\n*Lance inicial:* ${money(l.start)}\n*Acréscimo do lance:* ${money(l.step)}\n*Começa:* ${starts}\n*Termina:* ${ends}\n\n👉 Veja o lote e dê seu lance:\n${preview.toString()}`;

    const file=await imageFileFromLot(l);
    if(file&&navigator.share){
      const payload={text:msg,files:[file]};
      try{
        if(!navigator.canShare||navigator.canShare({files:[file]})){
          await navigator.share(payload);
          return;
        }
      }catch(error){
        if(error?.name==='AbortError')return;
        console.warn('JP Leilões: compartilhamento nativo indisponível',error);
      }
    }

    window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
  };
})();