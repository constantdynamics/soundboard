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
    raw: {},            // id -> ArrayBuffer (voor het ontgrendelen)
    defs: {},           // id -> manifest-entry
    gains: {},          // id -> GainNode
    trim: {},           // id -> gebruikersafwijking in dB
    voices: {},         // id -> [ {src, gain, startedAt, duration} ]
    masterGain: null,
    limiter: null,
    duckDb: 12,         // hoeveel het oudere geluid zakt; 0 zet ducken uit
    onprogress: null,

    /* ---- stap 1: bytes binnenhalen (mag vóór de eerste tik) ---- */
    prefetch: function (defs, base) {
      var self = this;
      this.defs = {};
      defs.forEach(function (d) { self.defs[d.id] = d; });

      this.base = base;
      var haal = defs.filter(function (d) { return !d.stream; });
      var total = haal.length || 1, done = 0;
      return Promise.all(haal.map(function (d) {
        var url = base + d.file + (d.hash ? '?v=' + d.hash : '');
        return fetch(url, { cache: 'force-cache' })
          .then(function (r) {
            if (!r.ok) throw new Error(r.status + ' ' + d.file);
            return r.arrayBuffer();
          })
          .then(function (buf) {
            self.raw[d.id] = buf;
            done++;
            if (self.onprogress) self.onprogress(done / total * 0.65, d.label);
          })
          .catch(function (err) {
            console.error('Ophalen mislukt:', d.file, err);
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
        return Promise.all(ids.map(function (id) {
          return self.decode(self.raw[id]).then(function (buf) {
            self.buffers[id] = buf;
            var g = self.ctx.createGain();
            g.gain.value = self.gainFor(id);
            g.connect(self.masterGain);
            self.gains[id] = g;
            self.voices[id] = [];
            done++;
            if (self.onprogress) self.onprogress(0.65 + done / total * 0.35, self.defs[id].label);
          }).catch(function (err) {
            console.error('Decoderen mislukt:', id, err);
            done++;
            if (self.onprogress) self.onprogress(0.65 + done / total * 0.35, id);
          });
        }));
      }).then(function () {
        self.raw = {};              // ruwe bytes mogen weg na het decoderen
        Object.keys(self.defs).forEach(function (id) {
          if (self.defs[id].stream) self.openStream(id);
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
      el.src = this.base + def.file + (def.hash ? '?v=' + def.hash : '');
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
        self.applyDucking();
      });
      this.streams[id] = { el: el, source: source, gain: vg, duck: duck };
    },

    decode: function (arrayBuffer) {
      var ctx = this.ctx;
      return new Promise(function (resolve, reject) {
        // Safari kent alleen de oude callback-vorm.
        var p = ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
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
      if (!this.masterGain) return;
      var v = Math.max(0, Math.min(100, percent)) / 100;
      this.masterGain.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.02);
    },

    /* ---- afspelen ---------------------------------------------- */
    play: function (id) {
      if (!this.ready) return null;

      var st = this.streams[id];
      if (st) {                       // gestreamd: opnieuw vanaf het begin
        var t = this.ctx.currentTime;
        st.gain.gain.cancelScheduledValues(t);
        st.gain.gain.setValueAtTime(1, t);
        try { st.el.currentTime = 0; } catch (e) {}
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

      var voice = {
        src: src, gain: vg, duck: duck, duckTarget: 1,
        startedAt: ctx.currentTime,
        duration: src.buffer.duration,
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
      src.start(0);
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
          try { st.el.pause(); st.el.currentTime = 0; } catch (e) {}
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
      return Object.keys(this.defs).map(function (id) {
        var d = self.defs[id];
        return (self.base || 'audio/') + d.file + (d.hash ? '?v=' + d.hash : '');
      });
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
        if (!st.el.duration) return 0;
        return Math.max(0, Math.min(1, st.el.currentTime / st.el.duration));
      }
      var list = this.voices[id] || [];
      if (!list.length) return 0;
      var oldest = list[0], t = this.ctx.currentTime;
      for (var i = 1; i < list.length; i++) {
        if (list[i].startedAt < oldest.startedAt) oldest = list[i];
      }
      if (!oldest.duration) return 0;
      return Math.max(0, Math.min(1, (t - oldest.startedAt) / oldest.duration));
    },

    voiceCount: function (id) {
      var st = this.streams[id];
      if (st) return (st.el && !st.el.paused && !st.el.ended) ? 1 : 0;
      return (this.voices[id] || []).length;
    }
  };

  global.AudioEngine = Engine;
})(window);
