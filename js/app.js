/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — opstarten en wisselen van bord
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  global.APP_VERSION = '2026.09.27-1';

  var S = global.Settings, E = global.AudioEngine, UI = global.UI, B = global.Boards;
  function $(id) { return document.getElementById(id); }

  var splash = $('splash');
  var keuzes = $('splash-boards');
  var bar = $('splash-bar');
  var note = $('splash-note');
  var laden = $('splash-loading');
  var rescue = $('splash-rescue');

  var started = false;      // is het geluid al ontgrendeld en de interface opgezet?
  var bezig = false;        // er wordt nu een bord ingeladen
  var vooraf = null;        // het vooraf ophalen van het eerste bord

  /* Alle geluiden die er zijn. Ze komen uit js/manifest.js, dat als gewoon
     script bij de pagina hoort. Eerder werd die lijst met fetch opgehaald,
     en als dat misging bleef de hele soundboard staan - een enkele
     hapering in het netwerk maakte hem onbruikbaar. Een script dat al
     geladen is, kan niet meer mislukken. */
  var ALL = (global.SOUNDS && global.SOUNDS.sounds) || [];

  /* Elke wijziging aan het open bord gaat meteen naar zijn eigen plek. */
  S.onpersist = function (doc) { if (B.current) B.saveDoc(B.current, doc); };
  E.onprogress = function (p) { bar.style.width = Math.round(p * 100) + '%'; };

  B.load(ALL);

  /* ---- het startscherm ------------------------------------------- */

  /** De borden als grote knoppen. Het laatst gebruikte staat bovenaan en
      wordt alvast opgehaald, zodat starten meteen kan. */
  function toonKiezer() {
    keuzes.innerHTML = '';
    laden.hidden = true;
    keuzes.hidden = false;
    bar.style.width = '0';

    var volgorde = B.list.slice().sort(function (a, b) {
      return (a.key === B.last ? -1 : 0) - (b.key === B.last ? -1 : 0);
    });
    volgorde.forEach(function (b, i) {
      var n = B.count(b.key);
      var knop = document.createElement('button');
      knop.type = 'button';
      knop.className = 'splash-board' + (i === 0 ? ' is-first' : '');
      knop.innerHTML = '<span class="splash-board-name"></span>' +
        '<span class="splash-board-sub"></span>';
      knop.firstChild.textContent = b.title;
      knop.lastChild.textContent = (i === 0 && !started ? 'TIK OM TE STARTEN · ' : '') +
        n + (n === 1 ? ' KNOP' : ' KNOPPEN');
      knop.addEventListener('click', function () { start(b.key); });
      keuzes.appendChild(knop);
    });

    var nieuw = document.createElement('button');
    nieuw.type = 'button';
    nieuw.className = 'splash-new';
    nieuw.textContent = '+ NIEUW BORD';
    nieuw.addEventListener('click', function () { App.newBoard(); });
    keuzes.appendChild(nieuw);

    if (!ALL.length && !B.list.length) {
      note.textContent = 'De lijst met geluiden kon niet worden gelezen. ' +
        'Tik op ALLES OPNIEUW OPHALEN.';
      rescue.hidden = false;
    } else {
      note.textContent = 'Kies een bord. Alle geluiden ervan worden vooraf ingeladen, ' +
        'zodat er tijdens je optreden geen vertraging is.';
    }
  }

  /** Het startscherm als laadscherm, met de naam van het bord erop. */
  function toonLaden(titel) {
    keuzes.hidden = true;
    laden.hidden = false;
    laden.textContent = titel + ' INLADEN…';
    bar.style.width = '0';
    splash.hidden = false;
    splash.classList.remove('gone');
  }

  function verbergSplash() {
    splash.classList.add('gone');
    setTimeout(function () { if (splash.classList.contains('gone')) splash.hidden = true; }, 450);
  }

  /* ---- een bord openen ---------------------------------------------- */

  /** Opent een bord. De eerste keer gebeurt dat binnen de tik op het
      startscherm, want alleen dan mag het geluid aan (iOS eist dat). */
  function start(key, na) {
    if (bezig) return;
    var doc = B.doc(key);
    if (!doc) return;
    bezig = true;

    if (!started) E.openContext();          // binnen de tik zelf
    else E.fadeAll(0.35);                   // wat er speelde faadt weg
    UI.closeSheets && UI.closeSheets();
    toonLaden(doc.title);

    var wacht = started ? new Promise(function (r) { setTimeout(r, 380); }) : Promise.resolve();
    return wacht.then(function () {
      B.select(key);
      S.use(doc);
      var defs = B.defsFor(S.data, ALL);
      if (started) return E.load(defs);
      // Was dit het bord dat al vooraf werd opgehaald, dan gaat de rest
      // meteen; anders halen we nu op wat dit bord nodig heeft.
      var klaar = (vooraf && E.klaar && sameIds(E.klaar, defs)) ? vooraf : E.prefetch(defs, 'audio/');
      return Promise.resolve(klaar).then(function () { return E.unlock(); });
    }).then(function () {
      if (!started) {
        UI.init(ALL);
        started = true;
        tellServiceWorker();
        keepAwake();
      } else {
        UI.setBoard();
      }
      verbergSplash();
      bezig = false;
      if (na) na();
    }).catch(function (err) {
      console.error(err);
      bezig = false;
      toonKiezer();
      note.textContent = 'Er ging iets mis: ' + (err && err.message ? err.message : err) +
        '. Probeer het opnieuw, of tik op ALLES OPNIEUW OPHALEN.';
      rescue.hidden = false;
    });
  }

  function sameIds(a, b) {
    if (a.length !== b.length) return false;
    var ids = {};
    a.forEach(function (d) { ids[d.id] = 1; });
    return b.every(function (d) { return ids[d.id]; });
  }

  /* ---- wat de interface aan de app vraagt --------------------------- */
  var App = {
    /** Naar een ander bord. Duurt een paar tellen: eerst faadt uit wat er
        speelt, dan worden de geluiden van het nieuwe bord ingeladen. */
    switchTo: function (key, na) {
      if (key === B.current && started) { UI.closeSheets(); return; }
      start(key, na);
    },

    /** Vraagt om een naam en maakt het bord. Leeg, of een kopie van het
        bord dat open staat. */
    newBoard: function () {
      var keus = [{ id: 'leeg', name: 'LEEG BORD' }];
      if (started && B.current) keus.push({ id: 'kopie', name: 'KOPIE VAN ' + S.data.title });
      return UI.ask({
        title: 'NIEUW BORD',
        input: { placeholder: 'NAAM, BIJV. BRUILOFT OF AFSCHEID', max: 40, required: true },
        choices: { label: 'BEGIN MET', items: keus, value: 'leeg' },
        ok: 'MAKEN'
      }).then(function (r) {
        if (!r) return;
        var titel = r.value.toUpperCase();
        var key = r.choice === 'kopie' ? B.duplicate(B.current, titel) : B.create(titel, {});
        if (!key) return;
        start(key, function () {
          // een leeg bord: meteen klaar om te vullen
          if (!S.data.order.filter(Boolean).length) {
            UI.toggleEdit(true);
            UI.openAddSheet();
          }
        });
      });
    },

    /** Gooit een bord weg. Was het het open bord, dan gaat het volgende
        open; was het het laatste, dan terug naar het startscherm. */
    deleteBoard: function (key) {
      var wasOpen = key === B.current;
      B.remove(key);
      if (!wasOpen) { UI.renderBoardsSheet(); return; }
      UI.closeSheets();
      E.fadeAll(0.35);
      if (B.list.length) { start(B.list[0].key); return; }
      splash.hidden = false;
      splash.classList.remove('gone');
      toonKiezer();
    },

    /** Het open bord opnieuw inladen, bijvoorbeeld na importeren. */
    reload: function () {
      return E.load(B.defsFor(S.data, ALL)).then(function () { UI.setBoard(); });
    }
  };
  global.App = App;

  /* ---- klaarzetten -------------------------------------------------- */
  if (B.last) {
    var d0 = B.doc(B.last);
    if (d0) vooraf = E.prefetch(B.defsFor(S.merge(S.defaults(), d0), ALL), 'audio/');
  }
  toonKiezer();

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

  /** Laat de service worker weten welke audio-urls nu gelden: alles wat er
      is, niet alleen het open bord - anders gooit hij bij elke wissel de
      geluiden van de andere borden uit de cache. */
  function tellServiceWorker() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    var urls = ALL.map(function (d) {
      return new URL(E.srcFor(d), global.location.href);
    }).map(function (u) { return u.pathname + u.search; });
    navigator.serviceWorker.controller.postMessage({ type: 'audio-keep', urls: urls });
  }

  /* ---- nieuwe versie opmerken en aanbieden ----------------------- */
  var updateBar = $('update-bar');
  var waiting = null;

  function offerUpdate(worker) {
    waiting = worker;
    updateBar.hidden = false;
  }

  $('update-now').addEventListener('click', function () {
    updateBar.hidden = true;
    if (waiting) waiting.postMessage('skip-waiting');
    global.location.reload();
  });
  $('update-later').addEventListener('click', function () {
    updateBar.hidden = true;
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
