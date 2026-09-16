/* ------------------------------------------------------------------
   THE BIG FAT SPEECH SOUNDBOARD — opstarten
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  global.APP_VERSION = '2026.09.16-5';

  var S = global.Settings, E = global.AudioEngine, UI = global.UI;
  var splash = document.getElementById('splash');
  var btn = document.getElementById('splash-btn');
  var btnText = document.getElementById('splash-btn-text');
  var bar = document.getElementById('splash-bar');
  var note = document.getElementById('splash-note');

  var prefetching = null, started = false;
  var rescue = document.getElementById('splash-rescue');

  S.load();

  E.onprogress = function (p) { bar.style.width = Math.round(p * 100) + '%'; };

  /* Het manifest komt uit js/manifest.js, dat als gewoon script bij de pagina
     hoort. Eerder werd het met fetch opgehaald, en als dat misging bleef de
     hele soundboard staan - een enkele hapering in het netwerk maakte hem
     onbruikbaar. Een script dat al geladen is, kan niet meer mislukken. */
  var defs = (global.SOUNDS && global.SOUNDS.sounds) || null;

  if (!defs || !defs.length) {
    note.textContent = 'De lijst met geluiden kon niet worden gelezen. ' +
      'Tik op ALLES OPNIEUW OPHALEN.';
    btn.disabled = true;
    rescue.hidden = false;
  } else {
    note.textContent = defs.length + ' geluiden worden vooraf ingeladen, ' +
      'zodat er tijdens je speech geen vertraging is.';
    prefetching = E.prefetch(defs, 'audio/');
  }

  /* Noodknop: alles opgeslagen weggooien en opnieuw beginnen. */
  rescue.addEventListener('click', function () {
    rescue.disabled = true;
    rescue.textContent = 'OPSCHONEN…';
    var klaar = [];
    if (global.caches && caches.keys) {
      klaar.push(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      klaar.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }));
    }
    Promise.all(klaar).catch(function () {}).then(function () {
      global.location.reload();
    });
  });

  btn.addEventListener('click', function () {
    if (started) return;
    if (!defs || !defs.length) { rescue.hidden = false; return; }
    started = true;

    // Context openen binnen de tik zelf — iOS eist dat.
    E.openContext();
    btn.disabled = true;
    btnText.textContent = 'INLADEN…';

    Promise.resolve(prefetching)
      .then(function () { return E.unlock(); })
      .then(function () {
        // Eigen volume-afwijkingen terugzetten.
        Object.keys(S.data.sounds).forEach(function (id) {
          var t = S.data.sounds[id].trimDb;
          if (t) E.setTrim(id, t);
        });
        E.setMaster(S.data.masterVolume);

        UI.init(defs);
        // kopieën die al bestonden er alsnog bij laden
        var clones = S.data.clones || [];
        if (clones.length) {
          Promise.all(clones.map(function (c) { return E.loadOne(c); }))
            .then(function () {
              clones.forEach(function (c) { UI.pushEdit(c.id); });
              UI.paint();
            });
        }
        tellServiceWorker(defs);
        splash.classList.add('gone');
        setTimeout(function () { splash.hidden = true; }, 450);
        keepAwake();
      })
      .catch(function (err) {
        console.error(err);
        started = false;
        prefetching = E.prefetch(defs, 'audio/');   // opnieuw proberen betekent
        btn.disabled = false;                       // ook echt opnieuw ophalen
        btnText.textContent = 'OPNIEUW PROBEREN';
        note.textContent = 'Er ging iets mis: ' + (err && err.message ? err.message : err) +
          '. Lukt het niet, tik dan op ALLES OPNIEUW OPHALEN.';
        rescue.hidden = false;
      });
  });

  /* Na een telefoontje of een schermvergrendeling kan iOS de context
     pauzeren; bij terugkeer weer aanzetten. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (E.ctx && E.ctx.state === 'suspended') E.ctx.resume();
      keepAwake();
    }
  });

  /* Scherm aan houden tijdens de speech. */
  var lock = null;
  function keepAwake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    if (lock) return;
    navigator.wakeLock.request('screen').then(function (l) {
      lock = l;
      l.addEventListener('release', function () { lock = null; });
    }).catch(function () { /* mag mislukken, is een extraatje */ });
  }

  /** Laat de service worker weten welke audio-urls nu gelden. */
  function tellServiceWorker(list) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    var base = new URL('audio/', global.location.href).pathname;
    navigator.serviceWorker.controller.postMessage({
      type: 'audio-keep',
      urls: list.map(function (d) { return base + d.file + (d.hash ? '?v=' + d.hash : ''); })
    });
  }

  /* ---- nieuwe versie opmerken en aanbieden ----------------------- */
  var bar = document.getElementById('update-bar');
  var waiting = null;

  function offerUpdate(worker) {
    waiting = worker;
    bar.hidden = false;
  }

  document.getElementById('update-now').addEventListener('click', function () {
    bar.hidden = true;
    if (waiting) waiting.postMessage('skip-waiting');
    global.location.reload();
  });
  document.getElementById('update-later').addEventListener('click', function () {
    bar.hidden = true;
  });

  if (!global.NO_SW && 'serviceWorker' in navigator) {
    global.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            // Alleen melden als er al een versie draaide; bij de eerste
            // installatie valt er niets te vernieuwen.
            if (sw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(sw);
          });
        });
        setInterval(function () { reg.update().catch(function () {}); }, 15 * 60 * 1000);
      }).catch(function () {});
    });
  }
})(window);
