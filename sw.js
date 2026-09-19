/* Service worker: houdt de soundboard bruikbaar zonder internet.

   - audio: cache-first, die bestanden veranderen toch niet
   - de rest: netwerk-first MET revalidatie (cache: 'no-cache'), zodat een
     nieuwe versie meteen doorkomt. Zonder die vlag gaat het verzoek eerst
     langs de browsercache, en die houdt GitHub Pages-bestanden tien minuten
     vast — dan zie je na een update nog de oude soundboard.                */

var CACHE = 'bfss-v8';
var CORE = [
  './', './index.html', './css/style.css', './css/fonts.css',
  './fonts/audiowide-400.woff2', './fonts/chakra-petch-600.woff2', './fonts/chakra-petch-700.woff2', './fonts/monoton-400.woff2', './fonts/orbitron-500.woff2', './fonts/orbitron-700.woff2', './fonts/orbitron-900.woff2', './fonts/press-start-2p-400.woff2', './fonts/righteous-400.woff2', './fonts/vt323-400.woff2',
  './js/manifest.js', './js/icons.js', './js/settings.js', './js/audio.js', './js/ui.js', './js/app.js',
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
  if (e.data === 'skip-waiting') { self.skipWaiting(); return; }

  // De pagina stuurt na het laden de lijst met audio-urls die nu gelden.
  // Alles wat daar niet meer bij hoort mag uit de cache - anders blijft een
  // vervangen of gearchiveerd geluid voor altijd ruimte innemen.
  if (e.data && e.data.type === 'audio-keep' && Array.isArray(e.data.urls)) {
    e.waitUntil(caches.open(CACHE).then(function (c) {
      return c.keys().then(function (keys) {
        return Promise.all(keys.map(function (req) {
          var u = new URL(req.url);
          if (!isMedia(u.pathname)) return null;
          return e.data.urls.indexOf(u.pathname + u.search) >= 0 ? null : c.delete(req);
        }));
      });
    }));
  }
});

/* Video krijgt precies dezelfde behandeling als audio: uit de cache en met
   Range-antwoorden, want ook door een video wil je kunnen schuiven. */
function isMedia(pathname) { return /\.(mp3|ogg|wav|m4a|mp4|webm|mov|m4v)$/i.test(pathname); }

function mediaType(pathname) {
  if (/\.mp4$|\.m4v$|\.mov$/i.test(pathname)) return 'video/mp4';
  if (/\.webm$/i.test(pathname)) return 'video/webm';
  if (/\.ogg$/i.test(pathname)) return 'audio/ogg';
  if (/\.wav$/i.test(pathname)) return 'audio/wav';
  if (/\.m4a$/i.test(pathname)) return 'audio/mp4';
  return 'audio/mpeg';
}

/* Lange nummers worden gestreamd, en dan vraagt de browser stukjes op met een
   Range-kop. Een opgeslagen volledig antwoord teruggeven op zo'n verzoek breekt
   het doorspoelen, dus snijden we het juiste stuk er zelf uit en antwoorden met
   een 206. Zonder Range-kop gaat het gewoon zoals eerst: uit de cache als het
   er is, anders ophalen en bewaren.                                          */
function audioResponse(req) {
  var range = req.headers.get('range');
  var key = new Request(req.url, { credentials: 'same-origin' });

  return caches.match(key).then(function (hit) {
    if (!hit) {
      return fetch(req).then(function (res) {
        // Een 206 slaan we niet op; het volledige bestand halen we los op.
        if (res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(key, copy); });
        } else if (res.status === 206) {
          fetch(key).then(function (vol) {
            if (vol.ok) caches.open(CACHE).then(function (c) { c.put(key, vol); });
          }).catch(function () {});
        }
        return res;
      });
    }
    if (!range) return hit;

    return hit.arrayBuffer().then(function (buf) {
      var m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      var start = m[1] ? parseInt(m[1], 10) : 0;
      var end = m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
      if (isNaN(start) || start >= buf.byteLength) start = 0;
      if (isNaN(end) || end >= buf.byteLength) end = buf.byteLength - 1;
      var deel = buf.slice(start, end + 1);
      return new Response(deel, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
          'Content-Type': hit.headers.get('Content-Type') || mediaType(new URL(req.url).pathname),
          'Content-Length': String(deel.byteLength),
          'Content-Range': 'bytes ' + start + '-' + end + '/' + buf.byteLength
        }
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;      // Google Fonts e.d. met rust laten

  if (isMedia(url.pathname)) {
    e.respondWith(audioResponse(req));
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
