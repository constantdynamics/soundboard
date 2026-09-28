/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — de bibliotheek
   Drie soorten geluiden:
     - standaard: staan in de site zelf (js/manifest.js), voor iedereen
     - van jou: in de online opslag, privé of gedeeld
     - gedeeld: wat anderen voor iedereen beschikbaar hebben gemaakt
   Privé betekent: een ander vindt het niet in de bibliotheek, maar hoort
   het wel op een bord waar jij het op zet.

   De lijst van jouw en gedeelde geluiden wordt bewaard, zodat hij er ook
   zonder netwerk is (bfss:bieb).
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var Cloud = global.Cloud;
  var BIEB = 'bfss:bieb';

  function lees(k) {
    try { var r = global.localStorage.getItem(k); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function schrijf(k, v) {
    try { global.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  /** Een geluid uit de database zoals de app het gebruikt: met de url
      waar het bestand staat. */
  function def(raw) {
    var d = {};
    Object.keys(raw || {}).forEach(function (k) { d[k] = raw[k]; });
    if (d.path) d.url = Cloud.url(d.path);
    d.online = true;
    return d;
  }

  var Library = {
    /** De standaardgeluiden van de site. */
    builtin: ((global.SOUNDS && global.SOUNDS.sounds) || []).map(function (d) {
      d.builtin = true;
      return d;
    }),
    list: (lees(BIEB) || []).map(def),
    def: def,

    /** Haalt jouw geluiden en de gedeelde geluiden op. */
    load: function () {
      var self = this;
      if (!Cloud.enabled || !Cloud.ik()) return Promise.resolve(this.list);
      return Cloud.rpc('sb_library', { p_ik: Cloud.ik() }).then(function (lijst) {
        self.list = (lijst || []).map(def);
        schrijf(BIEB, self.list);
        return self.list;
      });
    },

    mine: function () { return this.list.filter(function (d) { return d.mine; }); },
    shared: function () { return this.list.filter(function (d) { return !d.mine && d.shared; }); },

    /** Alle geluiden die er zijn, met die van een bord erbij. Staat een
        geluid op meerdere plekken, dan wint het bord, daarna de online
        bibliotheek, daarna de site. */
    all: function (boardDefs) {
      var byId = {}, volgorde = [];
      function voeg(d) {
        if (!d || !d.id) return;
        if (!byId[d.id]) volgorde.push(d.id);
        byId[d.id] = d;
      }
      this.builtin.forEach(voeg);
      this.list.forEach(voeg);
      (boardDefs || []).forEach(function (d) { voeg(d.online || !d.path ? d : def(d)); });
      return volgorde.map(function (id) { return byId[id]; });
    },

    /** Een nieuw of bijgewerkt geluid meteen in de lijst zetten. */
    remember: function (d) {
      d = d.url ? d : def(d);
      var zonderGolf = {};
      Object.keys(d).forEach(function (k) { if (k !== 'peaks') zonderGolf[k] = d[k]; });
      var i = -1;
      this.list.forEach(function (x, j) { if (x.id === d.id) i = j; });
      if (i >= 0) this.list[i] = zonderGolf; else this.list.unshift(zonderGolf);
      schrijf(BIEB, this.list);
    },

    forget: function (id) {
      this.list = this.list.filter(function (d) { return d.id !== id; });
      schrijf(BIEB, this.list);
    },

    clear: function () {
      this.list = [];
      try { global.localStorage.removeItem(BIEB); } catch (e) {}
    }
  };

  global.Library = Library;
})(window);
