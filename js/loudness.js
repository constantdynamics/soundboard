/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — luidheid meten in de browser
   Precies wat tools/analyze_loudness.py doet, maar dan hier, zodat een
   geüpload geluid net zo hard klinkt als de rest:

   - integrale luidheid volgens EBU R128 / ITU-R BS.1770-4: K-weging,
     blokken van 400 ms met 75% overlap, absolute poort op -70 LUFS en
     een relatieve poort 10 LU onder het gemiddelde (zoals pyloudnorm)
   - de correctie naar -16 LUFS, begrensd op +/-24 dB
   - een piekplafond van +3 dBFS, gemeten op het 99,9e percentiel van
     de golfvorm, zodat één losse tik de correctie niet blokkeert

   Werkt op kale Float32Arrays (één per kanaal), dus ook in Node te testen.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var DOEL = -16, MAX_BIJ = 24, MAX_AF = 24, PLAFOND = 3, PERCENTIEL = 99.9;

  /** De coëfficiënten van een biquad, zoals pyloudnorm ze uitrekent. */
  function biquad(G, Q, fc, rate, soort) {
    var A = Math.pow(10, G / 40), w0 = 2 * Math.PI * (fc / rate);
    var alpha = Math.sin(w0) / (2 * Q), cos = Math.cos(w0), sA = Math.sqrt(A);
    var b0, b1, b2, a0, a1, a2;
    if (soort === 'high_shelf') {
      b0 = A * ((A + 1) + (A - 1) * cos + 2 * sA * alpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cos);
      b2 = A * ((A + 1) + (A - 1) * cos - 2 * sA * alpha);
      a0 = (A + 1) - (A - 1) * cos + 2 * sA * alpha;
      a1 = 2 * ((A - 1) - (A + 1) * cos);
      a2 = (A + 1) - (A - 1) * cos - 2 * sA * alpha;
    } else {                              // high_pass
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  /** Stuurt een kanaal door een biquad (direct form I). */
  function filter(x, c) {
    var y = new Float32Array(x.length);
    var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < x.length; i++) {
      var v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
    return y;
  }

  /** Integrale luidheid in LUFS, of -Infinity voor stilte. */
  function integrated(kanalen, rate) {
    var n = kanalen[0].length;
    var T = n / rate, Tg = 0.4, stap = 0.25;
    // korter dan één blok: dan telt het geheel als één blok
    var blokken = T < Tg ? 1 : Math.round((T - Tg) / (Tg * stap)) + 1;
    var gewichten = [1, 1, 1, 1.41, 1.41];
    var hs = biquad(4.0, 1 / Math.sqrt(2), 1500, rate, 'high_shelf');
    var hp = biquad(0.0, 0.5, 38, rate, 'high_pass');

    var z = kanalen.map(function (x) {
      var k = filter(filter(x, hs), hp);
      var per = new Float64Array(blokken);
      for (var j = 0; j < blokken; j++) {
        var l = T < Tg ? 0 : Math.floor(Tg * (j * stap) * rate);
        var u = T < Tg ? n : Math.floor(Tg * (j * stap + 1) * rate);
        var som = 0;
        for (var i = l; i < u && i < n; i++) som += k[i] * k[i];
        per[j] = som / (T < Tg ? n : Tg * rate);
      }
      return per;
    });

    function luid(j) {
      var s = 0;
      for (var c = 0; c < z.length; c++) s += (gewichten[c] || 1) * z[c][j];
      return -0.691 + 10 * Math.log10(s);
    }
    function gemiddeld(poort) {
      var s = 0, telt = 0;
      var som = z.map(function () { return 0; });
      for (var j = 0; j < blokken; j++) {
        if (!poort(j)) continue;
        telt++;
        for (var c = 0; c < z.length; c++) som[c] += z[c][j];
      }
      if (!telt) return -Infinity;
      for (var c2 = 0; c2 < z.length; c2++) s += (gewichten[c2] || 1) * (som[c2] / telt);
      return -0.691 + 10 * Math.log10(s);
    }

    var l = [];
    for (var j = 0; j < blokken; j++) l.push(luid(j));
    var relatief = gemiddeld(function (j) { return l[j] >= -70; }) - 10;
    return gemiddeld(function (j) { return l[j] > relatief && l[j] > -70; });
  }

  /** Het 99,9e percentiel van de hoogste waarde per sample (over de
      kanalen), met een fijne verdeling in plaats van alles te sorteren. */
  function werkPiek(kanalen) {
    var n = kanalen[0].length, BAKJES = 20000, MAX = 2;
    var tel = new Uint32Array(BAKJES + 1);
    for (var i = 0; i < n; i++) {
      var m = 0;
      for (var c = 0; c < kanalen.length; c++) {
        var v = kanalen[c][i]; if (v < 0) v = -v; if (v > m) m = v;
      }
      tel[Math.min(BAKJES, Math.floor(m / MAX * BAKJES))]++;
    }
    var grens = n * PERCENTIEL / 100, som = 0;
    for (var b = 0; b <= BAKJES; b++) {
      som += tel[b];
      if (som >= grens) return (b + 0.5) / BAKJES * MAX;
    }
    return MAX;
  }

  function piek(kanalen) {
    var m = 0;
    kanalen.forEach(function (x) {
      for (var i = 0; i < x.length; i++) { var v = x[i] < 0 ? -x[i] : x[i]; if (v > m) m = v; }
    });
    return m;
  }

  /** Meet een geluid en geeft de correctie terug zoals het manifest die
      kent (gainDb), met de meetwaarden erbij. */
  function measure(kanalen, rate) {
    var lufs = integrated(kanalen, rate);
    var wp = werkPiek(kanalen);
    var werkPiekDb = wp > 0 ? 20 * Math.log10(wp) : -120;
    var gain;
    if (!isFinite(lufs)) {
      gain = 0;                                   // volledig stil
    } else {
      gain = Math.max(-MAX_AF, Math.min(MAX_BIJ, DOEL - lufs));
      gain = Math.min(gain, PLAFOND - werkPiekDb);  // nooit voorbij het plafond
    }
    var p = piek(kanalen);
    return {
      lufs: isFinite(lufs) ? Math.round(lufs * 100) / 100 : null,
      peakDb: p > 0 ? Math.round(20 * Math.log10(p) * 100) / 100 : -120,
      workPeakDb: Math.round(werkPiekDb * 100) / 100,
      gainDb: Math.round(gain * 100) / 100
    };
  }

  /** De golfvorm die de app tekent: hoogste waarde per vak, 0-100. */
  function peaks(kanalen, punten) {
    punten = punten || 240;
    var n = kanalen[0].length, uit = [], top = 0, i, c;
    for (var p = 0; p < punten; p++) {
      // zoals numpy.array_split: de eerste vakken een sample langer
      var basis = Math.floor(n / punten), rest = n % punten;
      var van = p * basis + Math.min(p, rest);
      var tot = van + basis + (p < rest ? 1 : 0);
      var m = 0;
      for (i = van; i < tot; i++) {
        for (c = 0; c < kanalen.length; c++) {
          var v = kanalen[c][i]; if (v < 0) v = -v; if (v > m) m = v;
        }
      }
      uit.push(m);
      if (m > top) top = m;
    }
    top = top || 1;
    return uit.map(function (v) { return Math.round(v / top * 100); });
  }

  var Loudness = { measure: measure, integrated: integrated, peaks: peaks, TARGET: DOEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = Loudness;
  else global.Loudness = Loudness;
})(typeof window !== 'undefined' ? window : this);
