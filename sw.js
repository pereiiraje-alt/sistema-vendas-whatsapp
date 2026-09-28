const CACHE='jp-leiloes-shell-v1';
const SHELL=['/','/index.html','/styles.css','/app-icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>null));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
  event.respondWith(fetch(req).catch(()=>caches.match(req).then(r=>r||caches.match('/index.html'))));
});