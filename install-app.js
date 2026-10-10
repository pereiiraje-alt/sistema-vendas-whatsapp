(()=>{
  let deferredPrompt=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const nav=document.getElementById('nav');
  if(!nav)return;

  // Garante que a logo do JP Leilões apareça mesmo se o CSS antigo estiver em cache.
  const brand=document.querySelector('.sidebar .brand');
  if(brand){
    brand.innerHTML='<img src="/jp-leiloes-logo.svg?v=20260930-2" alt="JP Leilões" style="display:block;width:100%;height:100%;object-fit:contain">';
    brand.style.background='transparent';
    brand.style.height='104px';
    brand.style.margin='0 4px 10px';
    brand.style.padding='0';
  }


  if(standalone()){
    if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(e=>console.warn('Service Worker:',e));}
    return;
  }

  let button=document.getElementById('installAppButton');
  if(!button){
    button=document.createElement('button');
    button.type='button';button.id='installAppButton';button.textContent='📱 Instalar aplicativo';
    (document.getElementById('secondaryMenuBody')||nav).appendChild(button);
  }

  function instructions(){
    if(isiOS){
      alert('Para instalar a JP Leilões no iPhone:\n\n1. Abra este site no Safari.\n2. Toque em Compartilhar.\n3. Escolha “Adicionar à Tela de Início”.\n4. Confirme em Adicionar.');
      return;
    }
    alert('Para instalar a JP Leilões no celular, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.');
  }

  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredPrompt=event;});
  window.addEventListener('appinstalled',()=>{button?.remove();deferredPrompt=null;});

  button.onclick=async()=>{
    if(standalone()){button.remove();return;}
    if(!deferredPrompt){instructions();return;}
    deferredPrompt.prompt();
    try{await deferredPrompt.userChoice}catch(_){ }
    deferredPrompt=null;
  };

  if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(e=>console.warn('Service Worker:',e));}
})();