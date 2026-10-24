const CACHE='jp-leiloes-shell-v7';
const STATIC=['/styles.css','/manifest.webmanifest?v=20261024-6','/jp-leiloes-logo.svg','/apple-touch-icon.png?v=20261024-1','/jp-leiloes-icon-192.png?v=20261024-1','/jp-leiloes-icon-512.png?v=20261024-1'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).catch(()=>null));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin)return;

  if(req.mode==='navigate'||req.destination==='document'){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
    return;
  }

  event.respondWith(fetch(req).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
    return response;
  }).catch(()=>caches.match(req)));
});