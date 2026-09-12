/* Service worker: houdt de soundboard bruikbaar zonder internet.

   - audio: cache-first, die bestanden veranderen toch niet
   - de rest: netwerk-first MET revalidatie (cache: 'no-cache'), zodat een
     nieuwe versie meteen doorkomt. Zonder die vlag gaat het verzoek eerst
     langs de browsercache, en die houdt GitHub Pages-bestanden tien minuten
     vast — dan zie je na een update nog de oude soundboard.                */

var CACHE = 'bfss-v3';
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

self.addEventListener('message', function (e) {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

function isAudio(pathname) { return /\.(mp3|ogg|wav|m4a)$/i.test(pathname); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;      // Google Fonts e.d. met rust laten

  if (isAudio(url.pathname)) {
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
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req); })
  );
});
