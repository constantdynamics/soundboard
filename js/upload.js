/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — een geluid uploaden
   1. bestand kiezen (audio, of een filmpje: dan alleen het geluid)
   2. in de browser openen en eventueel een stuk uitknippen
   3. de luidheid meten (js/loudness.js), net als bij de rest
   4. omzetten naar mp3 (js/mp3-worker.js), het enige formaat dat op
      elke telefoon speelt; een mp3 die heel blijft gaat ongewijzigd
   5. uploaden naar een vooraf vrijgegeven plek, in de bibliotheek
      zetten en op het bord
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var UI = global.UI, E = global.AudioEngine, B = global.Boards, S = global.Settings;
  var Cloud = global.Cloud, Library = global.Library, Sync = global.Sync;
  var L = global.Loudness, ICONS = global.ICONS;
  var el = UI.h.el, hexToRgb = UI.h.hexToRgb;
  function $(id) { return document.getElementById(id); }

  var RATE = 48000;                 // alles wordt naar 48 kHz gedecodeerd
  var MAX_SEC = 15 * 60;            // langer is geen knop meer
  var MAX_BYTES = 30 * 1048576;     // grens van de opslag
  var PUNTEN = 600;                 // golfvorm in het uploadscherm

  function knop(tekst, cls, fn) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), tekst);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return b;
  }

  /** Een nette naam uit een bestandsnaam: 'WhatsApp Audio 2024-05-01.opus'
      wordt 'WHATSAPP AUDIO 2024 05 01'. */
  function naamVan(bestand) {
    return String(bestand || 'geluid').replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40) || 'NIEUW GELUID';
  }

  function tijd(s) {
    return s < 60 ? s.toFixed(2) + ' s' : Math.floor(s / 60) + ':' + ('0' + (s % 60).toFixed(1)).slice(-4);
  }

  var Upload = {
    state: null,

    /** Mag hier geüpload worden, en zo niet: waarom niet? */
    status: function () {
      if (!Cloud.enabled) return { ok: false, why: 'In een noodpakket kun je niets uploaden.' };
      var e = B.entry(B.current);
      if (e && e.online) {
        if (Sync.canEdit(B.current)) return { ok: true };
        return { ok: false, why: 'Met een SPEEL-link kun je niets toevoegen. Maak een eigen kopie om het aan te passen.' };
      }
      if (Cloud.ik()) return { ok: false, why: 'Dit bord staat nog alleen op dit toestel. Het gaat zo vanzelf online; daarna kun je uploaden.' };
      return { ok: false, why: 'Uploaden kan met een persoonlijke link (die krijg je met een uitnodiging) of op een bord waarvan je de BEWERK-link hebt.' };
    },

    pick: function (slot) {
      var self = this;
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.mp4,.mov,.m4v,.webm,.3gp';
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (f) self.open(f, slot);
      });
      input.click();
    },

    /** Het uploadscherm, met het bestand erin. */
    open: function (file, slot) {
      var self = this;
      this.stopPreview();
      this.state = { file: file, slot: slot, fase: 'lezen', gedeeld: false, naam: naamVan(file.name) };
      UI.addMode = 'upload';
      UI.openSheet('add-sheet');
      $('add-title').textContent = 'UPLOADEN';
      this.render();

      var st = this.state;
      readBytes(file).then(function (bytes) {
        st.bytes = bytes;
        if (file.size > 200 * 1048576) throw new Error('Dit bestand is te groot om te openen (meer dan 200 MB).');
        return decode(bytes.slice(0));        // decoderen maakt de bytes onbruikbaar: een kopie
      }).then(function (buf) {
        if (self.state !== st) return;
        if (buf.duration > MAX_SEC) {
          throw new Error('Dit is ' + Math.round(buf.duration / 60) + ' minuten lang. Een knop mag ' +
                          'hooguit een kwartier duren; knip het eerst korter.');
        }
        st.buf = buf;
        st.start = 0;
        st.end = buf.duration;
        st.golf = L.peaks(kanalenVan(buf, 0, buf.length), PUNTEN);
        st.fase = 'klaar';
        self.render();
      }).catch(function (err) {
        if (self.state !== st) return;
        st.fase = 'fout';
        st.fout = err && err.name === 'EncodingError' || /decode|codec|format/i.test(String(err && err.message))
          ? 'Deze browser kan het geluid uit dit bestand niet lezen. Probeer het als mp3, m4a of wav, of op een ander toestel.'
          : (err && err.message) || String(err);
        self.render();
      });
    },

    render: function () {
      var self = this, st = this.state, body = $('add-body');
      if (!st) return;
      body.innerHTML = '';

      var kop = el('p', 'upload-bestand');
      kop.textContent = st.file.name + ' · ' + (st.file.size / 1048576).toFixed(1) + ' MB';
      body.appendChild(kop);

      if (st.fase === 'lezen') {
        body.appendChild(el('p', 'hint', 'BESTAND OPENEN…'));
        return;
      }
      if (st.fase === 'fout' && !st.buf) {
        body.appendChild(this.foutBlok(st.fout));
        body.appendChild(knop('ANDER BESTAND', '', function () { self.pick(st.slot); }));
        return;
      }

      /* knippen */
      body.appendChild(this.golfVeld());

      /* naam */
      var naam = el('input', 'text-input');
      naam.type = 'text'; naam.maxLength = 40; naam.value = st.naam;
      naam.addEventListener('input', function () { st.naam = this.value.toUpperCase(); });
      body.appendChild(UI.field('NAAM', '', naam));

      /* privé of gedeeld: alleen met een persoonlijke link */
      if (Cloud.ik()) {
        var keus = UI.chipRow([{ id: 'prive', name: 'PRIVÉ' }, { id: 'gedeeld', name: 'GEDEELD' }],
          st.gedeeld ? 'gedeeld' : 'prive', function (it) {
            st.gedeeld = it.id === 'gedeeld';
            Array.prototype.forEach.call(keus.children, function (b, i) {
              b.setAttribute('aria-pressed', String((i === 1) === st.gedeeld));
            });
          });
        var dv = UI.field('IN DE BIBLIOTHEEK', '', keus);
        dv.appendChild(el('p', 'hint',
          'Privé: een ander vindt het niet in de bibliotheek, maar hoort het wel op dit bord. ' +
          'Gedeeld: iedereen met een persoonlijke link kan het op zijn eigen borden zetten.'));
        body.appendChild(dv);
      } else {
        body.appendChild(el('p', 'hint',
          'Je uploadt met de BEWERK-link van dit bord: het geluid komt in de bibliotheek van de maker van het bord.'));
      }

      /* opslaan */
      var bezig = st.fase === 'bezig';
      var voortgang = el('div', 'upload-voortgang');
      var regel = el('div', 'offline-line');
      regel.textContent = st.melding || '';
      var balk = el('div', 'offline-bar', '<i></i>');
      balk.firstChild.style.width = Math.round((st.voortgang || 0) * 100) + '%';
      voortgang.appendChild(regel);
      voortgang.appendChild(balk);
      voortgang.hidden = !bezig;
      st.regel = regel;
      st.balk = balk.firstChild;
      body.appendChild(voortgang);
      if (st.fase === 'fout') body.appendChild(this.foutBlok(st.fout));

      var opslaan = knop('OPSLAAN EN OP HET BORD', 'btn--accent', function () { self.save(); });
      var terug = knop('ANNULEREN', '', function () { self.stopPreview(); self.state = null; UI.openAddSheet(st.slot); });
      opslaan.disabled = terug.disabled = bezig;
      var r = el('div', 'row');
      r.appendChild(terug); r.appendChild(opslaan);
      body.appendChild(r);
    },

    foutBlok: function (tekst) {
      var p = el('p', 'upload-fout');
      p.textContent = tekst;
      return p;
    },

    /** De golfvorm met twee grepen om begin en eind te kiezen. */
    golfVeld: function () {
      var self = this, st = this.state, totaal = st.buf.duration;
      var kleur = '#00e5ff';
      var wrap = el('div', 'wave');
      wrap.style.setProperty('--c', kleur);
      wrap.style.setProperty('--c-rgb', hexToRgb(kleur));
      var canvas = el('canvas', 'wave-canvas');
      var voor = el('div', 'wave-dim wave-dim--voor');
      var na = el('div', 'wave-dim wave-dim--na');
      var kop = el('div', 'wave-head');
      var a = el('div', 'wave-grip wave-grip--a', '<i></i>');
      var b = el('div', 'wave-grip wave-grip--b', '<i></i>');
      [canvas, voor, na, kop, a, b].forEach(function (x) { wrap.appendChild(x); });
      st.kop = kop;

      var veld = UI.field('KNIPPEN', '', wrap);
      var lees = veld.querySelector('.field-label');
      lees.insertAdjacentHTML('beforeend', '<span class="field-value"></span>');
      lees = lees.querySelector('.field-value');

      function pct(t) { return totaal ? t / totaal * 100 : 0; }
      function toon() {
        voor.style.width = pct(st.start) + '%';
        na.style.left = pct(st.end) + '%';
        na.style.width = (100 - pct(st.end)) + '%';
        a.style.left = pct(st.start) + '%';
        b.style.left = pct(st.end) + '%';
        lees.textContent = tijd(st.end - st.start) + (st.start > 0 || st.end < totaal ? ' VAN ' + tijd(totaal) : '');
        teken();
      }
      function teken() {
        var c = canvas.getContext('2d'), dpr = global.devicePixelRatio || 1;
        var w = canvas.clientWidth || 300, h = canvas.clientHeight || 70;
        canvas.width = w * dpr; canvas.height = h * dpr;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, h);
        var n = st.golf.length, bw = w / n;
        for (var i = 0; i < n; i++) {
          var t = (i + 0.5) / n * totaal;
          c.fillStyle = (t >= st.start && t <= st.end) ? kleur : 'rgba(255,255,255,.16)';
          var bh = Math.max(2, st.golf[i] / 100 * (h * 0.92));
          c.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 0.4), bh);
        }
      }
      function sleep(grip, isStart) {
        grip.addEventListener('pointerdown', function (ev) {
          if (st.fase === 'bezig') return;
          ev.preventDefault(); ev.stopPropagation();
          var r = wrap.getBoundingClientRect();
          function beweeg(e) {
            var t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * totaal;
            if (isStart) st.start = Math.min(t, st.end - 0.05);
            else st.end = Math.max(t, st.start + 0.05);
            toon();
          }
          function los() {
            grip.removeEventListener('pointermove', beweeg);
            grip.removeEventListener('pointerup', los);
            grip.removeEventListener('pointercancel', los);
          }
          try { grip.setPointerCapture(ev.pointerId); } catch (e) {}
          grip.addEventListener('pointermove', beweeg);
          grip.addEventListener('pointerup', los);
          grip.addEventListener('pointercancel', los);
        });
      }
      sleep(a, true); sleep(b, false);

      var rij = el('div', 'row');
      rij.style.marginTop = '10px';
      rij.appendChild(knop('BELUISTEREN', 'btn--accent', function () { self.preview(); }));
      rij.appendChild(knop('STILTE ERAF', '', function () {
        var top = 0;
        st.golf.forEach(function (v) { if (v > top) top = v; });
        var drempel = Math.max(3, top * 0.06);
        var i = 0, j = st.golf.length - 1;
        while (i < st.golf.length && st.golf[i] < drempel) i++;
        while (j > i && st.golf[j] < drempel) j--;
        var vak = totaal / st.golf.length;
        st.start = Math.max(0, i * vak - 0.04);
        st.end = Math.min(totaal, (j + 1) * vak + 0.06);
        toon();
      }));
      rij.appendChild(knop('ALLES', '', function () { st.start = 0; st.end = totaal; toon(); }));
      veld.appendChild(rij);
      veld.appendChild(el('p', 'hint',
        'Sleep de grepen om alleen een stuk te bewaren. Alleen dat stuk gaat de opslag in; ' +
        'later kun je per knop nog verder bijsnijden.'));
      setTimeout(toon, 0);
      return veld;
    },

    /** Het gekozen stuk laten horen, via de gewone keten (master en limiter). */
    preview: function () {
      var st = this.state;
      if (!st || !st.buf) return;
      this.stopPreview();
      var ctx = E.openContext();
      var src = ctx.createBufferSource();
      src.buffer = st.buf;
      src.connect(E.masterGain);
      var start = ctx.currentTime, lengte = st.end - st.start;
      src.start(0, st.start, lengte);
      this.bron = src;
      var self = this;
      (function loop() {
        if (self.bron !== src || !st.kop) return;
        var p = (ctx.currentTime - start) / lengte;
        if (p >= 1) { st.kop.style.opacity = 0; return; }
        st.kop.style.opacity = 1;
        st.kop.style.left = ((st.start + p * lengte) / st.buf.duration * 100) + '%';
        requestAnimationFrame(loop);
      })();
    },

    stopPreview: function () {
      if (this.bron) { try { this.bron.stop(); } catch (e) {} this.bron = null; }
    },

    melding: function (tekst, v) {
      var st = this.state;
      if (!st) return;
      st.melding = tekst;
      if (v !== undefined) st.voortgang = v;
      if (st.regel) st.regel.textContent = tekst;
      if (st.balk && v !== undefined) st.balk.style.width = Math.round(v * 100) + '%';
    },

    /** Meten, omzetten, uploaden, in de bibliotheek en op het bord. */
    save: function () {
      var self = this, st = this.state;
      if (!st || !st.buf || st.fase === 'bezig') return;
      this.stopPreview();
      st.fase = 'bezig';
      st.fout = null;
      this.render();
      this.melding('METEN…', 0.02);

      var buf = st.buf, rate = buf.sampleRate;
      var van = Math.max(0, Math.floor(st.start * rate));
      var tot = Math.min(buf.length, Math.ceil(st.end * rate));
      var heel = van === 0 && tot >= buf.length - 1;
      var kanalen = kanalenVan(buf, van, tot);
      if (kanalen.length === 2 && isMono(kanalen)) kanalen = [kanalen[0]];
      var meting = L.measure(kanalen, rate);
      var golf = L.peaks(kanalen, 240);
      var duur = (tot - van) / rate;

      // een mp3 die heel blijft hoeft niet opnieuw gecodeerd te worden
      var isMp3 = /\.mp3$/i.test(st.file.name) || st.file.type === 'audio/mpeg';
      var mp3 = (heel && isMp3 && st.bytes.byteLength <= MAX_BYTES)
        ? Promise.resolve(new Blob([st.bytes], { type: 'audio/mpeg' }))
        : this.encode(kanalen, rate, function (p) { self.melding('OMZETTEN NAAR MP3… ' + Math.round(p * 100) + '%', 0.05 + p * 0.45); });

      var auth = Sync.auth();
      var icoon = (ICONS.suggest(st.naam, 1)[0]) || 'wave';
      mp3.then(function (blob) {
        if (blob.size > MAX_BYTES) throw new Error('Het resultaat is te groot (' + (blob.size / 1048576).toFixed(0) + ' MB). Knip er een kleiner stuk uit.');
        self.melding('PLEK AANVRAGEN…', 0.5);
        return Cloud.rpc('sb_upload_ticket', {
          p_ik: auth.p_ik, p_token: auth.p_token, p_board: auth.p_board, p_kind: 'audio', p_bytes: blob.size
        }).then(function (t) {
          self.melding('UPLOADEN…', 0.52);
          return Cloud.upload(t.path, blob, 'audio/mpeg', function (p) {
            self.melding('UPLOADEN… ' + Math.round(p * 100) + '%', 0.52 + p * 0.43);
          }).then(function () { return t.path; });
        });
      }).then(function (pad) {
        self.melding('IN DE BIBLIOTHEEK ZETTEN…', 0.97);
        return Cloud.rpc('sb_sound_add', {
          p_ik: auth.p_ik, p_token: auth.p_token, p_path: pad,
          p_meta: { label: st.naam, icon: icoon, gainDb: meting.gainDb, duration: duur,
                    peaks: golf, shared: !!st.gedeeld }
        });
      }).then(function (raw) {
        self.melding('KLAAR', 1);
        global.App.rememberBoardDef(raw);
        var def = Library.def(raw);
        if (def.mine) Library.remember(def);
        self.state = null;
        UI.closeSheets();
        UI.addToBoard(def, st.slot);
        UI.toast(def.label + ' STAAT OP HET BORD');
      }).catch(function (err) {
        if (self.state !== st) return;
        st.fase = 'fout';
        st.fout = err.status === 0 ? 'Geen verbinding met de online opslag. Probeer het straks opnieuw.' : err.message;
        self.render();
      });
    },

    /** Zet samples om naar mp3, op de achtergrond. */
    encode: function (kanalen, rate, onprogress) {
      return new Promise(function (resolve, reject) {
        var w;
        try { w = new Worker('js/mp3-worker.js'); }
        catch (e) { reject(new Error('Omzetten naar mp3 lukt niet in deze browser.')); return; }
        w.onmessage = function (e) {
          var d = e.data;
          if (d.voortgang !== undefined) onprogress(d.voortgang);
          else if (d.klaar) { w.terminate(); resolve(d.blob); }
          else if (d.fout) { w.terminate(); reject(new Error('Omzetten naar mp3 mislukt: ' + d.fout)); }
        };
        w.onerror = function (e) {
          w.terminate();
          reject(new Error('Omzetten naar mp3 mislukt' + (e && e.message ? ': ' + e.message : '.')));
        };
        // één of twee kanalen; meer heeft een knop niet nodig
        var mee = kanalen.slice(0, 2);
        w.postMessage({ kanalen: mee, rate: rate, kbps: mee.length > 1 ? 160 : 96 },
                      mee.map(function (k) { return k.buffer; }));
      });
    }
  };

  /* ---- hulpjes ------------------------------------------------------ */

  function readBytes(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || new Error('Kon het bestand niet lezen.')); };
      r.readAsArrayBuffer(file);
    });
  }

  /** Decodeert naar 48 kHz, wat de telefoon zelf ook gebruikt. Dat kan de
      mp3-encoder aan, en elke opname wordt zo op dezelfde manier gemeten. */
  function decode(bytes) {
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    var ctx = OAC ? new OAC(2, RATE, RATE) : E.openContext();
    return new Promise(function (resolve, reject) {
      var p = ctx.decodeAudioData(bytes, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  /** De samples van [van, tot), als losse kopieën per kanaal. */
  function kanalenVan(buf, van, tot) {
    var uit = [];
    for (var c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
      uit.push(buf.getChannelData(c).slice(van, tot));
    }
    return uit;
  }

  /** Twee kanalen die (vrijwel) hetzelfde zijn: dan is het eigenlijk mono,
      en scheelt een mono-mp3 de helft. */
  function isMono(k) {
    var a = k[0], b = k[1], stap = Math.max(1, Math.floor(a.length / 20000));
    for (var i = 0; i < a.length; i += stap) {
      if (Math.abs(a[i] - b[i]) > 0.002) return false;
    }
    return true;
  }

  global.Upload = Upload;
})(window);
