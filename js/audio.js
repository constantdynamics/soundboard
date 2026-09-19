/* ------------------------------------------------------------------
   THE BIG FAT SPEECH SOUNDBOARD — audio-engine

   Uitgangspunten:
   - Alles wordt vooraf opgehaald en gedecodeerd naar een AudioBuffer.
     Een knop indrukken kost daarna nul netwerk- en decodeertijd.
   - Geluiden stapelen: dezelfde knop nogmaals indrukken start een nieuwe
     stem vanaf 0 terwijl de vorige doorspeelt.
   - Luidheid is vooraf gemeten (EBU R128, zie tools/analyze_loudness.py).
     De correctie wordt hier als gain toegepast; de mp3's blijven origineel.
   - Een limiter op de master vangt op wat er gebeurt als je een handvol
     geluiden tegelijk indrukt.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  function dbToLin(db) { return Math.pow(10, db / 20); }

  /* Ducken: het nieuwste geluid houdt zijn volle volume, wat er al speelde
     zakt weg en komt terug zodra het nieuwe klaar is. Twee knoppen die je
     vlak na elkaar indrukt tellen als één moment, zodat een bewuste dubbele
     aanslag niet zichzelf wegdrukt. */
  var DUCK_ATTACK = 0.18;     // hoe snel het wegzakt
  var DUCK_RELEASE = 0.45;    // hoe snel het terugkomt
  var DUCK_SAMEN = 0.3;       // binnen deze tijd hoort het bij elkaar

  function rampDuck(ctx, voice, value) {
    if (!voice.duck || voice.duckTarget === value) return;
    voice.duckTarget = value;
    var g = voice.duck.gain, t = ctx.currentTime;
    var doel = Math.max(value, 0.0001);
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(g.value, 0.0001), t);
      g.exponentialRampToValueAtTime(doel, t + (value < 1 ? DUCK_ATTACK : DUCK_RELEASE));
    } catch (e) {
      try { g.value = doel; } catch (e2) {}
    }
  }

  var Engine = {
    ctx: null,
    ready: false,
    buffers: {},        // id -> AudioBuffer (korte geluiden)
    streams: {},        // id -> { el, source, gain } (lange nummers)
    videos: {},         // id -> { el, source, gain, duck } (video's)
    raw: {},            // id -> ArrayBuffer (voor het ontgrendelen)
    defs: {},           // id -> manifest-entry
    gains: {},          // id -> GainNode
    trim: {},           // id -> gebruikersafwijking in dB
    edit: {},           // id -> { start, end, hp, presence }
    fx: {},             // id -> { hp, pres } filters per geluid
    voices: {},         // id -> [ {src, gain, startedAt, duration} ]
    masterGain: null,
    limiter: null,
    duckDb: 12,         // hoeveel het oudere geluid zakt; 0 zet ducken uit
    onprogress: null,
    failed: [],         // geluiden die niet binnenkwamen of niet te decoderen waren

    /** Waar de audio vandaan komt. In het noodpakket zit alles ingebakken
        in de pagina zelf, dan is er helemaal geen bestand meer nodig. Het
        is op bestandsnaam gesleuteld, zodat kopieen (meerdere knoppen op
        een opname) bij hetzelfde ingebakken geluid uitkomen. */
    srcFor: function (d, base) {
      var bak = global.AUDIO_DATA;
      if (bak) {
        var ingebakken = bak[d.file] || bak[d.id];
        if (ingebakken) return ingebakken;
      }
      var map = base || (d.kind === 'video' ? 'video/' : (this.base || 'audio/'));
      return map + d.file + (d.hash ? '?v=' + d.hash : '');
    },

    /* ---- stap 1: bytes binnenhalen (mag vóór de eerste tik) ---- */
    prefetch: function (defs, base) {
      var self = this;
      this.failed = [];
      this.defs = {};
      defs.forEach(function (d) { self.defs[d.id] = d; });

      this.base = base;
      // meerdere knoppen kunnen hetzelfde bestand gebruiken (kopieën); dan
      // halen we het bestand één keer op en delen we het resultaat
      var gezien = {};
      var haal = defs.filter(function (d) {
        if (d.stream || gezien[d.file]) return false;
        gezien[d.file] = d.id;
        return true;
      });
      this.eersteVan = gezien;
      var total = haal.length || 1, done = 0;
      return Promise.all(haal.map(function (d) {
        var url = self.srcFor(d, base);
        return fetch(url, { cache: 'force-cache' })
          .then(function (r) {
            if (!r.ok) throw new Error(r.status + ' ' + d.file);
            return r.arrayBuffer();
          })
          .then(function (buf) {
            self.raw[d.id] = buf;
            self.rawVan = self.rawVan || {};
            self.rawVan[d.file] = d.id;
            done++;
            if (self.onprogress) self.onprogress(done / total * 0.65, d.label);
          })
          .catch(function (err) {
            console.error('Ophalen mislukt:', d.file, err);
            if (self.failed.indexOf(d.id) < 0) self.failed.push(d.id);
            done++;
            if (self.onprogress) self.onprogress(done / total * 0.65, d.label);
          });
      }));
    },

    /* ---- stap 2a: context openen — moet in de tik-afhandeling zelf
           gebeuren, anders weigert iOS geluid af te spelen ---------- */
    openContext: function () {
      if (!this.ctx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        this.ctx = new AC();

        // master -> limiter -> uitgang
        this.masterGain = this.ctx.createGain();
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -3;
        this.limiter.knee.value = 0;
        this.limiter.ratio.value = 20;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.25;
        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    /* ---- stap 2b: decoderen naar AudioBuffers ------------------- */
    unlock: function () {
      var self = this;
      this.openContext();
      var resume = this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();

      return resume.then(function () {
        var ids = Object.keys(self.raw), total = ids.length, done = 0;
        // de knoppen die hetzelfde bestand delen, krijgen straks dezelfde buffer
        var delers = {};
        Object.keys(self.defs).forEach(function (id) {
          var d = self.defs[id];
          if (d.stream) return;
          (delers[d.file] = delers[d.file] || []).push(id);
        });
        return Promise.all(ids.map(function (id) {
          return self.decode(self.raw[id]).then(function (buf) {
            (delers[self.defs[id].file] || [id]).forEach(function (deler) {
              self.buffers[deler] = buf;          // zelfde geluid, eigen knop
              var k = self.failed.indexOf(deler);
              if (k >= 0) self.failed.splice(k, 1);
              if (self.gains[deler]) return;
              var g = self.ctx.createGain();
              g.gain.value = self.gainFor(deler);
              self.gains[deler] = g;
              g.connect(self.fxFor(deler).hp);
              self.voices[deler] = [];
            });
            done++;
            if (self.onprogress) self.onprogress(0.65 + done / total * 0.35, self.defs[id].label);
          }).catch(function (err) {
            console.error('Decoderen mislukt:', id, err);
            if (self.failed.indexOf(id) < 0) self.failed.push(id);
            done++;
            if (self.onprogress) self.onprogress(0.65 + done / total * 0.35, id);
          });
        }));
      }).then(function () {
        self.raw = {};              // ruwe bytes mogen weg na het decoderen
        Object.keys(self.defs).forEach(function (id) {
          var d = self.defs[id];
          if (d.stream && d.kind !== 'video') self.openStream(id);
        });
        self.ready = true;
      });
    },

    /* Lange nummers worden niet vooraf gedecodeerd maar afgespeeld vanuit een
       audio-element. Een gedecodeerde minuut stereo kost zo'n 22 MB; met vier
       volledige nummers erbij loopt dat op tot honderden megabytes en dat is
       op een telefoon vragen om problemen. Het element buffert vooruit, dus de
       vertraging bij indrukken blijft een paar milliseconden.               */
    openStream: function (id) {
      if (this.streams[id]) return;
      var def = this.defs[id];
      var el = new Audio();
      el.src = this.srcFor(def);
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.load();

      var source = this.ctx.createMediaElementSource(el);
      var duck = this.ctx.createGain();
      duck.gain.value = 1;
      var vg = this.ctx.createGain();
      vg.gain.value = 1;
      source.connect(duck);
      duck.connect(vg);

      var g = this.ctx.createGain();
      g.gain.value = this.gainFor(id);
      g.connect(this.masterGain);
      vg.connect(g);
      this.gains[id] = g;
      this.voices[id] = [];

      // iOS wil dat elk element minstens één keer binnen een gebaar heeft
      // gespeeld; dit ontgrendelt het zonder dat je iets hoort.
      var p = el.play();
      if (p && p.then) p.then(function () { el.pause(); el.currentTime = 0; })
                        .catch(function () {});
      else { try { el.pause(); el.currentTime = 0; } catch (e) {} }

      var self = this;
      el.addEventListener('ended', function () {
        self.voices[id] = [];
        var st = self.streams[id];
        if (st) st.lastPos = 0;          // aan het eind: volgende keer weer vooraan
        self.applyDucking();
      });
      // stopt op het ingestelde eindpunt in plaats van aan het bestandseinde
      el.addEventListener('timeupdate', function () {
        var st = self.streams[id];
        if (!st || !st.stopAt) return;
        if (el.currentTime >= st.stopAt - 0.02) {
          el.pause();
          st.lastPos = 0;
          self.voices[id] = [];
          self.applyDucking();
        }
      });
      this.streams[id] = { el: el, source: source, gain: vg, duck: duck, lastPos: 0 };
    },

    decode: function (arrayBuffer) {
      var ctx = this.ctx;
      return new Promise(function (resolve, reject) {
        // Safari kent alleen de oude callback-vorm.
        var p = ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
    },

    /* ---- bijsnijden en oppoetsen -------------------------------- */

    /** Bouwt (eenmalig) de filters voor dit geluid en geeft het ingangspunt
        terug waar de gain van dit geluid naartoe moet. */
    fxFor: function (id) {
      if (this.fx[id]) return this.fx[id];
      var ctx = this.ctx;
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 20;          // 20 Hz = praktisch uit
      hp.Q.value = 0.707;
      var pres = ctx.createBiquadFilter();
      pres.type = 'peaking';
      pres.frequency.value = 3000;      // waar spraak zijn helderheid heeft
      pres.Q.value = 0.9;
      pres.gain.value = 0;
      hp.connect(pres);
      pres.connect(this.masterGain);
      this.fx[id] = { hp: hp, pres: pres };
      this.applyEdit(id);
      return this.fx[id];
    },

    /** Zet de opgeslagen bewerking van dit geluid door naar de filters. */
    applyEdit: function (id) {
      var f = this.fx[id], e = this.edit[id] || {};
      if (!f) return;
      var t = this.ctx.currentTime;
      f.hp.frequency.setTargetAtTime(Math.max(20, e.hp || 20), t, 0.01);
      f.pres.gain.setTargetAtTime(e.presence || 0, t, 0.01);
    },

    setEdit: function (id, obj) {
      this.edit[id] = obj || {};
      this.applyEdit(id);
    },

    /** Begin- en eindpunt van dit geluid, na bijsnijden. */
    span: function (id) {
      var e = this.edit[id] || {};
      var vol = this.buffers[id] ? this.buffers[id].duration
              : (this.streams[id] && this.streams[id].el.duration) || (this.defs[id] || {}).duration || 0;
      var start = Math.max(0, Math.min(e.start || 0, vol));
      var end = (e.end && e.end > start) ? Math.min(e.end, vol) : vol;
      return { start: start, end: end, total: vol };
    },

    /* ---- volume ------------------------------------------------ */
    gainFor: function (id) {
      var def = this.defs[id] || {};
      return dbToLin((def.gainDb || 0) + (this.trim[id] || 0));
    },

    setTrim: function (id, db) {
      this.trim[id] = db;
      var g = this.gains[id];
      if (g) g.gain.setTargetAtTime(this.gainFor(id), this.ctx.currentTime, 0.01);
    },

    setMaster: function (percent) {
      var v = Math.max(0, Math.min(100, percent)) / 100;
      this.masterVolume = percent;      // ook voor een video die los staat
      var self = this;
      Object.keys(this.videos).forEach(function (id) {
        var vd = self.videos[id];
        if (vd && vd.los) { try { vd.el.volume = v; } catch (e) {} }
      });
      if (!this.masterGain) return;
      this.masterGain.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.02);
    },

    /* ---- afspelen ---------------------------------------------- */
    /** Speelt een geluid af. Met `vanaf` begint het op dat punt in plaats
        van bij het begin; dat gebruiken we om na een video weer op te
        pakken waar we gebleven waren. */
    play: function (id, vanaf) {
      if (!this.ready) return null;

      var st = this.streams[id];
      if (st) {                       // gestreamd: opnieuw vanaf het begin
        var t = this.ctx.currentTime;
        st.gain.gain.cancelScheduledValues(t);
        st.gain.gain.setValueAtTime(1, t);
        try { st.el.currentTime = 0; } catch (e) {}
        var sp = this.span(id);
        st.lastPos = 0;                        // een tik op de knop begint vooraan
        this.lastStreamId = id;
        var beginS = (vanaf != null && vanaf > sp.start && vanaf < sp.end) ? vanaf : sp.start;
        try { st.el.currentTime = beginS; } catch (e) {}
        st.stopAt = sp.end;
        st.el.play().catch(function () {});
        st.duck.gain.cancelScheduledValues(t);   // begint altijd op vol volume
        st.duck.gain.setValueAtTime(1, t);
        var v = { stream: true, startedAt: t, fading: false, duck: st.duck, duckTarget: 1 };
        this.voices[id] = [v];
        this.applyDucking();
        return v;
      }

      if (!this.buffers[id]) return null;
      var ctx = this.ctx;
      var src = ctx.createBufferSource();
      src.buffer = this.buffers[id];

      var duck = ctx.createGain();        // aparte trap voor het ducken
      duck.gain.value = 1;
      var vg = ctx.createGain();          // eigen stem-gain, voor uitfaden
      vg.gain.value = 1;
      src.connect(duck);
      duck.connect(vg);
      vg.connect(this.gains[id]);

      var sp = this.span(id);
      var begin = (vanaf != null && vanaf > sp.start && vanaf < sp.end) ? vanaf : sp.start;
      var voice = {
        src: src, gain: vg, duck: duck, duckTarget: 1,
        startedAt: ctx.currentTime,
        offset: begin - sp.start,          // hoe ver we al waren bij de start
        duration: Math.max(0.02, sp.end - begin),
        fading: false
      };
      var self = this;
      src.onended = function () {
        var list = self.voices[id] || [];
        var i = list.indexOf(voice);
        if (i >= 0) list.splice(i, 1);
        try { vg.disconnect(); duck.disconnect(); } catch (e) {}
        self.applyDucking();
      };
      src.start(0, begin, voice.duration);
      this.voices[id].push(voice);
      this.applyDucking();
      return voice;
    },

    /** Faadt één geluid uit; alle lopende stemmen ervan. */
    fade: function (id, seconds) {
      var list = this.voices[id] || [];
      var self = this;
      list.slice().forEach(function (v) { self.fadeVoice(v, seconds, id); });
      return list.length > 0;
    },

    fadeVoice: function (voice, seconds, id) {
      if (voice.fading) return;
      voice.fading = true;
      this.applyDucking();
      var t = this.ctx.currentTime;
      var s = Math.max(0.05, seconds || 1);

      if (voice.video) {
        var vd = this.videos[id];
        if (!vd) return;
        var zelf = this;
        if (vd.los) {
          try { vd.el.pause(); } catch (e) {}
          this.voices[id] = [];
          this.applyDucking();
          return;
        }
        try {
          vd.gain.gain.cancelScheduledValues(t);
          vd.gain.gain.setValueAtTime(Math.max(vd.gain.gain.value, 0.0001), t);
          vd.gain.gain.exponentialRampToValueAtTime(0.0001, t + s);
        } catch (e) {}
        setTimeout(function () {
          try { vd.el.pause(); } catch (e) {}
          try { vd.gain.gain.setValueAtTime(1, zelf.ctx.currentTime); } catch (e) {}
          zelf.voices[id] = [];
          zelf.applyDucking();
        }, s * 1000 + 40);
        return;
      }

      if (voice.stream) {
        var st = this.streams[id];
        if (!st) return;
        var self = this;
        try {
          st.gain.gain.cancelScheduledValues(t);
          st.gain.gain.setValueAtTime(Math.max(st.gain.gain.value, 0.0001), t);
          st.gain.gain.exponentialRampToValueAtTime(0.0001, t + s);
        } catch (e) {}
        setTimeout(function () {
          // eerst onthouden waar we waren, dan pas terugzetten
          try { st.lastPos = st.el.currentTime; st.el.pause(); st.el.currentTime = 0; } catch (e) {}
          st.gain.gain.setValueAtTime(1, self.ctx.currentTime);
          self.voices[id] = [];
          self.applyDucking();
        }, s * 1000 + 40);
        return;
      }

      try {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), t);
        voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + s);
        voice.src.stop(t + s + 0.02);
      } catch (e) {
        try { voice.src.stop(); } catch (e2) {}
      }
    },

    /** Faadt alles uit — de grote STOP. */
    fadeAll: function (seconds) {
      var self = this, any = false;
      Object.keys(this.voices).forEach(function (id) {
        if (self.voices[id].length) any = true;
        self.voices[id].slice().forEach(function (v) { self.fadeVoice(v, seconds, id); });
      });
      return any;
    },

    /* ---- video ---------------------------------------------------- */

    /** Hangt het geluidsspoor van een <video> aan dezelfde keten als de
        rest: eigen gain met de gemeten correctie, dan de master en de
        limiter. Zo klinkt een video niet ineens harder of zachter dan de
        geluiden eromheen. Het element zelf blijft van de interface; het
        staat in de speler en verhuist nooit, want een <video> verplaatsen
        in de pagina onderbreekt het afspelen. */
    openVideo: function (id, el) {
      if (this.videos[id]) return this.videos[id];
      // Lukt het aanhaken niet, dan speelt de video gewoon met zijn eigen
      // geluid door. Dat mag nooit het beeld in de weg staan: Safari kan
      // hier weigeren, en dan is stilte beter dan een zwart scherm.
      try {
        this.openContext();
        var source = this.ctx.createMediaElementSource(el);
        var duck = this.ctx.createGain();
        duck.gain.value = 1;
        var vg = this.ctx.createGain();
        vg.gain.value = 1;
        source.connect(duck);
        duck.connect(vg);

        var g = this.ctx.createGain();
        g.gain.value = this.gainFor(id);
        g.connect(this.masterGain);
        vg.connect(g);
        this.gains[id] = g;
        this.voices[id] = [];

        this.videos[id] = { el: el, source: source, gain: vg, duck: duck };
      } catch (e) {
        console.warn('Video niet aan de geluidsketen gekregen:', e);
        this.videos[id] = { el: el, source: null, gain: null, duck: null, los: true };
        this.voices[id] = [];
      }
      return this.videos[id];
    },

    playVideo: function (id, vanaf) {
      var v = this.videos[id];
      if (!v) return null;
      var t = 0;
      if (!v.los && this.ctx) {
        try {
          if (this.ctx.state === 'suspended') this.ctx.resume();
          t = this.ctx.currentTime;
          v.gain.gain.cancelScheduledValues(t);
          v.gain.gain.setValueAtTime(1, t);
          v.duck.gain.cancelScheduledValues(t);
          v.duck.gain.setValueAtTime(1, t);
        } catch (e) { console.warn('Videogain:', e); }
      } else {
        // los van de keten: het mastervolume via het element zelf
        try { v.el.volume = Math.max(0, Math.min(1, (this.masterVolume == null ? 100 : this.masterVolume) / 100)); }
        catch (e) {}
      }
      if (vanaf != null) { try { v.el.currentTime = vanaf; } catch (e) {} }
      var voice = { video: true, startedAt: t, fading: false, duck: v.duck, duckTarget: 1 };
      this.voices[id] = [voice];
      return v.el.play();          // de belofte gaat terug naar de aanroeper
    },

    pauseVideo: function (id) {
      var v = this.videos[id];
      if (v) { try { v.el.pause(); } catch (e) {} }
    },

    stopVideo: function (id) {
      var v = this.videos[id];
      if (!v) return;
      try { v.el.pause(); v.el.currentTime = 0; } catch (e) {}
      this.voices[id] = [];
      this.applyDucking();
    },

    /* ---- onderbreken en weer oppakken ----------------------------- */

    /** Noteert wat er speelt en waar het is, en legt het daarna stil. Wordt
        gebruikt als een video het podium overneemt. */
    snapshot: function () {
      var self = this, uit = [], weg = [];
      if (!this.ctx) return uit;
      var t = this.ctx.currentTime;
      Object.keys(this.voices).forEach(function (id) {
        // Een video slaan we over, ook bij het uitfaden: die speelt juist,
        // of gaat zo beginnen. fadeAll() zou hem meteen weer stilleggen.
        if (self.videos[id]) return;
        (self.voices[id] || []).forEach(function (v) {
          if (v.fading) return;
          var sp = self.span(id), pos;
          if (v.stream) {
            var st = self.streams[id];
            pos = st && st.el ? st.el.currentTime : sp.start;
          } else {
            pos = sp.start + (v.offset || 0) + (t - v.startedAt);
          }
          if (pos < sp.end - 0.2) uit.push({ id: id, pos: pos });
          weg.push({ v: v, id: id });
        });
      });
      weg.forEach(function (x) { self.fadeVoice(x.v, 0.25, x.id); });
      return uit;
    },

    /** Zet terug wat snapshot() heeft weggehaald, op het punt waar het was. */
    restore: function (lijst) {
      var self = this;
      (lijst || []).forEach(function (s) { self.play(s.id, s.pos); });
      return (lijst || []).length;
    },

    /* ---- lange nummers: hervatten en verspringen ----------------- */

    /** Is er een lang nummer waar we iets mee kunnen? Geeft het id terug. */
    currentStream: function () {
      var self = this, bezig = null, nieuwste = -1;
      Object.keys(this.streams).forEach(function (id) {
        var v = (self.voices[id] || [])[0];
        if (self.voiceCount(id) && v && v.startedAt > nieuwste) {
          nieuwste = v.startedAt; bezig = id;      // de meest recent gestarte
        }
      });
      if (bezig) return bezig;
      var laatst = this.lastStreamId;
      if (laatst && this.streams[laatst] && this.streams[laatst].lastPos > 0.5) return laatst;
      return null;
    },

    /** Waar staat dit nummer nu? */
    streamPos: function (id) {
      var st = this.streams[id];
      if (!st) return { at: 0, start: 0, end: 0, playing: false };
      var sp = this.span(id);
      var at = this.voiceCount(id) ? st.el.currentTime : (st.lastPos || sp.start);
      return { at: at, start: sp.start, end: sp.end, playing: this.voiceCount(id) > 0 };
    },

    /** Pakt de draad weer op waar hij bleef. */
    resumeStream: function (id) {
      var st = this.streams[id];
      if (!st) return;
      var sp = this.span(id);
      var t = Math.max(sp.start, Math.min(st.lastPos || sp.start, sp.end - 0.1));
      var now = this.ctx.currentTime;
      st.gain.gain.cancelScheduledValues(now);
      st.gain.gain.setValueAtTime(1, now);
      st.duck.gain.cancelScheduledValues(now);
      st.duck.gain.setValueAtTime(1, now);
      st.stopAt = sp.end;
      this.lastStreamId = id;
      try { st.el.currentTime = t; } catch (e) {}
      st.el.play().catch(function () {});
      this.voices[id] = [{ stream: true, startedAt: now, fading: false,
                           duck: st.duck, duckTarget: 1 }];
      this.applyDucking();
    },

    pauseStream: function (id) {
      var st = this.streams[id];
      if (!st) return;
      st.lastPos = st.el.currentTime;
      try { st.el.pause(); } catch (e) {}
      this.voices[id] = [];
      this.applyDucking();
    },

    /** Springt naar een moment; werkt ook als het nummer stilstaat. */
    seekStream: function (id, seconds) {
      var st = this.streams[id];
      if (!st) return;
      var sp = this.span(id);
      var t = Math.max(sp.start, Math.min(seconds, sp.end - 0.05));
      st.lastPos = t;
      try { st.el.currentTime = t; } catch (e) {}
    },

    /* ---- een geluid er later bij laden (voor kopieën) ------------ */

    /** Laadt één geluid na het opstarten. Gebruikt een al gedecodeerde
        buffer van hetzelfde bestand als die er is, zodat tien fragmenten
        uit één opname samen niet meer geheugen kosten dan één. */
    loadOne: function (def) {
      var self = this;
      this.defs[def.id] = def;
      if (this.buffers[def.id]) return Promise.resolve(true);

      function koppel(buf) {
        self.buffers[def.id] = buf;
        if (!self.gains[def.id]) {
          var g = self.ctx.createGain();
          g.gain.value = self.gainFor(def.id);
          self.gains[def.id] = g;
          g.connect(self.fxFor(def.id).hp);
        }
        self.voices[def.id] = [];
        return true;
      }

      var zelfde = null;
      Object.keys(this.buffers).forEach(function (id) {
        if (!zelfde && self.defs[id] && self.defs[id].file === def.file) zelfde = self.buffers[id];
      });
      if (zelfde) return Promise.resolve(koppel(zelfde));

      return fetch(this.srcFor(def))
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.arrayBuffer();
        })
        .then(function (b) { return self.decode(b); })
        .then(koppel)
        .catch(function (err) {
          console.error('Kopie laden mislukt:', def.id, err);
          if (self.failed.indexOf(def.id) < 0) self.failed.push(def.id);
          return false;
        });
    },

    /** Haalt een kopie weer helemaal weg. */
    dropSound: function (id) {
      this.fade(id, 0.1);
      delete this.buffers[id];
      delete this.defs[id];
      delete this.voices[id];
      try { if (this.gains[id]) this.gains[id].disconnect(); } catch (e) {}
      delete this.gains[id];
      try { if (this.fx[id]) { this.fx[id].hp.disconnect(); this.fx[id].pres.disconnect(); } } catch (e) {}
      delete this.fx[id];
      delete this.edit[id];
    },

    /* ---- ducken -------------------------------------------------- */

    /** Alle stemmen die nu echt klinken, dus zonder de uitfadende. */
    activeVoices: function () {
      var self = this, out = [];
      Object.keys(this.voices).forEach(function (id) {
        (self.voices[id] || []).forEach(function (v) { if (!v.fading) out.push(v); });
      });
      return out;
    },

    /** Het nieuwste geluid blijft vol, oudere zakken weg. Wordt opnieuw
        gedraaid zodra er iets begint of eindigt. */
    applyDucking: function () {
      var ctx = this.ctx;
      if (!ctx) return;
      var list = this.activeVoices();
      if (!this.duckDb || list.length < 2) {
        list.forEach(function (v) { rampDuck(ctx, v, 1); });
        return;
      }
      var nieuwste = 0;
      list.forEach(function (v) { if (v.startedAt > nieuwste) nieuwste = v.startedAt; });
      var zacht = dbToLin(-Math.abs(this.duckDb));
      list.forEach(function (v) {
        rampDuck(ctx, v, (nieuwste - v.startedAt) <= DUCK_SAMEN ? 1 : zacht);
      });
    },

    setDuck: function (db) {
      this.duckDb = Math.abs(db || 0);
      this.applyDucking();
    },

    /** Voor de interface: staat dit geluid nu weggedrukt? */
    isDucked: function (id) {
      var list = this.voices[id] || [];
      for (var i = 0; i < list.length; i++) {
        if (!list[i].fading && list[i].duckTarget !== undefined && list[i].duckTarget < 1) return true;
      }
      return false;
    },

    /* ---- alles offline klaarzetten ------------------------------ */

    /** De urls zoals de app ze opvraagt, inclusief de inhoudshash. */
    audioUrls: function () {
      var self = this;
      return Object.keys(this.defs).map(function (id) { return self.srcFor(self.defs[id]); })
        .filter(function (u) { return u.indexOf('data:') !== 0; });
    },

    /** Hoeveel van de geluiden staan al opgeslagen? */
    cacheStatus: function () {
      var urls = this.audioUrls();
      if (!global.caches || !global.caches.match) {
        return Promise.resolve({ have: 0, total: urls.length, supported: false });
      }
      return Promise.all(urls.map(function (u) {
        return caches.match(u).then(function (r) { return r ? 1 : 0; })
          .catch(function () { return 0; });
      })).then(function (hits) {
        var n = 0;
        hits.forEach(function (h) { n += h; });
        return { have: n, total: urls.length, supported: true };
      });
    },

    /** Haalt alles binnen dat er nog niet is. Eén voor één, zodat een
        telefoon niet twintig downloads tegelijk hoeft te openen. */
    cacheAll: function (onProgress) {
      var urls = this.audioUrls(), done = 0, mislukt = 0;
      var chain = Promise.resolve();
      urls.forEach(function (u) {
        chain = chain.then(function () {
          return fetch(u).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.arrayBuffer();          // helemaal uitlezen, niet alleen de kop
          }).catch(function () { mislukt++; })
            .then(function () {
              done++;
              if (onProgress) onProgress(done, urls.length, mislukt);
            });
        });
      });
      return chain.then(function () { return { total: urls.length, failed: mislukt }; });
    },

    /* ---- status voor de interface ------------------------------ */
    isPlaying: function (id) { return this.voiceCount(id) > 0; },

    anyPlaying: function () {
      var ids = Object.keys(this.defs);
      for (var i = 0; i < ids.length; i++) if (this.voiceCount(ids[i])) return true;
      return false;
    },

    /** 0..1 voortgang van de langst lopende stem van dit geluid. */
    progress: function (id) {
      var st = this.streams[id];
      if (st) {
        var sp = this.span(id);
        var lengte = sp.end - sp.start;
        if (lengte <= 0) return 0;
        return Math.max(0, Math.min(1, (st.el.currentTime - sp.start) / lengte));
      }
      var list = this.voices[id] || [];
      if (!list.length) return 0;
      var oldest = list[0], t = this.ctx.currentTime;
      for (var i = 1; i < list.length; i++) {
        if (list[i].startedAt < oldest.startedAt) oldest = list[i];
      }
      if (!oldest.duration) return 0;
      // na hervatten telt het stuk dat al voorbij was gewoon mee
      var al = oldest.offset || 0;
      return Math.max(0, Math.min(1, (al + t - oldest.startedAt) / (al + oldest.duration)));
    },

    voiceCount: function (id) {
      var st = this.streams[id];
      if (st) return (st.el && !st.el.paused && !st.el.ended) ? 1 : 0;
      return (this.voices[id] || []).length;
    }
  };

  global.AudioEngine = Engine;
})(window);
