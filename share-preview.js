(()=>{
  if(typeof shareWhats!=='function')return;

  function safeFileName(name,type){
    const base=String(name||'produto').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'produto';
    const ext=type==='image/png'?'png':type==='image/webp'?'webp':'jpg';
    return base+'.'+ext;
  }

  async function shareWithPhoto(l,msg,previewUrl){
    if(!navigator.share||!navigator.canShare)return false;
    try{
      const imageUrl=new URL('/api/share-image',location.origin);
      imageUrl.searchParams.set('l',l.id);
      imageUrl.searchParams.set('v',Date.now().toString());
      const response=await fetch(imageUrl.toString(),{cache:'no-store'});
      if(!response.ok)throw new Error('Foto indisponível');
      const blob=await response.blob();
      if(!blob.type.startsWith('image/'))throw new Error('Arquivo inválido');
      const file=new File([blob],safeFileName(l.name,blob.type),{type:blob.type});
      if(!navigator.canShare({files:[file]}))return false;
      await navigator.share({
        title:l.name||'JP Leilões',
        text:msg,
        url:previewUrl,
        files:[file]
      });
      return true;
    }catch(error){
      if(error?.name==='AbortError')return true;
      console.warn('Compartilhamento com foto indisponível:',error);
      return false;
    }
  }

  shareWhats=async function(id){
    const l=(typeof lots!=='undefined'&&lots.find(x=>x.id===id))||await loadPublicLot(id);
    const preview=new URL('/api/share',location.origin);
    preview.searchParams.set('l',l.id);
    preview.searchParams.set('v',Date.now().toString());

    const starts=l.starts?endTime(l.starts):'agora';
    const ends=l.ends?endTime(l.ends):'a definir';
    const msg=`🔨 *${l.name||'JP Leilões'}*\n\n*Avaliação:* ${money(l.valuation)}\n*Lance inicial:* ${money(l.start)}\n*Acréscimo do lance:* ${money(l.step)}\n*Começa:* ${starts}\n*Termina:* ${ends}\n\n👉 Veja o produto e dê seu lance:`;

    const shared=await shareWithPhoto(l,msg,preview.toString());
    if(shared)return;

    const fallback=msg+'\n'+preview.toString();
    window.open('https://wa.me/?text='+encodeURIComponent(fallback),'_blank');
  };

  if(new URLSearchParams(location.search).has('lote')&&!document.querySelector('script[data-bid-history-live]')){
    const script=document.createElement('script');
    script.src='/bid-history-live.js?v=20260930-1';
    script.dataset.bidHistoryLive='1';
    document.body.appendChild(script);
  }
})();