/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — mp3 maken, op de achtergrond
   Krijgt de samples van een geluid (één Float32Array per kanaal) en
   geeft een mp3 terug. Draait als worker, zodat het scherm blijft
   reageren terwijl een nummer van drie minuten wordt omgezet.
   De encoder is lamejs (LGPL, zie js/vendor/README.md).
   ------------------------------------------------------------------ */
/* global lamejs */
importScripts('vendor/lame.min.js');

function naarInt(bron, van, n, doel) {
  for (var i = 0; i < n; i++) {
    var v = bron[van + i];
    v = v > 1 ? 1 : (v < -1 ? -1 : v);
    doel[i] = v < 0 ? v * 32768 : v * 32767;
  }
}

self.onmessage = function (e) {
  var d = e.data;
  try {
    var kanalen = d.kanalen, ch = Math.min(2, kanalen.length), n = kanalen[0].length;
    var enc = new lamejs.Mp3Encoder(ch, d.rate, d.kbps);
    var BLOK = 1152 * 24, delen = [], stap = 0;
    var l = new Int16Array(BLOK), r = ch > 1 ? new Int16Array(BLOK) : null;
    for (var i = 0; i < n; i += BLOK) {
      var m = Math.min(BLOK, n - i);
      naarInt(kanalen[0], i, m, l);
      if (r) naarInt(kanalen[1], i, m, r);
      var uit = enc.encodeBuffer(l.subarray(0, m), r ? r.subarray(0, m) : undefined);
      if (uit.length) delen.push(new Uint8Array(uit.buffer, uit.byteOffset, uit.length).slice());
      if (++stap % 8 === 0) self.postMessage({ voortgang: (i + m) / n });
    }
    var eind = enc.flush();
    if (eind.length) delen.push(new Uint8Array(eind.buffer, eind.byteOffset, eind.length).slice());
    self.postMessage({ klaar: true, blob: new Blob(delen, { type: 'audio/mpeg' }) });
  } catch (err) {
    self.postMessage({ fout: String((err && err.message) || err) });
  }
};
