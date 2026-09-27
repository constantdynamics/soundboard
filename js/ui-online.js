/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — interface voor alles wat online is
   De lijst met borden (met delen), geluiden toevoegen uit de
   bibliotheek, wie je bent, uitnodigen, en de melding als een ander
   iets aan het bord heeft veranderd. Hoort bij js/ui.js.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var UI = global.UI, S = global.Settings, B = global.Boards, E = global.AudioEngine;
  var Cloud = global.Cloud, Library = global.Library, Sync = global.Sync, ICONS = global.ICONS;
  var el = UI.h.el, esc = UI.h.esc;
  function $(id) { return document.getElementById(id); }
  function App() { return global.App; }

  function knop(tekst, cls, fn) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), tekst);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return b;
  }

  function rij() {
    var r = el('div', 'row');
    Array.prototype.slice.call(arguments).forEach(function (k) { if (k) r.appendChild(k); });
    return r;
  }

  function mb(bytes) { return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0); }

  var ROL = { owner: 'JIJ BENT DE MAKER', edit: 'JE MAG MEE BEWERKEN', play: 'ALLEEN SPELEN' };

  /* ================================================================
     Delen: via het deelmenu van de telefoon, anders kopiëren
     ================================================================ */
  UI.share = function (titel, url) {
    var self = this;
    if (navigator.share) {
      return navigator.share({ title: titel, url: url }).catch(function (e) {
        if (e && e.name === 'AbortError') return;         // zelf weggeklikt
        return self.copy(url);
      });
    }
    return this.copy(url);
  };

  UI.copy = function (tekst) {
    var self = this;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(tekst).then(function () {
        self.toast('GEKOPIEERD');
      }, function () { return self.showText(tekst); });
    }
    return this.showText(tekst);
  };

  /** Als kopiëren niet mag: de tekst in beeld, geselecteerd. */
  UI.showText = function (tekst) {
    return this.ask({ title: 'KOPIEER DEZE LINK', input: { value: tekst, max: 600, raw: true }, ok: 'KLAAR', cancel: false });
  };

  UI.boardLink = function (soort, token) {
    return Cloud.base() + '#' + soort + '=' + token;
  };

  /* ================================================================
     Borden: wisselen, maken, delen, hernoemen, weggooien
     ================================================================ */
  UI.renderBoardsSheet = function () {
    var self = this, body = $('boards-body');
    body.innerHTML = '';
    var cur = B.entry(B.current) || {};

    var lijst = el('div', 'board-list');
    B.list.forEach(function (b) {
      var nu = b.key === B.current;
      var n = nu ? S.data.order.filter(Boolean).length : B.count(b.key);
      var sub = [];
      if (b.stub) sub.push('NOG NIET OP DIT TOESTEL');
      else sub.push(n + (n === 1 ? ' KNOP' : ' KNOPPEN'));
      if (!b.online) sub.push(Cloud.ik() ? 'NOG NIET ONLINE' : 'ALLEEN OP DIT TOESTEL');
      else if (b.role === 'play') sub.push('ALLEEN SPELEN');
      else if (b.role === 'edit') sub.push('VAN ' + (b.owner || 'EEN ANDER'));
      if (b.gone) sub.push('NIET MEER BEREIKBAAR');
      if (nu) sub.push('NU OPEN');
      var r = el('button', 'board-row' + (nu ? ' is-current' : '') + (b.gone ? ' is-gone' : ''),
        '<span class="board-row-name">' + esc(b.title) + '</span>' +
        '<span class="board-row-sub">' + esc(sub.join(' · ')) + '</span>');
      r.type = 'button';
      r.setAttribute('aria-current', String(nu));
      r.addEventListener('click', function () {
        if (nu) { self.closeSheets(); return; }
        App().switchTo(b.key);
      });
      lijst.appendChild(r);
    });
    body.appendChild(this.field('WISSELEN', B.list.length + (B.list.length === 1 ? ' BORD' : ' BORDEN'), lijst));

    var nieuw = knop('+ NIEUW BORD', 'btn--accent', function () { App().newBoard(); });
    nieuw.style.width = '100%';
    var nieuwVeld = this.field('', '', nieuw);
    nieuwVeld.appendChild(el('p', 'hint',
      'Een bord per situatie of per persoon: elk bord heeft zijn eigen knoppen, ' +
      'uiterlijk, timer en geluid. Wisselen duurt een paar tellen, want de ' +
      'geluiden van het nieuwe bord worden eerst ingeladen. Wat er speelt faadt weg.' +
      (Cloud.ik() ? '' : ' Zonder persoonlijke link staat een nieuw bord alleen op dit toestel.')));
    body.appendChild(nieuwVeld);

    /* dit bord */
    var mag = this.canEdit();
    var dit = this.field('DIT BORD — ' + S.data.title,
      cur.online ? (ROL[cur.role] || '') : (Cloud.ik() ? 'NOG NIET ONLINE' : 'ALLEEN OP DIT TOESTEL'),
      rij(
        mag ? knop('NAAM WIJZIGEN', '', function () {
          self.ask({ title: 'NAAM VAN DIT BORD', input: { value: S.data.title, max: 40, required: true }, ok: 'OPSLAAN' })
            .then(function (r) {
              if (!r) return;
              S.set('title', r.value.toUpperCase());
              self.paintBoardTitle();
              self.renderBoardsSheet();
            });
        }) : null,
        knop(cur.online && cur.role !== 'owner' ? 'EIGEN KOPIE' : 'KOPIE MAKEN', '', function () {
          self.ask({
            title: 'KOPIE VAN ' + S.data.title,
            text: 'Een eigen bord met dezelfde knoppen en instellingen, dat je daarna los kunt aanpassen.' +
              (cur.online && cur.role !== 'owner' ? ' Privé-geluiden van de maker gaan niet mee.' : ''),
            input: { value: (S.data.title + ' 2').slice(0, 40), max: 40, required: true },
            ok: 'KOPIE MAKEN'
          }).then(function (r) {
            if (r) App().copyBoard(B.current, r.value.toUpperCase());
          });
        })));
    body.appendChild(dit);

    /* delen */
    if (cur.online && cur.playToken) this.renderShare(body, cur);
    else if (!cur.online) {
      body.appendChild(this.field('DELEN', '', el('p', 'hint', Cloud.ik()
        ? 'Dit bord gaat zo vanzelf online; daarna kun je het hier delen.'
        : 'Delen kan zodra je een persoonlijke link hebt (die krijg je met een uitnodiging). ' +
          'Tot die tijd kun je het noodpakket sturen: Instellingen → Noodpakket.')));
    }

    /* weg */
    var wegTekst = !cur.online || cur.role === 'owner' ? 'BORD VERWIJDEREN' : 'UIT MIJN LIJST HALEN';
    var weg = knop(wegTekst, 'btn--danger', function () {
      self.ask({
        title: S.data.title + (cur.online && cur.role !== 'owner' ? ' UIT JE LIJST?' : ' VERWIJDEREN?'),
        text: !cur.online
          ? 'Het bord verdwijnt van dit toestel, met de indeling en alles wat je erop hebt ingesteld. De geluiden zelf blijven bestaan.'
          : cur.role === 'owner'
            ? 'Het bord verdwijnt voor iedereen, ook voor wie een link heeft. De geluiden zelf blijven in je bibliotheek.'
            : 'Het bord verdwijnt uit je lijst. Voor de maker en anderen blijft het bestaan.',
        ok: cur.online && cur.role !== 'owner' ? 'WEGHALEN' : 'VERWIJDEREN', danger: true
      }).then(function (r) { if (r) App().deleteBoard(B.current); });
    });
    weg.style.width = '100%';
    body.appendChild(this.field('', '', weg));
  };

  /** De SPEEL- en BEWERK-link van een online bord, met delen en intrekken. */
  UI.renderShare = function (body, cur) {
    var self = this;
    var box = el('div', 'share');

    function link(soort, token, uitleg, magIntrekken) {
      var url = self.boardLink(soort, token);
      var blok = el('div', 'share-link');
      blok.appendChild(el('div', 'share-kop', soort === 'speel' ? 'SPEEL-LINK' : 'BEWERK-LINK'));
      blok.appendChild(el('p', 'hint', uitleg));
      blok.appendChild(rij(
        knop('DELEN', 'btn--accent', function () { self.share(S.data.title, url); }),
        knop('KOPIËREN', '', function () { self.copy(url); }),
        magIntrekken ? knop('INTREKKEN', 'btn--danger', function () {
          self.ask({
            title: (soort === 'speel' ? 'SPEEL' : 'BEWERK') + '-LINK INTREKKEN?',
            text: 'De link die nu rondgaat werkt daarna niet meer, ook niet voor wie het bord er al mee opende. ' +
                  'Je krijgt meteen een nieuwe link om te delen met wie hem wél mag hebben.',
            ok: 'INTREKKEN', danger: true
          }).then(function (r) {
            if (!r) return;
            Cloud.rpc('sb_board_rotate', { p_ik: Cloud.ik(), p_board: B.current, p_which: soort === 'speel' ? 'play' : 'edit' })
              .then(function (t) {
                var e = B.entry(B.current);
                e.playToken = t.playToken;
                e.editToken = t.editToken;
                B.saveList();
                self.toast('INGETROKKEN — DIT IS DE NIEUWE LINK');
                self.renderBoardsSheet();
              }, function (err) { self.toast(err.message, 4000); });
          });
        }) : null));
      box.appendChild(blok);
    }

    link('speel', cur.playToken,
      'Wie deze link opent, kan het bord afspelen en er een eigen kopie van maken. Aanpassen kan niet.',
      cur.role === 'owner');
    if (cur.editToken && (cur.role === 'owner' || cur.role === 'edit')) {
      link('bewerk', cur.editToken,
        'Wie deze link opent, kan het bord mee aanpassen en er geluiden op zetten. Geef hem alleen aan wie je vertrouwt.',
        cur.role === 'owner');
    }
    body.appendChild(this.field('DELEN', '', box));
  };

  /* ================================================================
     Een geluid op het bord zetten: uploaden of kiezen
     ================================================================ */
  UI.renderAddSheet = function () {
    var self = this, body = $('add-body');
    body.innerHTML = '';
    $('add-title').textContent = this.addSlot !== null
      ? 'GELUID OP PLEK ' + (this.addSlot + 1) : 'GELUID TOEVOEGEN';

    /* uploaden */
    var U = global.Upload;
    if (U) {
      var st = U.status();
      var up = knop('BESTAND KIEZEN', 'btn--accent', function () { U.pick(self.addSlot); });
      up.disabled = !st.ok;
      up.style.width = '100%';
      var upVeld = this.field('UPLOADEN', '', up);
      upVeld.appendChild(el('p', 'hint', st.ok
        ? 'Een geluidsbestand, of een filmpje waarvan alleen het geluid bewaard wordt ' +
          '(mp3, m4a, wav, WhatsApp-spraakberichten, mp4). Je kunt er meteen een stuk uit knippen. ' +
          'De luidheid wordt gemeten, zodat het net zo hard klinkt als de rest.'
        : st.why));
      body.appendChild(upVeld);
    }

    var zoek = el('input', 'text-input');
    zoek.type = 'search';
    zoek.placeholder = 'ZOEK EEN GELUID…';
    body.appendChild(this.field('ZOEKEN', '', zoek));

    var opBord = {};
    S.data.order.forEach(function (id) { if (id) opBord[id] = 'op'; });
    (S.data.archived || []).forEach(function (id) { opBord[id] = 'archief'; });

    var online = B.isOnline(B.current), rijen = [];
    var inBieb = {};
    Library.list.forEach(function (d) { inBieb[d.id] = 1; });

    function groep(titel, lijst, leeg) {
      var box = el('div', 'snd-list');
      lijst.forEach(function (d) {
        var waar = opBord[d.id];
        var noot = waar === 'op' ? 'STAAT AL OP DIT BORD'
                 : waar === 'archief' ? 'IN HET ARCHIEF — TERUGZETTEN'
                 : (!d.mine && d.ownerName ? 'VAN ' + d.ownerName : (d.mine && !d.shared ? 'PRIVÉ' : ''));
        var r = self.soundRow(d, noot);
        if (waar === 'op') r.classList.add('is-on');
        r.addEventListener('click', function () {
          if (waar === 'op' && self.addSlot === null) { self.toast('STAAT AL OP DIT BORD'); return; }
          self.pickSound(d, self.addSlot);
        });
        rijen.push({ el: r, tekst: (d.label + ' ' + (d.file || '') + ' ' + (d.icon || '') + ' ' + (d.ownerName || '')).toLowerCase() });
        box.appendChild(r);
      });
      if (!lijst.length && leeg) box.appendChild(el('p', 'hint', leeg));
      if (lijst.length || leeg) body.appendChild(self.field(titel, lijst.length + '', box));
    }

    if (online && Cloud.ik()) {
      groep('MIJN GELUIDEN', Library.mine(), 'Nog niets. Wat je uploadt komt hier te staan.');
      groep('GEDEELD DOOR ANDEREN', Library.shared(), '');
    }
    groep('STANDAARD', Library.builtin.filter(function (d) { return !inBieb[d.id]; }), '');

    body.appendChild(el('p', 'hint',
      'Een geluid kan op meerdere borden staan, elk met een eigen naam, kleur, ' +
      'volume en uitsnede. Wat je hier aanpast geldt alleen voor dit bord.'));

    zoek.addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      rijen.forEach(function (r) { r.el.hidden = !!q && r.tekst.indexOf(q) < 0; });
    });
  };

  /** Zet een gekozen geluid op het bord. Een geluid uit de bibliotheek moet
      eerst bij het online bord worden aangemeld: dan mag iedereen met de
      link het ook horen. */
  UI.pickSound = function (d, slot) {
    var self = this;
    var klaar;
    if (B.isOnline(B.current) && !d.builtin) {
      var args = Sync.auth();
      args.p_sound = d.id;
      klaar = Cloud.rpc('sb_board_add_sound', args).then(function (raw) {
        App().rememberBoardDef(raw);
        return Library.def(raw);
      });
    } else {
      klaar = Promise.resolve(d);
    }
    klaar.then(function (def) {
      self.addToBoard(def, slot);
      self.closeSheets();
      self.toast(def.label + ' STAAT OP HET BORD');
    }, function (err) {
      self.toast(err.status === 0 ? 'GEEN VERBINDING: PROBEER HET STRAKS OPNIEUW' : err.message, 4000);
    });
  };

  UI.onLibrary = function () {
    if (!$('add-sheet').hidden && this.addMode !== 'upload' && this.addMode !== 'bieb') this.renderAddSheet();
  };

  /* ================================================================
     Wie je bent: persoonlijke link, bibliotheek, uitnodigen
     ================================================================ */
  UI.renderAccount = function (body) {
    var self = this;
    if (!Cloud.enabled) return;
    var me = Cloud.me;

    if (!me) {
      body.appendChild(this.field('JIJ', 'GEEN PERSOONLIJKE LINK', el('p', 'hint',
        'Je borden staan nu alleen op dit toestel. Met een uitnodiging krijg je een ' +
        'persoonlijke link: dan staan je borden online, kun je ze delen en kun je ' +
        'geluiden uploaden. Heb je al een persoonlijke link? Open die dan op dit toestel.')));
      return;
    }

    var box = el('div');
    box.appendChild(rij(
      knop('JOUW PERSOONLIJKE LINK', 'btn--accent', function () { self.showPersonalLink(false); }),
      knop('NAAM WIJZIGEN', '', function () {
        self.ask({ title: 'JOUW NAAM', input: { value: me.name, max: 30, required: true }, ok: 'OPSLAAN' })
          .then(function (r) {
            if (!r) return;
            Cloud.rename(r.value).then(function () { self.renderSettings(); },
              function (err) { self.toast(err.message, 4000); });
          });
      })));
    var r2 = rij(
      knop('MIJN GELUIDEN', '', function () { self.openLibrarySheet(); }),
      knop('AFMELDEN', 'btn--danger', function () {
        self.ask({
          title: 'AFMELDEN OP DIT TOESTEL?',
          text: 'Dit toestel vergeet wie je bent. Je borden en geluiden blijven online; met je ' +
                'persoonlijke link haal je ze terug. Heb je die link wel ergens bewaard?',
          ok: 'AFMELDEN', danger: true
        }).then(function (r) {
          if (!r) return;
          Cloud.forgetMe();
          Library.clear();
          B.list.filter(function (e) { return e.online && !e.token && e.key !== B.current; })
            .forEach(function (e) { B.remove(e.key); });
          self.renderSettings();
          self.toast('AFGEMELD');
        });
      }));
    r2.style.marginTop = '8px';
    box.appendChild(r2);
    var gebruik = me.usedBytes !== undefined
      ? 'OPSLAG: ' + mb(me.usedBytes) + (me.admin ? ' MB' : ' VAN ' + (me.quotaMb || 200) + ' MB') : '';
    var veld = this.field('JIJ — ' + me.name, me.admin ? 'BEHEERDER' : '', box);
    veld.appendChild(el('p', 'hint',
      'Met je persoonlijke link ben jij het op elk toestel. ' + gebruik));
    body.appendChild(veld);

    if (me.admin) this.renderAdmin(body);
  };

  /** De persoonlijke link laten zien, met delen. `nieuw` na het aanmelden. */
  UI.showPersonalLink = function (nieuw) {
    var self = this, url = Cloud.link();
    return this.ask({
      title: nieuw ? 'WELKOM, ' + Cloud.me.name : 'JOUW PERSOONLIJKE LINK',
      text: (nieuw ? 'Dit is jouw persoonlijke link. ' : '') +
        'Open hem op je telefoon, tablet of laptop en al je borden en geluiden staan er. ' +
        'Bewaar hem goed, bijvoorbeeld door hem naar jezelf te sturen. Deel hem met niemand: ' +
        'wie hem heeft, kan alles van jou aanpassen.',
      input: { value: url, max: 600, raw: true },
      ok: 'DELEN OF KOPIËREN', cancel: 'KLAAR'
    }).then(function (r) {
      if (r) return self.share('Mijn soundboard', url);
    });
  };

  /** Voor de beheerder: mensen uitnodigen en zien wie er meedoen. */
  UI.renderAdmin = function (body) {
    var self = this;
    var box = el('div');
    box.appendChild(rij(
      knop('NIEUWE UITNODIGING', 'btn--accent', function () {
        self.ask({
          title: 'UITNODIGEN',
          text: 'Voor wie is de uitnodiging? Wie de link opent, kiest zelf een naam en krijgt een ' +
                'persoonlijke link. Een uitnodiging werkt één keer en dertig dagen lang.',
          input: { placeholder: 'NOTITIE, BIJV. SANNE', max: 60 },
          ok: 'MAKEN'
        }).then(function (r) {
          if (!r) return;
          Cloud.rpc('sb_invite_create', { p_ik: Cloud.ik(), p_note: r.value, p_uses: 1 }).then(function (x) {
            var url = Cloud.base() + '#uitnodiging=' + x.code;
            self.ask({
              title: 'UITNODIGING KLAAR',
              text: 'Stuur deze link naar ' + (r.value || 'wie je wilt uitnodigen') + '.',
              input: { value: url, max: 600, raw: true },
              ok: 'DELEN OF KOPIËREN', cancel: 'KLAAR'
            }).then(function (k) { if (k) self.share('Uitnodiging voor The Big Fat Soundboard', url); });
          }, function (err) { self.toast(err.message, 4000); });
        });
      }),
      knop('WIE DOEN ER MEE', '', function () { self.showPeople(); })));
    var veld = this.field('UITNODIGEN', '', box);
    veld.appendChild(el('p', 'hint',
      'Alleen wie een uitnodiging van jou heeft, kan borden online zetten en geluiden uploaden. ' +
      'Wie de BEWERK-link van een bord heeft, kan op dat bord ook uploaden; die geluiden komen ' +
      'dan bij de maker van het bord terecht.'));
    body.appendChild(veld);
  };

  UI.showPeople = function () {
    var self = this;
    Cloud.rpc('sb_admin_overview', { p_ik: Cloud.ik() }).then(function (o) {
      var regels = o.people.map(function (p) {
        return p.name + (p.admin ? ' (beheerder)' : '') + ': ' + p.boards + ' borden, ' +
          p.sounds + ' geluiden, ' + mb(p.bytes) + ' MB';
      });
      regels.push('');
      regels.push('Samen ' + mb(o.totalBytes) + ' MB in de opslag.');
      if (o.invites.length) {
        regels.push(o.invites.length + (o.invites.length === 1 ? ' uitnodiging staat' : ' uitnodigingen staan') +
          ' nog open' + ': ' + o.invites.map(function (i) { return i.note || 'zonder notitie'; }).join(', ') + '.');
      }
      self.ask({ title: 'WIE DOEN ER MEE', text: regels.join('\n'), ok: 'OK', cancel: false });
    }, function (err) { self.toast(err.message, 4000); });
  };

  /* ---- een bord dat je alleen mag spelen ---------------------------- */
  UI.renderPlayOnly = function (body) {
    var self = this;
    var cur = B.entry(B.current) || {};
    var kopie = knop('EIGEN KOPIE MAKEN', 'btn--accent', function () {
      self.closeSheets();
      self.openBoardsSheet();
    });
    kopie.style.width = '100%';
    var veld = this.field('DIT BORD KUN JE ALLEEN SPELEN', '', kopie);
    var uitleg = el('p', 'hint');
    uitleg.textContent = cur.gone
      ? 'De link van dit bord is ingetrokken of het bord bestaat niet meer. Je ziet de laatst bewaarde versie.'
      : 'Je opende dit bord met een SPEEL-link' + (cur.owner ? ' van ' + cur.owner : '') + '. ' +
        'Aanpassen kan niet; met een eigen kopie wel.';
    veld.appendChild(uitleg);
    body.appendChild(veld);

    // het volume blijft van jou
    var vol = el('input');
    vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.value = S.data.masterVolume;
    vol.addEventListener('input', function () {
      S.data.masterVolume = parseInt(this.value, 10);
      E.setMaster(S.data.masterVolume);
      $('master-vol').value = this.value;
    });
    vol.addEventListener('change', function () { S.save(); });
    body.appendChild(this.field('MASTERVOLUME', '', vol));
  };

  /* ================================================================
     Mijn geluiden: privé of gedeeld, en weghalen
     ================================================================ */
  UI.openLibrarySheet = function () {
    this.addMode = 'bieb';
    this.renderLibrarySheet();
    this.openSheet('add-sheet');
  };

  UI.renderLibrarySheet = function () {
    var self = this, body = $('add-body');
    body.innerHTML = '';
    $('add-title').textContent = 'MIJN GELUIDEN';
    var mijn = Library.mine();
    var box = el('div', 'snd-list');
    mijn.forEach(function (d) {
      var r = el('div', 'bieb-row');
      var kop = self.soundRow(d, d.shared ? 'GEDEELD' : 'PRIVÉ');
      kop.disabled = true;
      r.appendChild(kop);
      var keuzes = self.chipRow([{ id: 'prive', name: 'PRIVÉ' }, { id: 'gedeeld', name: 'GEDEELD' }],
        d.shared ? 'gedeeld' : 'prive', function (it) {
          Cloud.rpc('sb_sound_update', { p_ik: Cloud.ik(), p_sound: d.id, p_meta: { shared: it.id === 'gedeeld' } })
            .then(function (nieuw) {
              Library.remember(nieuw);
              self.renderLibrarySheet();
            }, function (err) { self.toast(err.message, 4000); });
        });
      var weg = knop('WEG', 'btn--danger', function () {
        self.ask({
          title: d.label + ' WEGHALEN?',
          text: 'Het verdwijnt uit je bibliotheek. Staat het nog op een bord, dan blijft het daar ' +
                'werken tot je het daar ook weghaalt.',
          ok: 'WEGHALEN', danger: true
        }).then(function (k) {
          if (!k) return;
          Cloud.rpc('sb_sound_delete', { p_ik: Cloud.ik(), p_sound: d.id }).then(function (res) {
            Library.forget(d.id);
            if (res && res.path) Cloud.remove(res.path);
            self.toast(res && res.boards ? 'WEG UIT JE BIBLIOTHEEK; STAAT NOG OP ' + res.boards +
              (res.boards === 1 ? ' BORD' : ' BORDEN') : 'WEGGEHAALD');
            self.renderLibrarySheet();
          }, function (err) { self.toast(err.message, 4000); });
        });
      });
      weg.style.flex = 'none';
      var acties = el('div', 'bieb-acties');
      acties.appendChild(keuzes);
      acties.appendChild(weg);
      r.appendChild(acties);
      box.appendChild(r);
    });
    if (!mijn.length) box.appendChild(el('p', 'hint', 'Nog niets. Wat je uploadt komt hier te staan.'));
    var veld = this.field('JOUW BIBLIOTHEEK', mijn.length + '', box);
    veld.appendChild(el('p', 'hint',
      'Privé: een ander vindt het niet in de bibliotheek, maar hoort het wel op een bord waar jij ' +
      'het op zet, ook als je dat bord deelt. Gedeeld: iedereen met een persoonlijke link kan het ' +
      'op zijn eigen borden zetten.'));
    body.appendChild(veld);
  };

  /** In het bewerkscherm van een knop: privé of gedeeld, als het jouw geluid is. */
  UI.renderPadOnline = function (body, id) {
    var self = this, d = this.byId[id];
    if (!d || !d.online || !d.mine || d.of) return;
    var r = this.chipRow([{ id: 'prive', name: 'PRIVÉ' }, { id: 'gedeeld', name: 'GEDEELD' }],
      d.shared ? 'gedeeld' : 'prive', function (it) {
        Cloud.rpc('sb_sound_update', { p_ik: Cloud.ik(), p_sound: id, p_meta: { shared: it.id === 'gedeeld' } })
          .then(function (nieuw) {
            d.shared = nieuw.shared;
            Library.remember(nieuw);
            self.renderPadSheet();
          }, function (err) { self.toast(err.message, 4000); });
      });
    var veld = this.field('IN JE BIBLIOTHEEK', '', r);
    veld.appendChild(el('p', 'hint',
      'Privé: een ander vindt dit geluid niet in de bibliotheek, maar hoort het wel op dit bord. ' +
      'Gedeeld: iedereen met een persoonlijke link kan het op zijn eigen borden zetten.'));
    body.appendChild(veld);
  };

  /* ================================================================
     Wijzigingen van een ander: melden, niet vanzelf toepassen
     ================================================================ */
  Sync.onremote = function (r) {
    var wie = r.by && Cloud.me && r.by === Cloud.me.name ? 'JE ANDERE TOESTEL' : (r.by || 'IEMAND ANDERS');
    $('remote-text').textContent = 'WIJZIGINGEN VAN ' + wie;
    $('remote-bar').hidden = false;
  };

  Sync.ongone = function (waarom) {
    $('remote-bar').hidden = true;
    UI.toast(waarom, 6000);
    UI.paintMode();
  };

  UI.onBoard = function () {
    $('remote-bar').hidden = !(Sync.remote && Sync.key === B.current);
  };

  $('remote-yes').addEventListener('click', function () {
    $('remote-bar').hidden = true;
    App().acceptRemote();
  });
  $('remote-no').addEventListener('click', function () {
    $('remote-bar').hidden = true;
  });
})(window);
