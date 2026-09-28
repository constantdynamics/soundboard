/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — samen aan een bord werken
   Een online bord staat op twee plekken: in de database en op dit
   toestel. Wat je aanpast gaat meteen naar de database, als losse
   wijzigingen per instelling of per knop. Zo overschrijven twee mensen
   die tegelijk bezig zijn elkaar alleen als ze precies hetzelfde
   aanpassen.

   Wat een ander aanpast wordt NIET vanzelf in je bord gezet: je krijgt
   een melding "er zijn wijzigingen" en kiest zelf wanneer je bijwerkt.
   Dan verandert er nooit iets onder je vingers, midden in een optreden.

   Op het toestel (zie js/boards.js):
     bfss:bord:<id>   het bord zoals jij het ziet, met je eigen wijzigingen
     bfss:basis:<id>  het bord zoals de database het had bij de laatste
                      synchronisatie; het verschil met hierboven is wat er
                      nog verstuurd moet worden (ook na een tijd offline)
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var B = global.Boards, Cloud = global.Cloud;

  /* Wat er per bord gedeeld wordt. Het mastervolume blijft bewust op het
     toestel: dat is de schuif waar je tijdens een optreden aan draait. */
  var SLEUTELS = ['title', 'font', 'fontScale', 'palette', 'fill', 'border', 'gap',
                  'radius', 'size', 'columns', 'fade', 'duck', 'timerTarget',
                  'showLabels', 'order', 'archived', 'clones'];

  var POLL_MS = 5000;

  /** JSON met de sleutels op volgorde: de database zet ze in een andere
      volgorde terug dan wij ze schreven, en dat is geen wijziging. */
  function vast(v) {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(vast).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + vast(v[k]); }).join(',') + '}';
  }

  function kopie(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /** De wijzigingen van a naar b. */
  function diff(a, b) {
    a = a || {}; b = b || {};
    var ops = [];
    SLEUTELS.forEach(function (k) {
      if (b[k] === undefined) return;
      if (vast(a[k]) !== vast(b[k])) ops.push({ p: [k], v: kopie(b[k]) });
    });
    var sa = a.sounds || {}, sb = b.sounds || {};
    Object.keys(sb).forEach(function (id) {
      if (vast(sa[id]) !== vast(sb[id])) ops.push({ p: ['sounds', id], v: kopie(sb[id]) });
    });
    Object.keys(sa).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(sb, id)) ops.push({ p: ['sounds', id], d: true });
    });
    return ops;
  }

  /** Zet wijzigingen op een bord, precies zoals de database dat doet. */
  function apply(doc, ops) {
    doc = kopie(doc) || {};
    ops.forEach(function (op) {
      if (op.p.length === 1) {
        if (op.d) delete doc[op.p[0]]; else doc[op.p[0]] = kopie(op.v);
      } else {
        if (!doc.sounds || typeof doc.sounds !== 'object') doc.sounds = {};
        if (op.d) delete doc.sounds[op.p[1]]; else doc.sounds[op.p[1]] = kopie(op.v);
      }
    });
    return doc;
  }

  var Sync = {
    key: null,          // het online bord dat nu open staat
    lastKnown: 0,       // de laatste versie die we kennen (ook van onszelf)
    remote: null,       // { version, by }: wijzigingen van een ander die wachten
    sending: false,
    gone: null,         // waarom het bord niet meer bereikbaar is
    onremote: null,     // de interface laat de melding zien
    ongone: null,       // de interface meldt dat het bord weg is
    onsaved: null,      // de interface kan laten zien dat alles verstuurd is
    timer: null,
    poller: null,

    diff: diff,
    apply: apply,
    stable: vast,

    /** Is dit een bord waar je aan mag werken? */
    canEdit: function (key) {
      var e = B.entry(key || this.key);
      if (!e || !e.online) return true;          // lokaal: altijd
      return (e.role === 'owner' || e.role === 'edit') && !e.gone;
    },

    /** Wie ben je voor dit bord: je persoonlijke sleutel en/of de link. */
    auth: function (key) {
      var e = B.entry(key || this.key) || {};
      return { p_ik: Cloud.ik(), p_token: e.token || null, p_board: key || this.key };
    },

    start: function (key) {
      this.stop();
      var e = B.entry(key);
      if (!e || !e.online || !Cloud.enabled) return;
      this.key = key;
      this.lastKnown = e.version || 0;
      this.remote = null;
      this.gone = null;
      if (this.pending()) this.soon(50);
      this.plan();
    },

    stop: function () {
      clearTimeout(this.timer);
      clearTimeout(this.poller);
      this.timer = this.poller = null;
      this.key = null;
      this.remote = null;
    },

    /** Staat er nog iets klaar om te versturen? */
    pending: function (key) {
      key = key || this.key;
      if (!key || !this.canEdit(key)) return false;
      return diff(B.basis(key), B.doc(key)).length > 0;
    },

    /** Het bord is lokaal bewaard; nu nog naar de database. */
    changed: function () {
      if (!this.key || !this.canEdit()) return;
      this.soon(700);
    },

    soon: function (ms) {
      var self = this;
      clearTimeout(this.timer);
      this.timer = setTimeout(function () { self.flush(); }, ms);
    },

    flush: function () {
      var self = this, key = this.key;
      if (!key || this.sending || !this.canEdit()) return Promise.resolve(false);
      var basis = B.basis(key), werk = B.doc(key);
      var ops = diff(basis, werk);
      if (!ops.length) return Promise.resolve(true);
      this.sending = true;
      var args = this.auth(key);
      args.p_ops = ops;
      return Cloud.rpc('sb_board_patch', args).then(function (r) {
        self.sending = false;
        B.saveBasis(key, apply(basis, ops), r.version);
        if (key !== self.key) return true;
        // Zat er tussen onze vorige versie en deze nog een wijziging van
        // een ander, dan is die er nu wel in de database maar nog niet hier.
        if (r.before !== self.lastKnown) self.markRemote(r.version, null);
        self.lastKnown = r.version;
        if (self.pending()) self.soon(300);        // intussen kwam er nog iets bij
        else if (self.onsaved) self.onsaved();
        return true;
      }, function (err) {
        self.sending = false;
        if (err.status === 403 || err.status === 404) { self.lost(err.message); return false; }
        // geen verbinding of de database slaapt: straks gewoon opnieuw
        if (key === self.key) self.soon(15000);
        return false;
      });
    },

    /** Kijkt af en toe of een ander iets heeft veranderd. */
    plan: function () {
      var self = this;
      clearTimeout(this.poller);
      this.poller = setTimeout(function () { self.poll(); }, POLL_MS);
    },

    poll: function () {
      var self = this, key = this.key;
      if (!key) return;
      if (document.hidden || this.sending || this.gone) { this.plan(); return; }
      Cloud.rpc('sb_board_version', this.auth(key), 8000).then(function (r) {
        if (key !== self.key) return;
        if (r && r.gone) { self.lost('De link van dit bord is ingetrokken, of het bord bestaat niet meer.'); return; }
        // met eigen wijzigingen onderweg wachten we op het antwoord daarop
        if (r && r.version > self.lastKnown && !self.sending && !self.pending()) {
          self.lastKnown = r.version;
          self.markRemote(r.version, r.updatedBy);
        }
      }).catch(function () {}).then(function () { if (key === self.key) self.plan(); });
    },

    markRemote: function (version, by) {
      this.remote = { version: version, by: by || (this.remote && this.remote.by) || null };
      if (this.onremote) this.onremote(this.remote);
    },

    lost: function (waarom) {
      var e = B.entry(this.key);
      if (e) { e.gone = true; B.saveList(); }
      this.gone = waarom || 'Dit bord is niet meer bereikbaar.';
      clearTimeout(this.poller);
      if (this.ongone) this.ongone(this.gone);
    },

    /** Haalt het bord uit de database en zet je eigen, nog niet verstuurde
        wijzigingen er weer overheen. Geeft het bord terug zoals het nu is. */
    pull: function (key) {
      var self = this;
      key = key || this.key;
      return Cloud.rpc('sb_board_get', this.auth(key)).then(function (b) {
        B.putOnline(b, null);
        if (key === self.key) {
          self.lastKnown = b.version;
          self.remote = null;
        }
        return b;
      });
    }
  };

  global.Sync = Sync;
})(window);
