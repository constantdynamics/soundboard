/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — opstarten, links en wisselen van bord
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  global.APP_VERSION = '2026.09.27-3';

  var S = global.Settings, E = global.AudioEngine, UI = global.UI, B = global.Boards;
  var Cloud = global.Cloud, Library = global.Library, Sync = global.Sync;
  function $(id) { return document.getElementById(id); }

  var splash = $('splash');
  var keuzes = $('splash-boards');
  var bar = $('splash-bar');
  var note = $('splash-note');
  var laden = $('splash-loading');
  var rescue = $('splash-rescue');

  var started = false;      // is het geluid al ontgrendeld en de interface opgezet?
  var bezig = false;        // er wordt nu een bord ingeladen
  var modus = 'kiezer';     // wat het startscherm laat zien: kiezer, laden of weg

  /** Alle geluiden die bij een bord kunnen horen: de standaardgeluiden van
      de site, je online bibliotheek, en wat er op het bord zelf staat. In
      een noodpakket zit dat laatste in de pagina ingebakken. */
  function allFor(key) {
    if (global.NOODPAKKET) return Library.all(global.PRESET_DEFS || []);
    return Library.all(key && B.isOnline(key) ? B.defs(key) : []);
  }

  /* Elke wijziging aan het open bord gaat meteen naar zijn eigen plek op
     het toestel, en bij een online bord daarna naar de database. */
  S.onpersist = function (doc) {
    if (!B.current) return;
    B.saveDoc(B.current, doc);
    if (B.isOnline(B.current)) Sync.changed();
  };
  E.onprogress = function (p) { bar.style.width = Math.round(p * 100) + '%'; };

  B.load(Library.builtin);

  /* ---- links in het adres ------------------------------------------- */

  /** #ik=..., #uitnodiging=..., #speel=... of #bewerk=... */
  function leesLink() {
    var m = /^#(ik|uitnodiging|speel|bewerk)=([A-Za-z0-9_-]{6,80})$/.exec(global.location.hash || '');
    return m ? { soort: m[1], waarde: m[2] } : null;
  }

  /* Weg uit de adresbalk: een persoonlijke link hoort niet in een
     schermafbeelding of in de geschiedenis van een gedeelde computer. */
  function wisLink() {
    try { global.history.replaceState(null, '', global.location.pathname + global.location.search); }
    catch (e) {}
  }

  function verwerkLink(link) {
    if (!link || !Cloud.enabled) return Promise.resolve();
    if (link.soort === 'ik') {
      if (!started) zegLaden('JE PERSOONLIJKE LINK CONTROLEREN…');
      return Cloud.claim(link.waarde).then(function (me) {
        UI.toast('WELKOM, ' + me.name);
      }, function (err) {
        return UI.ask({
          title: 'PERSOONLIJKE LINK',
          text: err.status === 0 ? 'Er is nu geen verbinding. Open de link straks opnieuw.' : err.message,
          ok: 'OK', cancel: false
        });
      });
    }
    if (link.soort === 'uitnodiging') {
      if (Cloud.ik()) {
        UI.toast('JE HEBT AL EEN PERSOONLIJKE LINK');
        return Promise.resolve();
      }
      return vraagNaam(link.waarde);
    }
    // een bord via een link
    if (!started) zegLaden('BORD OPHALEN…');
    return Cloud.rpc('sb_board_get', { p_ik: Cloud.ik(), p_token: link.waarde }).then(function (b) {
      var key = B.putOnline(b, link.waarde);
      B.last = key;
      B.saveList();
      if (!started) UI.toast(b.title + ' — TIK OM TE STARTEN');
      return key;
    }, function (err) {
      return UI.ask({
        title: 'BORD NIET GEVONDEN',
        text: err.status === 0 ? 'Er is nu geen verbinding. Open de link straks opnieuw.' : err.message,
        ok: 'OK', cancel: false
      });
    });
  }

  /** Meedoen met een uitnodiging: naam vragen, daarna de persoonlijke link laten zien. */
  function vraagNaam(code) {
    return UI.ask({
      title: 'WELKOM BIJ THE BIG FAT SOUNDBOARD',
      text: 'Je bent uitgenodigd. Daarmee kun je eigen borden maken, geluiden uploaden en borden delen. Hoe heet je?',
      input: { placeholder: 'JE NAAM', max: 30, required: true },
      ok: 'DOORGAAN'
    }).then(function (r) {
      if (!r) return;
      return Cloud.join(code, r.value).then(function () {
        return UI.showPersonalLink(true);
      }, function (err) {
        return UI.ask({ title: 'DAT LUKTE NIET', text: err.message, ok: 'OK', cancel: false });
      });
    });
  }

  /* ---- op de achtergrond: je borden en bibliotheek ------------------ */

  /** Haalt je online borden en bibliotheek op, en zet borden die alleen op
      dit toestel stonden online. Mag mislukken: zonder netwerk werkt alles
      met wat er bewaard is. */
  function achtergrond() {
    if (!Cloud.enabled || !Cloud.ik()) return Promise.resolve();
    var ik = Cloud.ik();
    return Promise.all([
      Library.load().catch(function () {}),
      Cloud.refreshMe().catch(function () {}),
      Cloud.rpc('sb_boards_list', { p_ik: ik }).then(function (lijst) {
        B.mergeServerList(lijst);
      }).catch(function () {})
    ]).then(function () {
      return zetOnline();
    }).then(function () {
      if (modus === 'kiezer') toonKiezer();
      if (started && UI.onLibrary) UI.onLibrary();
    });
  }

  /** Borden die alleen op dit toestel staan gaan online, zodra je een
      persoonlijke link hebt. Kopieën van oude snit wijzen daarna naar hun
      bron, en de geluiden uit je bibliotheek horen bij het nieuwe bord. */
  var onlineBezig = null;   // één ronde tegelijk, anders komt een bord er twee keer
  function zetOnline() {
    if (onlineBezig) return onlineBezig;
    var lokaal = B.list.filter(function (e) { return !e.online; });
    var keten = Promise.resolve();
    lokaal.forEach(function (e) {
      keten = keten.then(function () {
        var doc = B.doc(e.key);
        if (!doc) return;
        if (!eigenOnline(e.title)) return eenOnline(e, doc, e.title);
        /* Een eigen online bord met dezelfde naam: meestal hetzelfde bord,
           al online gezet vanaf een ander toestel. Niet zomaar een tweede
           maken, maar vragen - en niet midden in een optreden. */
        if (started) return;
        return UI.ask({
          title: e.title + ' STAAT AL ONLINE',
          text: 'Je hebt al een online bord ' + e.title + ', waarschijnlijk vanaf een ander toestel. ' +
                'Op dit toestel staat ook een bord met die naam. Zet je dat er als tweede bord bij, ' +
                'of haal je het van dit toestel weg? Het online bord blijft hoe dan ook bestaan.',
          ok: 'OOK ONLINE ZETTEN',
          cancel: 'WEGHALEN VAN DIT TOESTEL'
        }).then(function (r) {
          if (r) {
            var n = 2;
            while (eigenOnline(e.title + ' ' + n)) n++;
            return eenOnline(e, doc, e.title + ' ' + n);
          }
          B.remove(e.key);
        });
      });
    });
    function klaar() { onlineBezig = null; }
    onlineBezig = keten.then(klaar, klaar);
    return onlineBezig;
  }

  /** Staat er al een eigen online bord met deze naam? */
  function eigenOnline(titel) {
    return B.list.some(function (x) { return x.online && x.role === 'owner' && x.title === titel; });
  }

  function eenOnline(e, doc, titel) {
    doc = B.modernClones(JSON.parse(JSON.stringify(doc)), Library.builtin);
    doc.title = titel;
    var mijn = {};
    Library.mine().forEach(function (d) { mijn[d.id] = 1; });
    var ids = {};
    (doc.order || []).concat(doc.archived || []).forEach(function (id) { if (id && mijn[id]) ids[id] = 1; });
    (doc.clones || []).forEach(function (c) { if (c && c.of && mijn[c.of]) ids[c.of] = 1; });
    var volume = doc.masterVolume;
    return Cloud.rpc('sb_board_create', {
      p_ik: Cloud.ik(), p_title: titel, p_doc: doc, p_sounds: Object.keys(ids)
    }).then(function (b) {
      adopt(e.key, b, volume);
      UI.toast(b.title + ' STAAT NU ONLINE');
    }).catch(function (err) { console.warn('Online zetten mislukt:', e.title, err); });
  }

  /** Het online bord neemt de plek in van het lokale, ook als dat net open
      staat: dan werk je gewoon verder, maar nu online. */
  function adopt(oudKey, b, volume) {
    var i = -1;
    B.list.forEach(function (x, j) { if (x.key === oudKey) i = j; });
    var wasOpen = B.current === oudKey;
    var wasLast = B.last === oudKey;
    B.remove(oudKey);
    var key = B.putOnline(b, null);
    var doc = B.doc(key);
    if (volume !== undefined) { doc.masterVolume = volume; B.saveDoc(key, doc); }
    // terug op dezelfde plek in de lijst
    var e = B.entry(key);
    B.list = B.list.filter(function (x) { return x.key !== key; });
    B.list.splice(Math.max(0, i), 0, e);
    if (wasLast) B.last = key;
    B.saveList();
    if (wasOpen) {
      B.current = key;
      var nu = S.data;
      S.use(B.doc(key));
      S.data.masterVolume = nu.masterVolume;
      UI.all = allFor(key);
      Sync.start(key);
      if (UI.paintBoardTitle) UI.paintBoardTitle();
    }
  }

  /* ---- het startscherm ------------------------------------------- */

  /** De borden als grote knoppen. Het laatst gebruikte staat bovenaan en
      wordt alvast opgehaald, zodat starten meteen kan. */
  function toonKiezer() {
    if (bezig) return;
    modus = 'kiezer';
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
      knop.className = 'splash-board' + (i === 0 ? ' is-first' : '') + (b.gone ? ' is-gone' : '');
      knop.innerHTML = '<span class="splash-board-name"></span><span class="splash-board-sub"></span>';
      knop.firstChild.textContent = b.title;
      var sub = [];
      if (i === 0 && !started) sub.push('TIK OM TE STARTEN');
      if (b.stub) sub.push('NOG NIET OP DIT TOESTEL');
      else sub.push(n + (n === 1 ? ' KNOP' : ' KNOPPEN'));
      if (b.online && b.role === 'play') sub.push('ALLEEN SPELEN');
      if (b.online && b.role === 'edit') sub.push('VAN ' + (b.owner || 'EEN ANDER'));
      knop.lastChild.textContent = sub.join(' · ');
      knop.addEventListener('click', function () { start(b.key); });
      keuzes.appendChild(knop);
    });

    var nieuw = document.createElement('button');
    nieuw.type = 'button';
    nieuw.className = 'splash-new';
    nieuw.textContent = '+ NIEUW BORD';
    nieuw.addEventListener('click', function () { App.newBoard(); });
    keuzes.appendChild(nieuw);

    if (!B.list.length) {
      note.textContent = Cloud.ik()
        ? 'Nog geen borden. Maak er een, of open de link van een bord dat je hebt gekregen.'
        : 'Nog geen borden. Maak er een op dit toestel, of open de link die je hebt gekregen: ' +
          'een uitnodiging, je persoonlijke link of de link van een bord.';
    } else {
      note.textContent = 'Kies een bord. Alle geluiden ervan worden vooraf ingeladen, ' +
        'zodat er tijdens je optreden geen vertraging is.';
    }
  }

  function zegLaden(tekst) {
    modus = 'laden';
    keuzes.hidden = true;
    laden.hidden = false;
    laden.textContent = tekst;
  }

  /** Het startscherm als laadscherm, met de naam van het bord erop. */
  function toonLaden(titel) {
    zegLaden(titel + ' INLADEN…');
    bar.style.width = '0';
    splash.hidden = false;
    splash.classList.remove('gone');
  }

  function verbergSplash() {
    modus = 'weg';
    splash.classList.add('gone');
    setTimeout(function () { if (splash.classList.contains('gone')) splash.hidden = true; }, 450);
  }

  /** Een belofte die na ms opgeeft (met null), en wat daarna nog binnenkomt
      laat liggen. Zo wacht het openen van een bord nooit lang op het netwerk. */
  function binnen(ms, belofte) {
    return new Promise(function (resolve, reject) {
      var klaar = false;
      setTimeout(function () { if (!klaar) { klaar = true; resolve(null); } }, ms);
      belofte.then(function (v) { if (!klaar) { klaar = true; resolve(v); } },
                   function (e) { if (!klaar) { klaar = true; reject(e); } });
    });
  }

  /* ---- een bord openen ---------------------------------------------- */

  /** Opent een bord. De eerste keer gebeurt dat binnen de tik op het
      startscherm, want alleen dan mag het geluid aan (iOS eist dat). Een
      online bord wordt eerst even bij de database nagevraagd; duurt dat te
      lang of is er geen netwerk, dan opent de bewaarde versie. */
  function start(key, na) {
    if (bezig) return;
    var e = B.entry(key);
    if (!e) return;
    bezig = true;

    if (!started) E.openContext();          // binnen de tik zelf
    else E.fadeAll(0.35);                   // wat er speelde faadt weg
    if (UI.closeSheets) UI.closeSheets();
    Sync.stop();
    toonLaden(e.title);

    var wacht = started ? new Promise(function (r) { setTimeout(r, 380); }) : Promise.resolve();
    var vers = (e.online && Cloud.enabled)
      ? binnen(e.stub ? 12000 : 4000, Cloud.rpc('sb_board_get', Sync.auth(key))).catch(function (err) {
          if (err.status === 403 || err.status === 404) {
            e.gone = true;
            B.saveList();
            UI.toast(err.message, 5000);
          }
          return null;
        })
      : Promise.resolve(null);

    return Promise.all([wacht, vers]).then(function (r) {
      if (r[1]) B.putOnline(r[1], null);
      var doc = B.select(key);
      if (!doc) throw new Error('Dit bord staat nog niet op dit toestel, en er is nu geen verbinding.');
      S.use(doc);
      var all = allFor(key);
      var defs = B.defsFor(S.data, all);
      if (started) {
        UI.all = all;
        return E.load(defs);
      }
      // Wat al vooraf werd opgehaald hoeft niet nog eens: dezelfde opname
      // (zelfde bestand of url) haakt in op de lopende of klare download.
      // Zo telt ook dat een geluid intussen uit de online opslag komt.
      return E.prefetch(defs, 'audio/').then(function () { return E.unlock(); });
    }).then(function () {
      if (!started) {
        UI.init(allFor(key));
        started = true;
        keepAwake();
      } else {
        UI.setBoard();
      }
      tellServiceWorker();
      if (B.isOnline(key)) Sync.start(key);
      verbergSplash();
      bezig = false;
      if (na) na();
    }).catch(function (err) {
      console.error(err);
      bezig = false;
      toonKiezer();
      note.textContent = 'Er ging iets mis: ' + (err && err.message ? err.message : err) +
        ' Probeer het opnieuw, of tik op ALLES OPNIEUW OPHALEN.';
      rescue.hidden = false;
    });
  }

  /* ---- wat de interface aan de app vraagt --------------------------- */
  var App = {
    allFor: allFor,

    /** Naar een ander bord. Duurt een paar tellen: eerst faadt uit wat er
        speelt, dan worden de geluiden van het nieuwe bord ingeladen. */
    switchTo: function (key, na) {
      if (key === B.current && started) { UI.closeSheets(); return; }
      start(key, na);
    },

    /** Vraagt om een naam en maakt het bord: leeg of als kopie van het bord
        dat open staat. Met een persoonlijke link staat het meteen online. */
    newBoard: function () {
      var keus = [{ id: 'leeg', name: 'LEEG BORD' }];
      if (started && B.current) keus.push({ id: 'kopie', name: 'KOPIE VAN ' + S.data.title });
      var sjablonen = global.TEMPLATES || [];
      sjablonen.forEach(function (t) {
        keus.push({ id: 'sjabloon:' + t.id, name: t.name, hint: t.uitleg });
      });
      var namen = sjablonen.map(function (t) { return t.name; });
      return UI.ask({
        title: 'NIEUW BORD',
        input: { placeholder: 'NAAM, BIJV. BRUILOFT OF AFSCHEID', max: 40, required: true },
        choices: {
          label: 'BEGIN MET', items: keus, value: 'leeg',
          // een sjabloon geeft het bord alvast zijn naam, zolang je zelf niets typte
          onPick: function (it, veld) {
            var nu = veld.value.trim().toUpperCase();
            var vrij = !nu || namen.indexOf(nu) >= 0;
            if (/^sjabloon:/.test(it.id)) { if (vrij) veld.value = it.name; }
            else if (namen.indexOf(nu) >= 0) veld.value = '';
          }
        },
        ok: 'MAKEN'
      }).then(function (r) {
        if (!r) return;
        var titel = r.value.toUpperCase();
        var doc = {};
        if (r.choice === 'kopie') doc = JSON.parse(JSON.stringify(S.data));
        else if (/^sjabloon:/.test(r.choice)) doc = global.Templates.doc(r.choice.slice(9));
        doc.title = titel;
        return App.createBoard(titel, doc, r.choice === 'kopie' ? B.current : null);
      });
    },

    /** Maakt een bord: online als dat kan, anders op dit toestel. `bron`
        is het bord waar het een kopie van is (om de geluiden mee te geven). */
    createBoard: function (titel, doc, bron) {
      var klaar;
      if (Cloud.enabled && Cloud.ik()) {
        var ids = {};
        var bronDefs = bron && B.isOnline(bron) ? B.defs(bron) : [];
        var toegestaan = {};
        Library.list.forEach(function (d) { toegestaan[d.id] = 1; });
        bronDefs.forEach(function (d) { if (d.mine || d.shared) toegestaan[d.id] = 1; });
        (doc.order || []).concat(doc.archived || []).forEach(function (id) { if (id && toegestaan[id]) ids[id] = 1; });
        (doc.clones || []).forEach(function (c) { if (c && c.of && toegestaan[c.of]) ids[c.of] = 1; });
        var volume = doc.masterVolume;
        klaar = Cloud.rpc('sb_board_create', {
          p_ik: Cloud.ik(), p_title: titel, p_doc: doc, p_sounds: Object.keys(ids)
        }).then(function (b) {
          var key = B.putOnline(b, null);
          if (volume !== undefined) {
            var d = B.doc(key);
            d.masterVolume = volume;
            B.saveDoc(key, d);
          }
          return key;
        }, function (err) {
          if (err.status !== 0) throw err;
          // geen netwerk: dan maar op dit toestel; het gaat later vanzelf online
          UI.toast('GEEN VERBINDING: HET BORD STAAT EERST ALLEEN OP DIT TOESTEL', 4000);
          return B.create(titel, doc);
        });
      } else {
        klaar = Promise.resolve(B.create(titel, doc));
      }
      return klaar.then(function (key) {
        if (!key) return;
        start(key, function () {
          // een leeg bord: meteen klaar om te vullen
          if (!S.data.order.filter(Boolean).length && Sync.canEdit()) {
            UI.toggleEdit(true);
            UI.openAddSheet();
          }
        });
      }, function (err) {
        UI.ask({ title: 'BORD MAKEN LUKTE NIET', text: err.message, ok: 'OK', cancel: false });
      });
    },

    /** Een eigen kopie van een online bord (bijvoorbeeld een bord dat je
        met een SPEEL-link kreeg). Privé-geluiden van een ander gaan niet
        mee: die knoppen worden lege plekken. */
    copyBoard: function (key, titel) {
      var e = B.entry(key);
      if (!e || !e.online) {
        var k = B.duplicate(key, titel);
        if (k) start(k);
        return Promise.resolve();
      }
      if (!Cloud.ik()) {
        return UI.ask({
          title: 'EIGEN KOPIE',
          text: 'Voor een eigen kopie heb je een persoonlijke link nodig. Die krijg je met een uitnodiging.',
          ok: 'OK', cancel: false
        });
      }
      var doc = JSON.parse(JSON.stringify(key === B.current ? S.data : B.doc(key)));
      var weg = {}, aantal = 0;
      B.defs(key).forEach(function (d) { if (!d.mine && !d.shared) { weg[d.id] = 1; aantal++; } });
      // een kopie-knop waarvan de bron niet meegaat, gaat ook niet mee
      doc.clones = (doc.clones || []).filter(function (c) {
        if (c && c.of && weg[c.of]) { weg[c.id] = 1; return false; }
        return true;
      });
      doc.order = (doc.order || []).map(function (id) { return id && weg[id] ? null : id; });
      doc.archived = (doc.archived || []).filter(function (id) { return !weg[id]; });
      Object.keys(doc.sounds || {}).forEach(function (id) { if (weg[id]) delete doc.sounds[id]; });
      doc.title = titel;
      var volume = doc.masterVolume;
      return Cloud.rpc('sb_board_copy', {
        p_ik: Cloud.ik(), p_token: e.token || null, p_board: key, p_title: titel, p_doc: doc
      }).then(function (b) {
        var k = B.putOnline(b, null);
        if (volume !== undefined) { var d = B.doc(k); d.masterVolume = volume; B.saveDoc(k, d); }
        start(k, function () {
          if (aantal) UI.toast(aantal + (aantal === 1 ? ' PRIVÉ-GELUID' : ' PRIVÉ-GELUIDEN') +
                               ' VAN DE MAKER GING NIET MEE', 4500);
        });
      }, function (err) {
        UI.ask({ title: 'KOPIE MAKEN LUKTE NIET', text: err.message, ok: 'OK', cancel: false });
      });
    },

    /** Gooit een bord weg (de maker), of haalt het uit je lijst (wie het
        via een link had). Was het het open bord, dan gaat het volgende
        open; was het het laatste, dan terug naar het startscherm. */
    deleteBoard: function (key) {
      var e = B.entry(key);
      var klaar = Promise.resolve();
      if (e && e.online && Cloud.ik()) {
        klaar = Cloud.rpc('sb_board_delete', { p_ik: Cloud.ik(), p_board: key }).catch(function (err) {
          if (err.status === 0) throw new Error('Er is nu geen verbinding; probeer het straks opnieuw.');
          // 403/404: het was al weg of niet van jou; dan alleen hier weghalen
        });
      }
      return klaar.then(function () {
        var wasOpen = key === B.current;
        if (wasOpen) Sync.stop();
        B.remove(key);
        if (!wasOpen) { UI.renderBoardsSheet(); return; }
        UI.closeSheets();
        E.fadeAll(0.35);
        if (B.list.length) { start(B.list[0].key); return; }
        splash.hidden = false;
        splash.classList.remove('gone');
        toonKiezer();
      }, function (err) {
        UI.ask({ title: 'VERWIJDEREN LUKTE NIET', text: err.message, ok: 'OK', cancel: false });
      });
    },

    /** Het open bord opnieuw inladen, bijvoorbeeld na importeren of na het
        binnenhalen van wijzigingen van een ander. */
    reload: function () {
      var all = allFor(B.current);
      UI.all = all;
      return E.load(B.defsFor(S.data, all)).then(function () { UI.setBoard(); });
    },

    /** Wijzigingen van een ander binnenhalen (na de melding). Eerst gaat wat
        wij nog hadden de deur uit, dan komt de nieuwste versie binnen. */
    acceptRemote: function () {
      var key = B.current;
      if (!key) return Promise.resolve();
      var nu = S.data;
      B.saveDoc(key, nu);
      return Sync.flush().then(function () { return Sync.pull(key); }).then(function () {
        if (key !== B.current) return;
        S.use(B.doc(key));
        return App.reload();
      }).then(function () {
        UI.toast('BIJGEWERKT');
      }, function (err) {
        UI.toast(err.status === 0 ? 'GEEN VERBINDING: PROBEER HET STRAKS OPNIEUW' : err.message, 4000);
      });
    },

    /** Een geluid dat net bij een online bord is gekomen onthouden, zodat
        het bord het ook zonder netwerk weer weet te vinden. */
    rememberBoardDef: function (raw) {
      var key = B.current;
      if (!key || !B.isOnline(key) || !raw || !raw.path) return;
      var lijst = B.defs(key).filter(function (d) { return d.id !== raw.id; });
      lijst.push(raw);
      B.saveDefs(key, lijst);
      UI.all = allFor(key);
    },

    /** Opnieuw de lijst met borden en de bibliotheek ophalen. */
    refresh: achtergrond,

    started: function () { return started; }
  };
  global.App = App;

  /* ---- klaarzetten -------------------------------------------------- */
  var link = leesLink();
  if (link) wisLink();

  if (B.last && B.hasLocal(B.last)) {
    var d0 = B.doc(B.last);
    if (d0) E.prefetch(B.defsFor(S.merge(S.defaults(), d0), allFor(B.last)), 'audio/');
  }
  toonKiezer();
  verwerkLink(link).then(function () {
    toonKiezer();
    return achtergrond();
  }).catch(function (err) { console.warn(err); toonKiezer(); });

  /* Een link openen terwijl de app al draait: vaak verandert de browser dan
     alleen wat er achter de # staat, zonder de pagina opnieuw te laden. */
  global.addEventListener('hashchange', function () {
    var l = leesLink();
    if (!l) return;
    wisLink();
    verwerkLink(l).then(function (key) {
      if (!started) toonKiezer();
      else if (key && key === B.current) {
        // hetzelfde bord, misschien nu met andere rechten
        S.use(B.doc(key));
        Sync.start(key);
        App.reload();
      } else if (key) App.switchTo(key);
      return achtergrond();
    }).catch(function (err) { console.warn(err); });
  });

  // weer online: wat er nog klaarstond versturen en de lijst bijwerken
  global.addEventListener('online', function () {
    if (Sync.key) Sync.soon(500);
    achtergrond();
  });

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

  /** Laat de service worker weten welke audio-urls nu gelden: van alle
      borden op dit toestel, niet alleen het open bord - anders gooit hij
      bij elke wissel de geluiden van de andere borden uit de cache. */
  function tellServiceWorker() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    var urls = {};
    function voeg(d) {
      var u = new URL(E.srcFor(d), global.location.href);
      urls[u.pathname + u.search] = 1;
    }
    Library.builtin.forEach(voeg);
    B.list.forEach(function (e) { if (e.online) B.defs(e.key).map(Library.def).forEach(voeg); });
    navigator.serviceWorker.controller.postMessage({ type: 'audio-keep', urls: Object.keys(urls) });
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
