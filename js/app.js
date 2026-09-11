/* ------------------------------------------------------------------
   THE BIG FAT SPEECH SOUNDBOARD — opstarten
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var S = global.Settings, E = global.AudioEngine, UI = global.UI;
  var splash = document.getElementById('splash');
  var btn = document.getElementById('splash-btn');
  var btnText = document.getElementById('splash-btn-text');
  var bar = document.getElementById('splash-bar');
  var note = document.getElementById('splash-note');

  var defs = null, prefetching = null, started = false;

  S.load();

  E.onprogress = function (p) { bar.style.width = Math.round(p * 100) + '%'; };

  /* De bytes gaan meteen binnenhalen; het decoderen wacht op de eerste tik. */
  fetch('data/sounds.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('sounds.json: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      defs = data.sounds || [];
      if (!defs.length) throw new Error('Geen geluiden in data/sounds.json');
      note.textContent = defs.length + ' geluiden worden vooraf ingeladen, ' +
        'zodat er tijdens je speech geen vertraging is.';
      prefetching = E.prefetch(defs, 'audio/');
      return prefetching;
    })
    .catch(function (err) {
      console.error(err);
      note.textContent = 'Inladen mislukt: ' + err.message;
    });

  btn.addEventListener('click', function () {
    if (started) return;
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
        splash.classList.add('gone');
        setTimeout(function () { splash.hidden = true; }, 450);
        keepAwake();
      })
      .catch(function (err) {
        console.error(err);
        started = false;
        btn.disabled = false;
        btnText.textContent = 'OPNIEUW PROBEREN';
        note.textContent = 'Er ging iets mis: ' + err.message;
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

  if ('serviceWorker' in navigator) {
    global.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})(window);
