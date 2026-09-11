/* Service worker: houdt de soundboard bruikbaar zonder internet.
   - audio: cache-first (de bestanden veranderen niet)
   - rest:  netwerk-first met cache als terugval, zodat een update
            meteen doorkomt maar offline alsnog werkt */
var CACHE = 'bfss-v1';
var CORE = [
  './', './index.html', './css/style.css',
  './js/icons.js', './js/settings.js', './js/audio.js', './js/ui.js', './js/app.js',
  './data/sounds.json', './manifest.webmanifest', './favicon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(CORE).catch(function () {});
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k === CACHE ? null : caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;      // Google Fonts e.d. met rust laten

  if (/\.(mp3|ogg|wav|m4a)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    }));
    return;
  }

  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req); })
  );
});
