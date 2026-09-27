/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — borden
   Elk bord heeft zijn eigen knoppen, volgorde, uiterlijk, timer en
   geluidsinstellingen. Hier staat welke borden er op dit toestel zijn en
   waar hun instellingen bewaard worden.

   Opslag in de browser:
     bfss:borden        { list: [{ key, title }], last }
     bfss:bord:<key>    het bord zelf, precies zoals Settings.data
     bfss:v1            het enige bord van voor er meerdere waren; wordt
                        bij de eerste start het eerste bord en blijft als
                        reservekopie staan
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var LIJST = 'bfss:borden';
  var BORD = 'bfss:bord:';
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
        bord dat erin is ingebakken. */
    load: function (all) {
      var st = lees(LIJST);
      if (st && Array.isArray(st.list)) {
        this.list = st.list.filter(function (b) { return b && b.key; });
        this.last = st.last || null;
      }
      if (!this.list.length) this.migrate(all || []);
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

      var gezien = {};
      doc.order.forEach(function (id) { if (id) gezien[id] = 1; });
      doc.archived.forEach(function (id) { gezien[id] = 1; });
      (doc.clones || []).forEach(function (c) { if (c && c.id) gezien[c.id] = 1; });
      all.forEach(function (d) {
        if (!gezien[d.id]) { doc.order.push(d.id); gezien[d.id] = 1; }
      });
      this.create(doc.title, doc);
    },

    entry: function (key) {
      for (var i = 0; i < this.list.length; i++) if (this.list[i].key === key) return this.list[i];
      return null;
    },

    saveList: function () {
      schrijf(LIJST, { list: this.list, last: this.last });
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
      if (this.last === key) this.last = this.list.length ? this.list[0].key : null;
      if (this.current === key) this.current = null;
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
      var byId = {}, uit = [], gehad = {};
      all.forEach(function (d) { byId[d.id] = d; });
      (doc.order || []).concat(doc.archived || []).forEach(function (id) {
        if (id && byId[id] && !gehad[id]) { gehad[id] = 1; uit.push(byId[id]); }
      });
      (doc.clones || []).forEach(function (c) {
        if (c && c.id && !gehad[c.id] && (c.url || c.file)) { gehad[c.id] = 1; uit.push(c); }
      });
      return uit;
    }
  };

  global.Boards = Boards;
})(window);
