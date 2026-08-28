const CACHE='psico-luz-v7-subpath';
const BASE=new URL(self.registration.scope).pathname.replace(/\/$/,'');
const scoped=path=>`${BASE}/${String(path||'').replace(/^\/+/, '')}`;
const STATIC=[scoped(''),scoped('agenda.html'),scoped('panel.html'),scoped('sesion-clinica.html'),scoped('manifest.webmanifest'),scoped('icon.svg')];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.pathname.startsWith(scoped('api/'))||u.pathname===scoped('health'))return;event.respondWith(fetch(event.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return r}).catch(()=>caches.match(event.request).then(r=>r||caches.match(scoped('agenda.html'))))});
