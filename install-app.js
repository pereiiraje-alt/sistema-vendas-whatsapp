(()=>{
  // Garante que a logo do JP Leilões apareça mesmo se o CSS antigo estiver em cache.
  const brand=document.querySelector('.sidebar .brand');
  if(brand){
    brand.innerHTML='<img src="/jp-leiloes-logo.svg?v=20260930-2" alt="JP Leilões" style="display:block;width:100%;height:100%;object-fit:contain">';
    brand.style.background='transparent';
    brand.style.height='104px';
    brand.style.margin='0 4px 10px';
    brand.style.padding='0';
  }

  // A instalação do aplicativo é controlada exclusivamente pelo botão
  // "Baixar aplicativo" existente no menu principal (index.html).
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').catch(e=>console.warn('Service Worker:',e));
  }
})();