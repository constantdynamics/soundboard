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

  var Engine = {
    ctx: null,
    ready: false,
    buffers: {},        // id -> AudioBuffer
    raw: {},            // id -> ArrayBuffer (voor het ontgrendelen)
    defs: {},           // id -> manifest-entry
    gains: {},          // id -> GainNode
    trim: {},           // id -> gebruikersafwijking in dB
    voices: {},         // id -> [ {src, gain, startedAt, duration} ]
    masterGain: null,
    limiter: null,
    onprogress: null,

    /* ---- stap 1: bytes binnenhalen (mag vóór de eerste tik) ---- */
    prefetch: function (defs, base) {
      var self = this;
      this.defs = {};
      defs.forEach(function (d) { self.defs[d.id] = d; });

      var total = defs.length, done = 0;
      return Promise.all(defs.map(function (d) {
        return fetch(base + d.file, { cache: 'force-cache' })
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
        self.ready = true;
      });
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
      if (!this.ready || !this.buffers[id]) return null;
      var ctx = this.ctx;
      var src = ctx.createBufferSource();
      src.buffer = this.buffers[id];

      var vg = ctx.createGain();          // eigen stem-gain, voor uitfaden
      vg.gain.value = 1;
      src.connect(vg);
      vg.connect(this.gains[id]);

      var voice = {
        src: src, gain: vg,
        startedAt: ctx.currentTime,
        duration: src.buffer.duration,
        fading: false
      };
      var self = this;
      src.onended = function () {
        var list = self.voices[id] || [];
        var i = list.indexOf(voice);
        if (i >= 0) list.splice(i, 1);
        try { vg.disconnect(); } catch (e) {}
      };
      src.start(0);
      this.voices[id].push(voice);
      return voice;
    },

    /** Faadt één geluid uit; alle lopende stemmen ervan. */
    fade: function (id, seconds) {
      var list = this.voices[id] || [];
      var self = this;
      list.slice().forEach(function (v) { self.fadeVoice(v, seconds); });
      return list.length > 0;
    },

    fadeVoice: function (voice, seconds) {
      if (voice.fading) return;
      voice.fading = true;
      var t = this.ctx.currentTime;
      var s = Math.max(0.05, seconds || 1);
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
        self.voices[id].slice().forEach(function (v) { self.fadeVoice(v, seconds); });
      });
      return any;
    },

    /* ---- status voor de interface ------------------------------ */
    isPlaying: function (id) {
      var list = this.voices[id] || [];
      for (var i = 0; i < list.length; i++) if (!list[i].fading) return true;
      return list.length > 0;
    },

    anyPlaying: function () {
      var ids = Object.keys(this.voices);
      for (var i = 0; i < ids.length; i++) if (this.voices[ids[i]].length) return true;
      return false;
    },

    /** 0..1 voortgang van de langst lopende stem van dit geluid. */
    progress: function (id) {
      var list = this.voices[id] || [];
      if (!list.length) return 0;
      var oldest = list[0], t = this.ctx.currentTime;
      for (var i = 1; i < list.length; i++) {
        if (list[i].startedAt < oldest.startedAt) oldest = list[i];
      }
      if (!oldest.duration) return 0;
      return Math.max(0, Math.min(1, (t - oldest.startedAt) / oldest.duration));
    },

    voiceCount: function (id) { return (this.voices[id] || []).length; }
  };

  global.AudioEngine = Engine;
})(window);
