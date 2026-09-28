/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — verbinding met de online opslag
   Gewone fetch-aanroepen naar Supabase: de functies (rpc) en de opslag
   voor de geluiden. Geen bibliotheek nodig. Plus wie je bent: de
   persoonlijke sleutel, die alleen in deze browser staat.

   Niets hier mag het bord laten vastlopen. Elke aanroep heeft een
   tijdslimiet, en zonder netwerk werkt de app gewoon door met wat er op
   het toestel bewaard is.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var C = global.SB_CONFIG || null;
  var IK = 'bfss:ik';

  function fout(tekst, extra) {
    var e = new Error(tekst);
    Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  function lees(k) {
    try { var r = global.localStorage.getItem(k); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function schrijf(k, v) {
    try { global.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  var Cloud = {
    /* In een noodpakket bestaat er geen online: alles zit erin. */
    enabled: !!(C && C.url && C.key && !global.NOODPAKKET),
    me: null,           // { secret, name, admin, id }

    headers: function (extra) {
      var h = { apikey: C.key };
      // een oude (JWT-)sleutel moet er ook als Authorization bij
      if (/^eyJ/.test(C.key)) h.Authorization = 'Bearer ' + C.key;
      Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
      return h;
    },

    /** Roept een functie in de database aan. Geeft een belofte met het
        antwoord; bij een fout een Error met .status (403 = geen toegang,
        404 = bestaat niet (meer), 0 = geen verbinding). */
    rpc: function (naam, args, ms) {
      if (!this.enabled) return Promise.reject(fout('Online opslag is hier uit.', { status: 0, offline: true }));
      var ctl = global.AbortController ? new AbortController() : null;
      var klok = ctl ? setTimeout(function () { ctl.abort(); }, ms || 12000) : null;
      return fetch(C.url + '/rest/v1/rpc/' + naam, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(args || {}),
        signal: ctl ? ctl.signal : undefined,
        cache: 'no-store'
      }).then(function (r) {
        if (klok) clearTimeout(klok);
        return r.text().then(function (t) {
          var j = null;
          try { j = t ? JSON.parse(t) : null; } catch (e) {}
          if (r.ok) return j;
          var tekst = (j && j.message) || ('De online opslag gaf een fout (' + r.status + ').');
          // een slapend of overbelast project: dat is geen fout van jou
          if (r.status >= 500) tekst = 'De online opslag is even niet bereikbaar.';
          throw fout(tekst, { status: r.status, code: j && j.code });
        });
      }, function (err) {
        if (klok) clearTimeout(klok);
        throw fout('Geen verbinding met de online opslag.', { status: 0, offline: true, cause: err });
      });
    },

    /** Waar een bestand uit de opslag te halen is. */
    url: function (pad) {
      return C.url + '/storage/v1/object/public/' + C.bucket + '/' +
        String(pad).split('/').map(encodeURIComponent).join('/');
    },

    /** Zet een bestand in de opslag, op een plek die vooraf is vrijgegeven.
        Met voortgang, want een nummer van drie minuten op een trage
        verbinding duurt even. */
    upload: function (pad, blob, type, onprogress) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var x = new XMLHttpRequest();
        x.open('POST', C.url + '/storage/v1/object/' + C.bucket + '/' + pad);
        var h = self.headers({ 'Content-Type': type, 'x-upsert': 'false', 'Cache-Control': 'max-age=31536000' });
        Object.keys(h).forEach(function (k) { x.setRequestHeader(k, h[k]); });
        if (x.upload && onprogress) {
          x.upload.onprogress = function (e) { if (e.lengthComputable) onprogress(e.loaded / e.total); };
        }
        x.onload = function () {
          if (x.status >= 200 && x.status < 300) { resolve(); return; }
          var j = null;
          try { j = JSON.parse(x.responseText); } catch (e) {}
          reject(fout('Uploaden mislukt: ' + ((j && (j.message || j.error)) || x.status), { status: x.status }));
        };
        x.onerror = function () { reject(fout('Uploaden mislukt: geen verbinding.', { status: 0, offline: true })); };
        x.ontimeout = x.onerror;
        x.timeout = 10 * 60 * 1000;
        x.send(blob);
      });
    },

    /** Haalt een bestand weg (mag alleen als het geluid verwijderd is en
        nergens meer op staat; dat controleert de opslag zelf). */
    remove: function (pad) {
      return fetch(C.url + '/storage/v1/object/' + C.bucket + '/' + pad, {
        method: 'DELETE', headers: this.headers()
      }).then(function (r) { return r.ok; }, function () { return false; });
    },

    /* ---- wie ben je ----------------------------------------------- */

    loadMe: function () {
      var m = lees(IK);
      this.me = m && m.secret ? m : null;
      return this.me;
    },

    saveMe: function (m) {
      this.me = m;
      schrijf(IK, m);
    },

    /** Deze browser vergeet wie je bent. Je borden blijven online staan;
        met je persoonlijke link krijg je ze terug. */
    forgetMe: function () {
      this.me = null;
      try { global.localStorage.removeItem(IK); } catch (e) {}
    },

    ik: function () { return this.me ? this.me.secret : null; },

    /** De link waarmee je op een ander toestel jezelf bent. */
    link: function () {
      return this.me ? base() + '#ik=' + this.me.secret : '';
    },

    /** Neemt een persoonlijke link over (uit #ik=...). */
    claim: function (secret) {
      var self = this;
      return this.rpc('sb_me', { p_ik: secret }).then(function (m) {
        if (!m) throw fout('Deze persoonlijke link is niet (meer) bekend.', { status: 404 });
        self.saveMe({ secret: secret, name: m.name, admin: !!m.admin, id: m.id,
                      quotaMb: m.quotaMb, usedBytes: m.usedBytes });
        return self.me;
      });
    },

    /** Werkt naam, beheerder en opslaggebruik bij. */
    refreshMe: function () {
      var self = this;
      if (!this.me) return Promise.resolve(null);
      return this.rpc('sb_me', { p_ik: this.me.secret }).then(function (m) {
        if (!m) return null;         // niet vergeten: misschien even een fout
        var nu = self.me;
        nu.name = m.name; nu.admin = !!m.admin; nu.id = m.id;
        nu.quotaMb = m.quotaMb; nu.usedBytes = m.usedBytes;
        self.saveMe(nu);
        return nu;
      });
    },

    /** Meedoen met een uitnodiging (uit #uitnodiging=...). */
    join: function (code, naam) {
      var self = this;
      return this.rpc('sb_join', { p_code: code, p_name: naam }).then(function (r) {
        self.saveMe({ secret: r.secret, name: r.name, admin: !!r.admin, id: r.id });
        return self.me;
      });
    },

    rename: function (naam) {
      var self = this;
      return this.rpc('sb_rename_me', { p_ik: this.ik(), p_name: naam }).then(function (m) {
        if (m && self.me) { self.me.name = m.name; self.saveMe(self.me); }
        return self.me;
      });
    },

    base: base
  };

  /** Het adres van de app zelf, zonder #... erachter. */
  function base() {
    return global.location.origin + global.location.pathname.replace(/index\.html$/, '');
  }

  Cloud.loadMe();
  global.Cloud = Cloud;
})(window);
