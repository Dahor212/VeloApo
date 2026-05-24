// VeloTimer Service Worker v3
const CACHE = 'velotimer-v3';
const ASSETS = [
  '/', '/index.html', '/app.js', '/manifest.json',
  '/img/wall1-sunset-mountain.webp', '/img/wall2-blue-lake.webp',
  '/img/wall3-lake-church.webp', '/img/wall4-bike-meadow.webp',
  '/img/wall5-tuscany.webp', '/img/wall6-bike-fence.webp',
  '/img/wall7-plains-road.webp', '/img/wall8-alpine-snow.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first for API calls, cache first for assets
  if (e.request.url.includes('workers.dev') || e.request.url.includes('strava.com') || e.request.url.includes('open-meteo')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', {headers:{'Content-Type':'application/json'}})));
    return;
  }
  if (e.request.url.includes('tile.openstreetmap') || e.request.url.includes('leaflet')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    })));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/index.html'))));
});
