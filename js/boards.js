/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — borden
   Elk bord heeft zijn eigen knoppen, volgorde, uiterlijk, timer en
   geluidsinstellingen. Hier staat welke borden er op dit toestel zijn en
   waar hun instellingen bewaard worden.

   Opslag in de browser:
     bfss:borden        { list: [{ key, title, ... }], last }
     bfss:bord:<key>    het bord zelf, precies zoals Settings.data
     bfss:v1            het enige bord van voor er meerdere waren; wordt
                        bij de eerste start het eerste bord en blijft als
                        reservekopie staan

   Een bord staat alleen op dit toestel, of het staat online (dan is de
   sleutel het id in de database). Van een online bord bewaren we ook:
     bfss:basis:<key>   het bord zoals de database het had bij de laatste
                        synchronisatie (zie js/sync.js)
     bfss:defs:<key>    de geluiden die bij het bord horen, zodat het ook
                        zonder netwerk opent
   en in de lijst: online, role ('owner', 'edit' of 'play'), version, en
   token als je het via een link opende.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var LIJST = 'bfss:borden';
  var BORD = 'bfss:bord:';
  var BASIS = 'bfss:basis:';
  var DEFS = 'bfss:defs:';
  var OUD = 'bfss:v1';

  function lees(k) {
    try {
      var r = global.localStorage.getItem(k);
      return r ? JSON.parse(r) : null;
    } catch (e) {
      console.warn('Kon ' + k + ' niet lezen:', e);
      return null;
    }
  }

  function schrijf(k, v) {
    try {
      global.localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      console.warn('Kon ' + k + ' niet bewaren:', e);
      return false;
    }
  }

  function wis(k) {
    try { global.localStorage.removeItem(k); } catch (e) {}
  }

  function nieuweSleutel() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function kopie(obj) { return JSON.parse(JSON.stringify(obj)); }

  var Boards = {
    list: [],          // [{ key, title }]
    last: null,        // het bord dat het laatst open stond
    current: null,

    /** Leest de borden op dit toestel. Staat er nog geen enkel bord, dan
        wordt het oude enkele bord het eerste - of, in een noodpakket, het
        bord dat erin is ingebakken. Een toestel dat nooit eerder een bord
        had, begint leeg. */
    load: function (all) {
      var st = lees(LIJST);
      if (st && Array.isArray(st.list)) {
        this.list = st.list.filter(function (b) { return b && b.key; });
        this.last = st.last || null;
      }
      if (!this.list.length && !(st && st.leeg) && (global.PRESET_SETTINGS || lees(OUD))) {
        this.migrate(all || []);
      }
      if (!this.entry(this.last)) this.last = this.list.length ? this.list[0].key : null;
      return this.list;
    },

    /** Het eerste bord. Het krijgt alles wat er nu aan geluiden is, zoals
        het altijd ging: wat nog nergens op het bord of in het archief staat
        komt achteraan. */
    migrate: function (all) {
      var S = global.Settings;
      var bron = null;
      if (global.PRESET_SETTINGS) bron = global.PRESET_SETTINGS;   // noodpakket
      else bron = lees(OUD);
      var doc = S.merge(S.defaults(), bron ? kopie(bron) : {});
      if (!bron || !bron.title) doc.title = 'SPEECH';
      // een noodpakket van een online bord weet precies wat erop hoort
      if (global.PRESET_SETTINGS) all = [];

      var gezien = {};
      doc.order.forEach(function (id) { if (id) gezien[id] = 1; });
      doc.archived.forEach(function (id) { gezien[id] = 1; });
      (doc.clones || []).forEach(function (c) { if (c && c.id) gezien[c.id] = 1; });
      // Vroeger stond alles uit het manifest op het ene bord; dat blijft zo.
      // De sjabloongeluiden (set: 'sjabloon') zijn van later en horen er niet op.
      all.forEach(function (d) {
        if (!gezien[d.id] && !d.set) { doc.order.push(d.id); gezien[d.id] = 1; }
      });
      this.create(doc.title, doc);
    },

    entry: function (key) {
      for (var i = 0; i < this.list.length; i++) if (this.list[i].key === key) return this.list[i];
      return null;
    },

    saveList: function () {
      // 'leeg' onthoudt dat er ooit borden waren, zodat een toestel waar je
      // alles weggooide niet opnieuw het oude bord tevoorschijn tovert
      schrijf(LIJST, { list: this.list, last: this.last, leeg: true });
    },

    /** Het bord zoals het bewaard is (een losse kopie). */
    doc: function (key) {
      var d = lees(BORD + key);
      return d && typeof d === 'object' ? d : null;
    },

    saveDoc: function (key, doc) {
      var ok = schrijf(BORD + key, doc);
      var e = this.entry(key);
      if (e && doc && doc.title && e.title !== doc.title) {
        e.title = doc.title;
        this.saveList();
      }
      return ok;
    },

    /** Maakt een nieuw bord en geeft zijn sleutel terug. */
    create: function (title, doc) {
      var S = global.Settings;
      var d = S.merge(S.defaults(), doc ? kopie(doc) : {});
      d.title = String(title || d.title || 'NIEUW BORD').slice(0, 40);
      var key = nieuweSleutel();
      this.list.push({ key: key, title: d.title });
      schrijf(BORD + key, d);
      if (!this.last) this.last = key;
      this.saveList();
      return key;
    },

    /** Een kopie van een bestaand bord, met alles erop en eraan. */
    duplicate: function (key, title) {
      var d = this.doc(key);
      if (!d) return null;
      return this.create(title || (d.title + ' 2'), d);
    },

    rename: function (key, title) {
      var d = this.doc(key);
      if (!d) return;
      d.title = String(title || '').trim().slice(0, 40) || d.title;
      this.saveDoc(key, d);
    },

    remove: function (key) {
      this.list = this.list.filter(function (b) { return b.key !== key; });
      wis(BORD + key);
      wis(BASIS + key);
      wis(DEFS + key);
      if (this.last === key) this.last = this.list.length ? this.list[0].key : null;
      if (this.current === key) this.current = null;
      this.saveList();
    },

    /* ---- online borden ---------------------------------------------- */

    isOnline: function (key) {
      var e = this.entry(key);
      return !!(e && e.online);
    },

    basis: function (key) { return lees(BASIS + key) || {}; },

    saveBasis: function (key, doc, version) {
      schrijf(BASIS + key, doc);
      var e = this.entry(key);
      if (e && version) { e.version = version; this.saveList(); }
    },

    /** De geluiden van een online bord, zoals de database ze gaf. */
    defs: function (key) { return lees(DEFS + key) || []; },

    saveDefs: function (key, defs) { schrijf(DEFS + key, defs || []); },

    /** Zet een bord van de database op dit toestel, of werkt het bij.
        Eigen wijzigingen die nog niet verstuurd waren komen er weer
        overheen; het mastervolume blijft van dit toestel. */
    putOnline: function (b, token) {
      var key = b.id, e = this.entry(key);
      var Sync = global.Sync;
      var oudBasis = lees(BASIS + key), oudWerk = lees(BORD + key);
      if (!e) {
        e = { key: key };
        this.list.push(e);
      }
      e.title = b.title;
      e.online = true;
      e.role = b.role;
      e.version = b.version;
      e.owner = b.owner || e.owner || '';
      e.gone = false;
      delete e.stub;                     // nu staat het echt op dit toestel
      if (token) e.token = token;
      if (b.playToken) e.playToken = b.playToken;
      e.editToken = b.editToken || null;

      var werk = kopie(b.doc || {});
      var magBewerken = b.role === 'owner' || b.role === 'edit';
      if (magBewerken && oudWerk && oudBasis && Sync) {
        werk = Sync.apply(werk, Sync.diff(oudBasis, oudWerk));
      }
      if (oudWerk && oudWerk.masterVolume !== undefined) werk.masterVolume = oudWerk.masterVolume;
      schrijf(BASIS + key, b.doc || {});
      schrijf(BORD + key, werk);
      if (b.sounds) schrijf(DEFS + key, b.sounds);
      this.saveList();
      return key;
    },

    /** Een online bord waarvan nog niets op dit toestel staat (alleen de
        naam uit de lijst). Het bord zelf komt bij het openen. */
    addStub: function (b) {
      var e = this.entry(b.id);
      if (e) {
        e.title = b.title; e.role = b.role; e.online = true;
        return e.key;
      }
      this.list.push({ key: b.id, title: b.title, online: true, role: b.role, version: 0, stub: true });
      return b.id;
    },

    /** Staat er van dit bord al iets op het toestel om mee te openen? */
    hasLocal: function (key) { return !!this.doc(key); },

    /** Werkt de lijst bij met wat de database zegt dat van jou is. Borden
        die daar niet meer bij staan (weggegooid, of de link ingetrokken)
        gaan hier ook weg, behalve borden die je met een link opende. */
    mergeServerList: function (server) {
      var self = this, ids = {};
      (server || []).forEach(function (b) {
        ids[b.id] = 1;
        var e = self.entry(b.id);
        if (!e) self.addStub(b);
        else { e.title = b.title; e.role = b.role; e.online = true; }
      });
      this.list.filter(function (e) { return e.online && !e.token && !ids[e.key]; })
        .forEach(function (e) { self.remove(e.key); });
      this.saveList();
    },

    /** Zet een bord open en geeft het terug. */
    select: function (key) {
      var d = this.doc(key);
      if (!d) return null;
      this.current = key;
      this.last = key;
      this.saveList();
      return d;
    },

    /** Hoeveel knoppen staan er op een bord? */
    count: function (key) {
      var d = this.doc(key);
      return d && Array.isArray(d.order) ? d.order.filter(Boolean).length : 0;
    },

    /** De geluiden die bij dit bord horen: wat erop staat, wat in het
        archief ligt en de kopieën. Alleen die hoeven te worden ingeladen. */
    defsFor: function (doc, all) {
      var self = this, byId = {}, uit = [], gehad = {};
      all.forEach(function (d) { byId[d.id] = d; });
      (doc.order || []).concat(doc.archived || []).forEach(function (id) {
        if (id && byId[id] && !gehad[id]) { gehad[id] = 1; uit.push(byId[id]); }
      });
      (doc.clones || []).forEach(function (c) {
        if (!c || !c.id || gehad[c.id]) return;
        var d = self.cloneDef(c, byId);
        if (d) { gehad[c.id] = 1; uit.push(d); }
      });
      return uit;
    },

    /** Een kopie-knop: een tweede knop op dezelfde opname, met een eigen
        naam en uitsnede. Een kopie wijst naar zijn bron ('of'); de opname,
        de gemeten correctie en de golfvorm komen daarvandaan. Kopieën van
        voor er online borden waren hebben het bestand zelf nog bij zich. */
    cloneDef: function (c, byId) {
      if (!c.of) return (c.url || c.file) ? c : null;
      var bron = byId[c.of];
      if (!bron) return null;
      var d = {};
      ['file', 'url', 'hash', 'gainDb', 'duration', 'peaks', 'label', 'icon', 'color'].forEach(function (k) {
        if (bron[k] !== undefined) d[k] = bron[k];
      });
      Object.keys(c).forEach(function (k) { d[k] = c[k]; });
      // een fragment hoort direct te klinken: altijd uit het geheugen
      delete d.stream;
      d.kind = 'audio';
      return d;
    },

    /** Zet oude kopieën (met het bestand erin) om naar kopieën die naar
        hun bron wijzen. Nodig voordat een bord online gaat: de bestanden
        op de site verdwijnen, de geluiden in de bibliotheek blijven. */
    modernClones: function (doc, all) {
      var perBestand = {};
      all.forEach(function (d) { if (d.file) perBestand[d.file] = d.id; });
      (doc.clones || []).forEach(function (c, i) {
        if (!c || c.of || !c.file || !perBestand[c.file]) return;
        var nieuw = { id: c.id, of: perBestand[c.file] };
        ['label', 'icon', 'color'].forEach(function (k) { if (c[k] !== undefined) nieuw[k] = c[k]; });
        doc.clones[i] = nieuw;
      });
      return doc;
    }
  };

  global.Boards = Boards;
})(window);
