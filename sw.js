const CACHE='jp-leiloes-shell-v2';
const STATIC=['/styles.css','/app-icon.svg','/manifest.webmanifest','/jp-leiloes-logo.svg'];

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