/* ------------------------------------------------------------------
   THE BIG FAT SPEECH SOUNDBOARD — interface
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var S = global.Settings, E = global.AudioEngine, ICONS = global.ICONS;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hexToRgb(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return '255, 255, 255';
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ');
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Hoe lang je een knop moet vasthouden om hem te bewerken. */
  var HOLD_MS = 450;

  /** Lege plekken achteraan hebben geen zin; die halen we weg. */
  function trimTail(order) {
    var i = order.length;
    while (i > 0 && !order[i - 1]) i--;
    return order.slice(0, i);
  }

  var FADE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3.5 9.4h3L11 5.4v13.2l-4.5-4h-3z" fill="currentColor" stroke="none"/>' +
    '<path d="M16.5 8.4v7M13.8 12.6l2.7 2.8 2.7-2.8"/></svg>';

  var PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M16.5 3.9a2.3 2.3 0 0 1 3.3 3.3L8.4 18.6l-4.3 1 1-4.3z"/></svg>';

  /* ================================================================
     Timer
     ================================================================ */
  var Timer = {
    running: false, elapsed: 0, startedAt: 0, autoStarted: false,

    value: function () {
      return this.running ? this.elapsed + (Date.now() - this.startedAt) / 1000 : this.elapsed;
    },
    start: function () {
      if (this.running) return;
      this.running = true; this.startedAt = Date.now();
      UI.wake();
    },
    pause: function () {
      if (!this.running) return;
      this.elapsed = this.value(); this.running = false;
    },
    toggle: function () { this.running ? this.pause() : this.start(); UI.paintTimer(); },
    reset: function () {
      this.running = false; this.elapsed = 0; this.autoStarted = false; UI.paintTimer();
    },
    state: function () {
      var t = this.value(), target = S.data.timerTarget || 0;
      if (target > 0 && t > target) return 'over';
      if (target > 0 && t >= target * 0.8 && t > 0) return 'warn';
      if (this.running) return 'running';
      if (t > 0) return 'paused';
      return 'idle';
    }
  };

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    var mm = (h ? String(m).padStart(2, '0') : String(m).padStart(2, '0'));
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  /* ================================================================
     UI
     ================================================================ */
  var UI = {
    defs: [],          // manifest zoals ingeladen
    byId: {},
    editing: false,
    looping: false,
    Timer: Timer,

    init: function (defs) {
      var self = this;
      this.manifest = defs;
      // kopieën staan in de instellingen, niet in het manifest
      var clones = (S.data.clones || []).filter(function (c) {
        return c && c.id && c.file && defs.some(function (d) { return d.file === c.file; });
      });
      S.data.clones = clones;
      this.defs = defs.concat(clones);
      this.byId = {};
      this.defs.forEach(function (d) { self.byId[d.id] = d; });

      // De volgorde is een rooster van plekken: elke plek bevat een geluid
      // of is leeg (null). Onbekende of dubbele namen worden een lege plek,
      // zodat de indeling heel blijft als er een geluid verdwijnt.
      var archived = (S.data.archived || []).filter(function (id) { return self.byId[id]; });
      S.data.archived = archived;
      var seen = {};
      archived.forEach(function (id) { seen[id] = 1; });
      var order = (S.data.order || []).map(function (id) {
        if (id && self.byId[id] && !seen[id]) { seen[id] = 1; return id; }
        return null;
      });
      defs.forEach(function (d) { if (!seen[d.id]) { order.push(d.id); seen[d.id] = 1; } });
      S.data.order = trimTail(order);

      Object.keys(S.data.sounds).forEach(function (sid) {
        if (self.byId[sid]) self.pushEdit(sid);
      });

      this.bindChrome();
      this.applyTheme();
      this.renderBoard();
      this.paintTimer();
    },

    /* ---- samengestelde definitie (manifest + eigen aanpassingen) -- */
    get: function (id) {
      var base = this.byId[id] || {}, over = S.data.sounds[id] || {};
      var idx = Math.max(0, S.data.order.indexOf(id));   // plek in het rooster
      var pal = S.find(S.PALETTES, S.data.palette).colors;
      return {
        id: id,
        file: base.file,
        label: over.label !== undefined ? over.label : (base.label || id),
        icon: over.icon || base.icon || 'wave',
        color: over.color || pal[idx % pal.length] || base.color || '#ff2d95',
        trimDb: over.trimDb || 0,
        gainDb: base.gainDb || 0,
        duration: base.duration || 0
      };
    },

    ordered: function () {
      var self = this;
      return S.data.order.filter(Boolean).map(function (id) { return self.get(id); });
    },

    /** Hoeveel kolommen staan er nu echt? */
    columnCount: function () {
      if (S.data.columns !== 'auto') return parseInt(S.data.columns, 10) || 1;
      var t = getComputedStyle($('board')).gridTemplateColumns || '';
      var n = t.split(/\s+/).filter(function (x) { return x && x !== 'none'; }).length;
      return Math.max(1, n);
    },

    /* ---- thema ---------------------------------------------------- */
    applyTheme: function () {
      var d = S.data, root = document.documentElement.style;
      var font = S.find(S.FONTS, d.font);
      var size = S.find(S.SIZES, d.size);
      var pal = S.find(S.PALETTES, d.palette);

      root.setProperty('--font-stack', font.stack);
      root.setProperty('--font-weight', font.weight);
      root.setProperty('--font-spacing', font.spacing);
      root.setProperty('--font-scale', d.fontScale);
      root.setProperty('--pad-size', Math.round(size.pad * (0.85 + d.fontScale * 0.15)) + 'px');
      root.setProperty('--icon-size', Math.round(size.icon) + 'px');
      root.setProperty('--label-size', size.label + 'px');
      root.setProperty('--pad-border', d.border + 'px');
      root.setProperty('--pad-radius', (d.radius >= 999 ? 50 : d.radius) + (d.radius >= 999 ? '%' : 'px'));
      root.setProperty('--gap', d.gap + 'px');
      root.setProperty('--edge', Math.max(12, d.gap) + 'px');
      root.setProperty('--neon-a', pal.colors[0]);
      root.setProperty('--neon-a-rgb', hexToRgb(pal.colors[0]));
      root.setProperty('--neon-b', pal.colors[1] || pal.colors[0]);
      root.setProperty('--neon-b-rgb', hexToRgb(pal.colors[1] || pal.colors[0]));

      var board = $('board');
      board.dataset.fill = d.fill || 'neon';
      board.className = 'board' + (d.columns !== 'auto' ? ' cols-' + d.columns : '') +
        (d.showLabels ? '' : ' no-labels') + (this.editing ? ' is-editing' : '');

      var mv = $('master-vol');
      if (mv && String(mv.value) !== String(d.masterVolume)) mv.value = d.masterVolume;
      E.setMaster(d.masterVolume);
      E.setDuck(d.duck);
    },

    /* ---- knoppenraster -------------------------------------------- */
    renderBoard: function () {
      var board = $('board'), self = this;
      var order = S.data.order;
      board.innerHTML = '';
      $('board-empty').hidden = order.filter(Boolean).length > 0;

      order.forEach(function (id, i) {
        board.appendChild(id ? self.padEl(self.get(id), i) : self.slotEl(i));
      });
      this.applyTheme();

      // In de bewerkmodus komt er ruimte bij om naartoe te slepen: de
      // huidige rij afmaken plus een hele lege rij eronder.
      if (this.editing) {
        var cols = this.columnCount(), n = order.length;
        var extra = (n % cols ? cols - (n % cols) : 0) + cols;
        for (var k = 0; k < extra; k++) board.appendChild(this.slotEl(n + k));
      }
    },

    /** Een lege plek in het rooster. */
    slotEl: function (index) {
      var slot = el('div', 'pad-slot', '<span class="pad-slot-box"></span>');
      slot.dataset.slot = index;
      return slot;
    },

    padEl: function (d, index) {
      var wrap = el('div', 'pad-wrap');
      wrap.dataset.id = d.id;
      if (index !== undefined) wrap.dataset.slot = index;
      wrap.style.setProperty('--c', d.color);
      wrap.style.setProperty('--c-rgb', hexToRgb(d.color));

      var pad = el('button', 'pad');
      pad.type = 'button';
      pad.setAttribute('aria-label', d.label);
      pad.innerHTML = ICONS.svg(d.icon) +
        '<span class="pad-hold"></span>' +
        '<span class="pad-prog"></span><span class="pad-voices">1</span>';

      var fade = el('button', 'pad-fade', FADE_SVG);
      fade.type = 'button';
      fade.setAttribute('aria-label', 'Uitfaden: ' + d.label);
      fade.title = 'Uitfaden';

      var badge = el('span', 'pad-edit-badge', PENCIL_SVG);

      var label = el('div', 'pad-label', esc(d.label));

      wrap.appendChild(pad);
      wrap.appendChild(fade);
      wrap.appendChild(badge);
      wrap.appendChild(label);

      this.bindPad(wrap, pad, fade);
      return wrap;
    },

    bindPad: function (wrap, pad, fade) {
      var self = this, id = wrap.dataset.id;
      var holdTimer = null, held = false;

      fade.addEventListener('click', function (ev) {
        ev.stopPropagation();
        E.fade(id, S.data.fade);
      });

      function stopHold() {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        pad.classList.remove('is-holding');
      }

      pad.addEventListener('click', function () {
        if (self.editing) return;        // in bewerkmodus doet slepen/tikken iets anders
        if (held) { held = false; return; }   // dit was een lange druk, niet afspelen
        self.trigger(id, pad);
      });

      pad.addEventListener('pointerdown', function (ev) {
        if (ev.button > 0) return;
        if (self.editing) { self.startDrag(ev, wrap, pad); return; }

        // Lang ingedrukt houden opent het bewerkscherm, ook met het slotje dicht.
        held = false;
        var x0 = ev.clientX, y0 = ev.clientY;
        pad.classList.add('is-holding');
        holdTimer = setTimeout(function () {
          holdTimer = null;
          held = true;
          pad.classList.remove('is-holding');
          self.openPadSheet(id);
        }, HOLD_MS);

        function moved(e) {
          if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 12) stopHold();
        }
        function done() {
          stopHold();
          pad.removeEventListener('pointermove', moved);
          pad.removeEventListener('pointerup', done);
          pad.removeEventListener('pointercancel', done);
          pad.removeEventListener('pointerleave', done);
        }
        pad.addEventListener('pointermove', moved);
        pad.addEventListener('pointerup', done);
        pad.addEventListener('pointercancel', done);
        pad.addEventListener('pointerleave', done);
      });

      // Geen vergrootglas of snelmenu bij lang indrukken.
      pad.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    },

    trigger: function (id, pad) {
      var v = E.play(id);
      if (!v) return;
      if (E.streams[id]) this.npDismissed = false;
      pad.classList.remove('hit');
      void pad.offsetWidth;
      pad.classList.add('hit');
      if (!Timer.running && !Timer.autoStarted && Timer.elapsed === 0) {
        Timer.autoStarted = true;
        Timer.start();                            // timer loopt mee vanaf het eerste geluid
      }
      this.wake();
    },

    /* ---- slepen om te herschikken --------------------------------- */
    /* Loslaten op een lege plek verhuist de knop daarheen en laat een gat
       achter; loslaten op een andere knop wisselt de twee om. */
    startDrag: function (ev, wrap, pad) {
      var self = this;
      var startX = ev.clientX, startY = ev.clientY;
      var moved = false, target = null, overTrash = false;
      var trash = $('trash');

      function highlight(next) {
        if (target === next) return;
        if (target) target.classList.remove('is-drop-target');
        target = next;
        if (target) target.classList.add('is-drop-target');
      }

      function move(e) {
        if (!moved && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 9) return;
        if (!moved) { moved = true; wrap.classList.add('dragging'); trash.hidden = false; }
        wrap.style.transform = 'translate(' + (e.clientX - startX) + 'px,' +
          (e.clientY - startY) + 'px)';

        var t = trash.getBoundingClientRect();
        overTrash = e.clientX >= t.left - 20 && e.clientX <= t.right + 20 &&
                    e.clientY >= t.top - 20 && e.clientY <= t.bottom + 20;
        trash.classList.toggle('is-over', overTrash);
        highlight(overTrash ? null : self.slotUnder(e.clientX, e.clientY, wrap));
      }

      function up() {
        pad.removeEventListener('pointermove', move);
        pad.removeEventListener('pointerup', up);
        pad.removeEventListener('pointercancel', up);
        wrap.classList.remove('dragging');
        wrap.style.transform = '';
        trash.hidden = true;
        trash.classList.remove('is-over');
        var drop = target;
        highlight(null);

        if (!moved) {
          self.openPadSheet(wrap.dataset.id);      // tik = knop bewerken
        } else if (overTrash) {
          self.archive(wrap.dataset.id);
        } else if (drop) {
          self.moveToSlot(parseInt(wrap.dataset.slot, 10), parseInt(drop.dataset.slot, 10));
        }
      }

      try { pad.setPointerCapture(ev.pointerId); } catch (e) {}
      pad.addEventListener('pointermove', move);
      pad.addEventListener('pointerup', up);
      pad.addEventListener('pointercancel', up);
    },

    /** De plek (vol of leeg) onder de vinger, de gesleepte knop niet meegeteld. */
    slotUnder: function (x, y, skip) {
      var cells = document.querySelectorAll('#board .pad-wrap, #board .pad-slot');
      var best = null, bestD = Infinity;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (c === skip || c.dataset.slot === undefined) continue;
        var r = c.getBoundingClientRect();
        if (x < r.left - 10 || x > r.right + 10 || y < r.top - 10 || y > r.bottom + 10) continue;
        var d = Math.abs(x - (r.left + r.width / 2)) + Math.abs(y - (r.top + r.height / 2));
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    },

    /** Maakt een tweede knop op hetzelfde geluid. */
    cloneSound: function (id) {
      var self = this;
      var bron = this.byId[id];
      if (!bron) return;
      var basis = bron.file.replace(/\.[a-z0-9]+$/i, '');
      var n = 2, nieuwId;
      do { nieuwId = basis + '--' + n; n++; } while (this.byId[nieuwId]);

      var kopie = {
        id: nieuwId, file: bron.file,
        label: (this.get(id).label + ' ' + (n - 1)).slice(0, 40),
        icon: this.get(id).icon, color: this.get(id).color,
        gainDb: bron.gainDb, duration: bron.duration,
        peaks: bron.peaks, hash: bron.hash
        // bewust geen stream: een fragment hoort direct te klinken
      };
      S.data.clones.push(kopie);
      this.byId[nieuwId] = kopie;
      this.defs.push(kopie);

      var plek = S.data.order.indexOf(id);
      if (plek >= 0) S.data.order.splice(plek + 1, 0, nieuwId);
      else S.data.order.push(nieuwId);
      S.save();
      this.renderBoard();

      E.loadOne(kopie).then(function () {
        self.pushEdit(nieuwId);
        self.openPadSheet(nieuwId);
      });
    },

    /** Haalt een kopie helemaal weg (het oorspronkelijke geluid blijft). */
    removeClone: function (id) {
      if (!global.confirm('Deze kopie weghalen? Het geluid zelf blijft staan.')) return;
      E.dropSound(id);
      S.data.clones = (S.data.clones || []).filter(function (c) { return c.id !== id; });
      var i = S.data.order.indexOf(id);
      if (i >= 0) S.data.order[i] = null;
      S.data.order = trimTail(S.data.order);
      var k = (S.data.archived || []).indexOf(id);
      if (k >= 0) S.data.archived.splice(k, 1);
      delete S.data.sounds[id];
      delete this.byId[id];
      this.defs = this.defs.filter(function (d) { return d.id !== id; });
      S.save();
      this.closeSheets();
      this.renderBoard();
    },

    /** Haalt een knop van het bord en bewaart hem in het archief. */
    archive: function (id) {
      E.fade(id, 0.25);
      var i = S.data.order.indexOf(id);
      if (i >= 0) S.data.order[i] = null;          // laat zijn plek open
      S.data.order = trimTail(S.data.order);
      if (S.data.archived.indexOf(id) < 0) S.data.archived.push(id);
      S.save();
      this.closeSheets();
      this.renderBoard();
    },

    /** Zet een gearchiveerde knop terug, op de eerste vrije plek. */
    unarchive: function (id) {
      var k = S.data.archived.indexOf(id);
      if (k >= 0) S.data.archived.splice(k, 1);
      var slot = S.data.order.indexOf(null);
      if (slot >= 0) S.data.order[slot] = id;
      else S.data.order.push(id);
      S.save();
      this.renderBoard();
    },

    /** Schuift een lege plek in het rooster op deze positie. */
    insertGap: function (at) {
      var o = S.data.order.slice();
      at = clamp(at, 0, o.length);
      o.splice(at, 0, null);
      S.data.order = trimTail(o);
      S.save();
      this.renderBoard();
    },

    /** Verhuist de knop van de ene plek naar de andere. */
    moveToSlot: function (from, to) {
      if (isNaN(from) || isNaN(to) || from === to) return;
      var o = S.data.order;
      while (o.length <= to) o.push(null);
      var moving = o[from];
      if (!moving) return;
      o[from] = o[to] || null;      // bezet: omwisselen. leeg: gat achterlaten.
      o[to] = moving;
      S.data.order = trimTail(o);
      S.save();
      this.renderBoard();
    },

    /* ---- beeldverversing ------------------------------------------ */
    wake: function () {
      if (this.looping) return;
      this.looping = true;
      var self = this, last = 0;
      (function loop(ts) {
        if (!self.looping) return;
        if (ts - last > 66) { last = ts; self.paint(); }
        if (E.anyPlaying() || Timer.running) requestAnimationFrame(loop);
        else { self.looping = false; self.paint(); }
      })(0);
    },

    paint: function () {
      var wraps = document.querySelectorAll('#board .pad-wrap');
      for (var i = 0; i < wraps.length; i++) {
        var w = wraps[i], id = w.dataset.id;
        var n = E.voiceCount(id), playing = n > 0;
        w.classList.toggle('is-playing', playing);
        w.classList.toggle('is-stacked', n > 1);
        w.classList.toggle('is-ducked', playing && E.isDucked(id));
        if (n > 1) w.querySelector('.pad-voices').textContent = n;
        var prog = w.querySelector('.pad-prog');
        prog.style.width = playing ? (E.progress(id) * 100).toFixed(1) + '%' : '0';
      }
      $('btn-stop').disabled = !E.anyPlaying();
      this.paintNowPlaying();
      this.paintTimer();
    },

    npDismissed: false,
    npScrubbing: false,

    /** De balk met het lopende nummer: alleen voor de lange tracks. */
    paintNowPlaying: function () {
      var bar = $('nowplaying');
      var id = E.currentStream && E.currentStream();
      if (!id || this.npDismissed) {
        bar.hidden = true;
        document.body.classList.remove('has-np');
        return;
      }
      var p = E.streamPos(id);
      var lengte = Math.max(0.01, p.end - p.start);
      var verstreken = Math.max(0, p.at - p.start);

      bar.hidden = false;
      document.body.classList.add('has-np');
      $('np-name').textContent = this.get(id).label;
      $('np-time').textContent = fmt(verstreken) + ' / ' + fmt(lengte);
      $('np-icon').setAttribute('d', p.playing
        ? 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z'      // pauze
        : 'M7 4.5l12 7.5-12 7.5z');                     // afspelen
      if (!this.npScrubbing) {
        $('np-scrub').value = Math.round(verstreken / lengte * 1000);
      }
    },

    bindNowPlaying: function () {
      var self = this;
      var scrub = $('np-scrub');

      $('np-play').addEventListener('click', function () {
        var id = E.currentStream();
        if (!id) return;
        if (E.streamPos(id).playing) E.pauseStream(id);
        else E.resumeStream(id);
        self.wake(); self.paint();
      });

      function spring(delta) {
        var id = E.currentStream();
        if (!id) return;
        var p = E.streamPos(id);
        E.seekStream(id, p.at + delta);
        self.paint();
      }
      $('np-back').addEventListener('click', function () { spring(-15); });
      $('np-fwd').addEventListener('click', function () { spring(15); });

      $('np-close').addEventListener('click', function () {
        self.npDismissed = true;
        self.paintNowPlaying();
      });

      ['pointerdown', 'touchstart'].forEach(function (ev) {
        scrub.addEventListener(ev, function () { self.npScrubbing = true; });
      });
      scrub.addEventListener('input', function () {
        var id = E.currentStream();
        if (!id) return;
        var p = E.streamPos(id);
        var t = p.start + (this.value / 1000) * (p.end - p.start);
        E.seekStream(id, t);
        $('np-time').textContent = fmt(Math.max(0, t - p.start)) + ' / ' +
          fmt(Math.max(0.01, p.end - p.start));
      });
      ['pointerup', 'pointercancel', 'touchend', 'change'].forEach(function (ev) {
        scrub.addEventListener(ev, function () { self.npScrubbing = false; });
      });
    },

    paintTimer: function () {
      var t = Timer.value(), target = S.data.timerTarget || 0;
      $('timer-time').textContent = fmt(t);
      $('timer-target').textContent = target ? '/ ' + fmt(target) : 'STOPWATCH';
      var box = $('timer');
      box.dataset.state = Timer.state();
      box.classList.toggle('can-reset', t > 0 || Timer.running);
    },

    /* ---- bediening ------------------------------------------------ */
    bindChrome: function () {
      var self = this;

      $('btn-stop').addEventListener('click', function () {
        E.fadeAll(S.data.fade);
        self.wake();
      });

      $('master-vol').addEventListener('input', function () {
        S.data.masterVolume = parseInt(this.value, 10);
        E.setMaster(S.data.masterVolume);
      });
      $('master-vol').addEventListener('change', function () { S.save(); });

      this.bindNowPlaying();
      $('btn-edit').addEventListener('click', function () { self.toggleEdit(); });
      $('btn-settings').addEventListener('click', function () { self.openSettings(); });

      $('timer-toggle').addEventListener('click', function () { Timer.toggle(); self.wake(); });
      $('timer-reset').addEventListener('click', function () { Timer.reset(); });

      $('scrim').addEventListener('click', function () { self.closeSheets(); });
      $('settings-close').addEventListener('click', function () { self.closeSheets(); });
      $('pad-close').addEventListener('click', function () { self.closeSheets(); });
      $('icon-close').addEventListener('click', function () { self.closeSheets(); });

      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') self.closeSheets();
      });
    },

    toggleEdit: function (force) {
      this.editing = force === undefined ? !this.editing : force;
      $('btn-edit').setAttribute('aria-pressed', String(this.editing));
      $('btn-edit-label').textContent = this.editing ? 'LOS' : 'VAST';
      $('edit-hint').hidden = !this.editing;
      this.renderBoard();
      if (!this.editing) this.closeSheets();
    },

    /* ---- panelen -------------------------------------------------- */
    openSheet: function (which) {
      ['settings-panel', 'pad-sheet', 'icon-sheet'].forEach(function (n) { $(n).hidden = true; });
      $('scrim').hidden = false;
      $(which).hidden = false;
    },

    closeSheets: function () {
      ['settings-panel', 'pad-sheet', 'icon-sheet'].forEach(function (n) { $(n).hidden = true; });
      $('scrim').hidden = true;
      this.padSheetId = null;
    },

    /* ---- instellingen --------------------------------------------- */
    openSettings: function () {
      this.renderSettings();
      this.openSheet('settings-panel');
    },

    chipRow: function (items, current, onPick, renderer) {
      var row = el('div', 'chips');
      items.forEach(function (it) {
        var b = el('button', 'chip', renderer ? renderer(it) : esc(it.name));
        b.type = 'button';
        b.setAttribute('aria-pressed', String(String(it.id) === String(current)));
        b.addEventListener('click', function () { onPick(it); });
        row.appendChild(b);
      });
      return row;
    },

    field: function (label, valueText, control) {
      var f = el('div', 'field');
      var head = el('div', 'field-label',
        '<span>' + esc(label) + '</span>' +
        (valueText ? '<span class="field-value">' + esc(valueText) + '</span>' : ''));
      f.appendChild(head);
      f.appendChild(control);
      return f;
    },

    renderSettings: function () {
      var self = this, body = $('settings-body'), d = S.data;
      body.innerHTML = '';

      /* offline klaarzetten - staat bovenaan, want dit check je vlak
         voor een speech en niet ergens onderin een lijst */
      this.renderOffline(body);
      this.renderPackage(body);

      /* lettertype */
      body.appendChild(this.field('LETTERTYPE', '', this.chipRow(S.FONTS, d.font, function (it) {
        S.set('font', it.id); self.applyTheme(); self.renderSettings();
      }, function (it) {
        return '<span style="font-family:' + it.stack + '">' + esc(it.name) + '</span>';
      })));

      /* tekstgrootte */
      var scale = el('input');
      scale.type = 'range'; scale.min = '0.7'; scale.max = '1.8'; scale.step = '0.05';
      scale.value = d.fontScale;
      scale.addEventListener('input', function () {
        d.fontScale = parseFloat(this.value);
        self.applyTheme();
        body.querySelector('[data-v="scale"]').textContent = Math.round(d.fontScale * 100) + '%';
      });
      scale.addEventListener('change', function () { S.save(); });
      var scaleField = this.field('TEKSTGROOTTE', Math.round(d.fontScale * 100) + '%', scale);
      scaleField.querySelector('.field-value').dataset.v = 'scale';
      var presetRow = this.chipRow(
        [{ id: 0.8, name: 'S' }, { id: 1, name: 'M' }, { id: 1.25, name: 'L' }, { id: 1.5, name: 'XL' }],
        d.fontScale,
        function (it) { S.set('fontScale', it.id); self.applyTheme(); self.renderSettings(); });
      presetRow.style.marginTop = '8px';
      scaleField.appendChild(presetRow);
      body.appendChild(scaleField);

      /* kleurenpalet */
      body.appendChild(this.field('KLEURENPALET', '', this.chipRow(S.PALETTES, d.palette, function (it) {
        S.data.palette = it.id;
        Object.keys(S.data.sounds).forEach(function (k) { delete S.data.sounds[k].color; });
        S.save(); self.renderBoard(); self.renderSettings();
      }, function (it) {
        var sw = it.colors.slice(0, 5).map(function (c) {
          return '<i style="background:' + c + '"></i>';
        }).join('');
        return '<span class="chip-pal"><span class="swatches">' + sw + '</span>' + esc(it.name) + '</span>';
      })));
      var palHint = el('p', 'hint', 'Een palet zet de kleur van alle knoppen opnieuw. ' +
        'Per knop een eigen kleur kiezen kan daarna via het slotje &rarr; knop aantikken.');
      body.lastChild.appendChild(palHint);

      /* knopstijl */
      body.style.setProperty('--c', S.find(S.PALETTES, d.palette).colors[0]);
      body.style.setProperty('--c-rgb', hexToRgb(S.find(S.PALETTES, d.palette).colors[0]));
      body.appendChild(this.field('KNOPSTIJL', '', this.chipRow(S.FILLS, d.fill, function (it) {
        S.set('fill', it.id); self.applyTheme(); self.renderSettings();
      }, function (it) {
        return '<span class="chip-pal"><span class="fillprev" data-fill="' + it.id +
          '"><i class="fillbox"></i></span>' + esc(it.name) + '</span>';
      })));
      body.lastChild.appendChild(el('p', 'hint',
        'Bepaalt hoe de kleur over de knop wordt verdeeld. De kleur zelf komt uit ' +
        'het palet hierboven, of uit wat je per knop hebt ingesteld.'));

      /* randdikte */
      body.appendChild(this.field('RANDDIKTE', d.border + ' PX',
        this.chipRow(S.BORDERS, d.border, function (it) {
          S.set('border', it.id); self.applyTheme(); self.renderSettings();
        })));

      /* afronding */
      body.appendChild(this.field('AFRONDING', '',
        this.chipRow(S.RADII, d.radius, function (it) {
          S.set('radius', it.id); self.applyTheme(); self.renderSettings();
        })));

      /* tussenruimte */
      body.appendChild(this.field('TUSSENRUIMTE', d.gap + ' PX',
        this.chipRow(S.GAPS, d.gap, function (it) {
          S.set('gap', it.id); self.applyTheme(); self.renderSettings();
        })));
      body.lastChild.appendChild(el('p', 'hint',
        'Geldt voor de ruimte tussen de knoppen en voor de marge langs de rand ' +
        'van het scherm.'));

      /* knopgrootte */
      body.appendChild(this.field('KNOPGROOTTE', '', this.chipRow(S.SIZES, d.size, function (it) {
        S.set('size', it.id); self.applyTheme();  self.renderSettings();
      })));

      /* kolommen */
      body.appendChild(this.field('KOLOMMEN', '', this.chipRow(S.COLUMNS, d.columns, function (it) {
        S.set('columns', it.id); self.applyTheme(); self.renderSettings();
      })));

      /* lege plekken */
      var holes = d.order.filter(function (x) { return !x; }).length;
      var holeRow = el('div', 'row');
      var tidy = el('button', 'btn', 'LEGE PLEKKEN OPRUIMEN');
      tidy.type = 'button';
      tidy.disabled = holes === 0;
      tidy.addEventListener('click', function () {
        S.data.order = d.order.filter(Boolean);
        S.save(); self.renderBoard(); self.renderSettings();
      });
      holeRow.appendChild(tidy);
      body.appendChild(this.field('LEGE PLEKKEN',
        holes === 0 ? 'GEEN' : holes + (holes === 1 ? ' PLEK' : ' PLEKKEN'), holeRow));
      body.lastChild.appendChild(el('p', 'hint',
        'Zet het slotje open en sleep een knop naar een lege plek om gaten in het ' +
        'rooster te maken. Met een vast aantal kolommen blijven die gaten op hun plek; ' +
        'op AUTO schuift het rooster mee met de schermbreedte.'));

      /* labels tonen */
      body.appendChild(this.field('LABELS ONDER DE KNOPPEN', '', this.chipRow(
        [{ id: 'ja', name: 'TONEN' }, { id: 'nee', name: 'VERBERGEN' }],
        d.showLabels ? 'ja' : 'nee',
        function (it) { S.set('showLabels', it.id === 'ja'); self.applyTheme(); self.renderSettings(); })));

      /* ducken */
      body.appendChild(this.field('WEGDRUKKEN', S.find(S.DUCKS, d.duck).name,
        this.chipRow(S.DUCKS, d.duck, function (it) {
          S.set('duck', it.id); E.setDuck(it.id); self.renderSettings();
        }, function (it) {
          return esc(it.name) + (it.id ? ' &middot; &minus;' + it.id + ' dB' : '');
        })));
      body.lastChild.appendChild(el('p', 'hint',
        'Speel je iets terwijl er al geluid loopt, dan zakt het oudere zachtjes ' +
        'weg en komt het terug zodra het nieuwe klaar is. Knoppen die je vlak na ' +
        'elkaar indrukt tellen als één moment, dus een bewuste dubbele aanslag ' +
        'drukt zichzelf niet weg. Een weggedrukte knop dooft op het bord.'));

      /* fade */
      body.appendChild(this.field('UITFADEN', S.find(S.FADES, d.fade).name,
        this.chipRow(S.FADES, d.fade, function (it) {
          S.set('fade', it.id); self.renderSettings();
        }, function (it) { return esc(it.name) + ' &middot; ' + it.id + 's'; })));
      body.lastChild.appendChild(el('p', 'hint',
        'Geldt voor de STOP-knop én voor het fade-knopje dat op een knop verschijnt zodra die speelt.'));

      /* timer */
      body.appendChild(this.field('TIMER — DOELDUUR', '', this.chipRow(S.TIMER_TARGETS, d.timerTarget,
        function (it) { S.set('timerTarget', it.id); self.paintTimer(); self.renderSettings(); })));
      body.lastChild.appendChild(el('p', 'hint',
        'Vanaf 80% van de doelduur wordt de timer geel, daarboven rood. ' +
        'Hij start vanzelf bij het eerste geluid dat je afspeelt.'));

      /* volume */
      var vol = el('input');
      vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.value = d.masterVolume;
      vol.addEventListener('input', function () {
        d.masterVolume = parseInt(this.value, 10);
        E.setMaster(d.masterVolume);
        $('master-vol').value = this.value;
        body.querySelector('[data-v="vol"]').textContent = this.value + '%';
      });
      vol.addEventListener('change', function () { S.save(); });
      var volField = this.field('MASTERVOLUME', d.masterVolume + '%', vol);
      volField.querySelector('.field-value').dataset.v = 'vol';
      body.appendChild(volField);

      /* profiel */
      var row = el('div', 'row');
      var expBtn = el('button', 'btn', 'EXPORTEREN');
      expBtn.type = 'button';
      expBtn.addEventListener('click', function () { self.exportProfile(); });
      var impBtn = el('button', 'btn', 'IMPORTEREN');
      impBtn.type = 'button';
      impBtn.addEventListener('click', function () { self.importProfile(); });
      row.appendChild(expBtn); row.appendChild(impBtn);
      var profField = this.field('PROFIEL', '', row);
      var resetBtn = el('button', 'btn btn--danger', 'ALLES TERUG NAAR STANDAARD');
      resetBtn.type = 'button';
      resetBtn.style.marginTop = '8px';
      resetBtn.addEventListener('click', function () {
        if (!global.confirm('Alle eigen instellingen wissen en terug naar de standaard?')) return;
        S.reset();
        self.init(self.defs);
        self.renderSettings();
      });
      profField.appendChild(resetBtn);
      profField.appendChild(el('p', 'hint',
        'Je instellingen worden automatisch in deze browser bewaard. Exporteren ' +
        'geeft je een klein JSON-bestand met je hele bord erin: als reservekopie, ' +
        'om op een ander apparaat te gebruiken, of om het bord te delen zodat ' +
        'iemand er iets aan kan verbeteren. Wil je het bord mét de geluiden ' +
        'meesturen, gebruik dan het noodpakket hierboven.'));
      body.appendChild(profField);

      /* archief */
      var arch = (S.data.archived || []).filter(function (id) { return self.byId[id]; });
      var archBox = el('div');
      if (!arch.length) {
        archBox.appendChild(el('p', 'hint',
          'Nog niets gearchiveerd. Zet het slotje open en sleep een knop naar de ' +
          'prullenbak onderin, of houd een knop ingedrukt en kies NAAR ARCHIEF.'));
      } else {
        arch.forEach(function (id) {
          var d = self.get(id);
          var row = el('div', 'arch-row');
          row.style.setProperty('--c', d.color);
          row.style.setProperty('--c-rgb', hexToRgb(d.color));
          row.innerHTML = '<span class="arch-ico">' + ICONS.svg(d.icon) + '</span>' +
            '<span class="arch-name">' + esc(d.label) + '</span>';
          var back = el('button', 'btn', 'TERUG');
          back.type = 'button';
          back.style.flex = 'none';
          back.addEventListener('click', function () { self.unarchive(id); self.renderSettings(); });
          row.appendChild(back);
          archBox.appendChild(row);
        });
      }
      body.appendChild(this.field('ARCHIEF',
        arch.length ? arch.length + (arch.length === 1 ? ' KNOP' : ' KNOPPEN') : 'LEEG', archBox));

      /* versie */
      var verRow = el('div', 'row');
      var refresh = el('button', 'btn', 'NIEUWSTE VERSIE OPHALEN');
      refresh.type = 'button';
      refresh.addEventListener('click', function () { self.hardRefresh(); });
      verRow.appendChild(refresh);
      body.appendChild(this.field('VERSIE', global.APP_VERSION || '?', verRow));
      body.lastChild.appendChild(el('p', 'hint',
        'Gooit de opgeslagen bestanden weg en laadt de soundboard opnieuw. ' +
        'Je instellingen blijven staan. De audio wordt daarna opnieuw opgehaald.'));

      /* over */
      body.appendChild(el('p', 'hint',
        'Alle geluiden zijn genormaliseerd op &minus;16 LUFS (EBU R128). ' +
        'Wil je er eentje harder of zachter? Zet het slotje aan en tik de knop aan.'));
    },

    /** Caches en service worker wegdoen en opnieuw laden. */
    hardRefresh: function () {
      var done = [];
      if (global.caches && caches.keys) {
        done.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        done.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }));
      }
      Promise.all(done).catch(function () {}).then(function () {
        global.location.reload();
      });
    },

    /* ---- noodpakket: één bestand met alles erin -------------------- */

    /** Bouwt in de browser één HTML-bestand met de code, de stijl en alle
        audio als data-urls, en biedt het aan om te downloaden. Zo is het
        altijd actueel en hoeft er niets van buitenaf te komen. */
    buildPackage: function (metLange, onStatus) {
      var self = this;
      var bronnen = ['index.html', 'css/style.css', 'js/manifest.js', 'js/icons.js',
                     'js/settings.js', 'js/audio.js', 'js/ui.js', 'js/app.js'];
      // alles waar een knop naar verwijst, inclusief de bronnen van kopieën
      var nodig = {};
      (S.data.clones || []).forEach(function (c) { nodig[c.file] = true; });
      var gezien = {};
      var lijst = this.manifest.filter(function (d) {
        if (gezien[d.file]) return false;
        if (!(metLange || !d.stream || nodig[d.file])) return false;
        gezien[d.file] = true;
        return true;
      });
      var totaal = bronnen.length + lijst.length + 1, klaar = 0;
      function stap(wat) { klaar++; if (onStatus) onStatus(klaar, totaal, wat); }

      function haal(pad) {
        return fetch(pad).then(function (r) {
          if (!r.ok) throw new Error(pad + ': ' + r.status);
          return r.text();
        }).then(function (t) { stap(pad); return t; });
      }

      /** Bakt de letters als data-urls in de stijl in. Ze staan in de map
          fonts/ van de site zelf, dus hier kan niets van buitenaf misgaan. */
      function letters() {
        return fetch('css/fonts.css').then(function (r) {
          if (!r.ok) throw new Error('fonts.css ' + r.status);
          return r.text();
        }).then(function (css) {
          var paden = (css.match(/url\(\.\.\/fonts\/[^)]+\)/g) || []).map(function (u) {
            return u.slice(4, -1);          // 'url(' eraf, ')' eraf
          });
          var keten = Promise.resolve(css);
          paden.forEach(function (rel) {
            keten = keten.then(function (tekst) {
              return fetch(rel.replace('../', '')).then(function (r) {
                if (!r.ok) throw new Error(rel + ' ' + r.status);
                return r.arrayBuffer();
              }).then(function (buf) {
                return tekst.replace(rel, 'data:font/woff2;base64,' + base64(buf));
              });
            });
          });
          return keten;
        }).then(function (css) {
          stap('letters');
          return css;
        }).catch(function (err) {
          console.warn('Letters inbakken lukte niet:', err);
          stap('letters');
          return '';
        });
      }

      function base64(buf) {
        var bytes = new Uint8Array(buf), stukjes = [], grootte = 0x8000;
        for (var i = 0; i < bytes.length; i += grootte) {
          stukjes.push(String.fromCharCode.apply(null, bytes.subarray(i, i + grootte)));
        }
        return btoa(stukjes.join(''));
      }

      return Promise.all(bronnen.map(haal)).then(function (tekst) {
        var map = {};
        bronnen.forEach(function (p, i) { map[p] = tekst[i]; });

        // audio er een voor een bij, zodat een telefoon niet alles tegelijk
        // in het geheugen hoeft te hebben
        var stukken = [];
        var keten = Promise.resolve();
        lijst.forEach(function (d) {
          keten = keten.then(function () {
            return fetch(E.srcFor(d)).then(function (r) {
              if (!r.ok) throw new Error(d.file + ': ' + r.status);
              return r.arrayBuffer();
            }).then(function (buf) {
              var ext = (d.file.split('.').pop() || '').toLowerCase();
              var soort = ext === 'wav' ? 'audio/wav'
                        : ext === 'ogg' ? 'audio/ogg'
                        : (ext === 'm4a' || ext === 'mp4' || ext === 'aac') ? 'audio/mp4'
                        : 'audio/mpeg';
              stukken.push('  ' + JSON.stringify(d.file) +
                           ': "data:' + soort + ';base64,' + base64(buf) + '"');
              stap(d.label);
            });
          });
        });

        return keten.then(letters).then(function (fontCss) {
          var html = map['index.html'];
          html = html.replace('<link rel="stylesheet" href="css/fonts.css">',
            fontCss ? '<style>\n' + fontCss + '\n</style>' : '');
          html = html.replace('<link rel="stylesheet" href="css/style.css">',
            '<style>\n' + map['css/style.css'] + '\n</style>');
          html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '');
          html = html.replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">', '');

          var blok = '<script>window.NO_SW = true;<\/script>\n' +
            '<script>window.PRESET_SETTINGS = ' +
              JSON.stringify(S.data).replace(/</g, '\\u003c') + ';<\/script>\n' +
            '<script>window.AUDIO_DATA = {\n' + stukken.join(',\n') + '\n};<\/script>\n';
          ['js/manifest.js', 'js/icons.js', 'js/settings.js', 'js/audio.js',
           'js/ui.js', 'js/app.js'].forEach(function (p) {
            html = html.replace('<script src="' + p + '"><\/script>', '');
            blok += '<script>\n' + map[p] + '\n<\/script>\n';
            // meteen na het manifest: wat er niet in zit hoort ook niet op
            // het bord. Anders staan er knoppen die nergens meer bij kunnen.
            if (p === 'js/manifest.js') {
              blok += '<script>window.SOUNDS.sounds = window.SOUNDS.sounds' +
                      '.filter(function (d) { return !!window.AUDIO_DATA[d.file]; });<\/script>\n';
            }
          });
          html = html.replace('</body>', blok + '</body>');
          html = html.replace('<title>The Big Fat Speech Soundboard</title>',
            '<title>The Big Fat Speech Soundboard \u2014 noodpakket</title>');

          var blob = new Blob([html], { type: 'text/html' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'soundboard-noodpakket' + (metLange ? '' : '-kort') + '.html';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          return { mb: blob.size / 1048576, aantal: lijst.length };
        });
      });
    },

    renderPackage: function (body) {
      var self = this;
      var box = el('div');
      var line = el('div', 'offline-line', 'ÉÉN BESTAND MET ALLES ERIN');
      var bar = el('div', 'offline-bar', '<i></i>');
      var row = el('div', 'row');
      var alles = el('button', 'btn', 'ALLES');
      var kort = el('button', 'btn', 'ALLEEN KORTE');
      alles.type = kort.type = 'button';
      row.appendChild(alles); row.appendChild(kort);
      box.appendChild(line); box.appendChild(bar); box.appendChild(row);

      function bouw(knop, metLange) {
        alles.disabled = kort.disabled = true;
        bar.firstChild.style.width = '0';
        self.buildPackage(metLange, function (n, t, wat) {
          line.textContent = 'INPAKKEN… ' + n + ' VAN ' + t;
          bar.firstChild.style.width = (n / t * 100) + '%';
        }).then(function (r) {
          line.textContent = 'KLAAR — ' + r.aantal + ' GELUIDEN, ' + r.mb.toFixed(1) + ' MB';
          alles.disabled = kort.disabled = false;
        }).catch(function (err) {
          line.textContent = 'MISLUKT: ' + (err && err.message ? err.message : err);
          alles.disabled = kort.disabled = false;
        });
      }
      alles.addEventListener('click', function () { bouw(alles, true); });
      kort.addEventListener('click', function () { bouw(kort, false); });

      var veld = this.field('NOODPAKKET', '', box);
      veld.appendChild(el('p', 'hint',
        'Downloadt één HTML-bestand met de code, de letters én alle audio erin, ' +
        'precies zoals jouw bord er nu bij staat: namen, kleuren, volgorde, gaten, ' +
        'kopieën en uitsnedes. Geen server, geen cache, niets dat kan wegvallen — ' +
        'je zet het op je telefoon en het werkt zonder enige verbinding. Ook handig ' +
        'om te delen. ALLEEN KORTE laat de lange nummers weg (behalve die waar een ' +
        'kopie op staat); die knoppen worden daar dan lege plekken.'));
      body.appendChild(veld);
    },

    /** Toont of alle geluiden al opgeslagen zijn, met een knop om de rest
        binnen te halen. */
    renderOffline: function (body) {
      var self = this;
      var box = el('div', 'offline-box');
      var line = el('div', 'offline-line', 'CONTROLEREN…');
      var bar = el('div', 'offline-bar', '<i></i>');
      var btn = el('button', 'btn btn--accent', 'ALLES NU DOWNLOADEN');
      btn.type = 'button';
      btn.disabled = true;
      box.appendChild(line);
      box.appendChild(bar);
      box.appendChild(btn);

      var field = this.field('OFFLINE KLAARZETTEN', '', box);
      field.appendChild(el('p', 'hint',
        'Korte geluiden staan na het opstarten al volledig in je toestel. ' +
        'Bij de lange nummers bepaalt de browser zelf hoeveel hij vooruit ' +
        'laadt. Druk hierop voordat je begint, dan staat echt alles klaar en ' +
        'maakt het niet uit of de wifi het houdt.'));
      body.appendChild(field);

      function toon(st) {
        var stuk = (E.failed || []).filter(function (id) { return self.byId[id]; });
        if (stuk.length) {
          var namen = stuk.map(function (id) { return self.get(id).label; }).join(', ');
          line.textContent = stuk.length + ' GELUID' + (stuk.length > 1 ? 'EN' : '') +
            ' NIET GELADEN';
          bar.firstChild.style.width = '100%';
          bar.firstChild.style.background = '#ff2b4a';
          box.classList.remove('is-klaar');
          btn.disabled = false;
          btn.textContent = 'OPNIEUW OPHALEN';
          var waar = box.querySelector('.offline-stuk');
          if (!waar) { waar = el('p', 'hint offline-stuk'); box.appendChild(waar); }
          waar.textContent = namen + ' — tik op opnieuw ophalen, of herlaad de pagina.';
          return;
        }
        var klaar = st.have >= st.total;
        box.classList.toggle('is-klaar', klaar);
        bar.firstChild.style.width = (st.total ? st.have / st.total * 100 : 0) + '%';
        line.textContent = !st.supported
          ? 'DEZE BROWSER SLAAT NIETS OP'
          : (klaar ? 'ALLES STAAT KLAAR — ' + st.total + ' GELUIDEN'
                   : st.have + ' VAN ' + st.total + ' KLAAR');
        btn.disabled = !st.supported || klaar;
        btn.textContent = klaar ? 'NIETS MEER TE DOEN' : 'ALLES NU DOWNLOADEN';
      }

      E.cacheStatus().then(toon).catch(function () {
        toon({ have: 0, total: 0, supported: false });
      });

      btn.addEventListener('click', function () {
        btn.disabled = true;
        E.cacheAll(function (done, total, mislukt) {
          line.textContent = 'DOWNLOADEN… ' + done + ' VAN ' + total +
            (mislukt ? '  (' + mislukt + ' MISLUKT)' : '');
          bar.firstChild.style.width = (done / total * 100) + '%';
        }).then(function (r) {
          if (r.failed) {
            line.textContent = r.failed + ' VAN ' + r.total + ' MISLUKT — OPNIEUW PROBEREN';
            btn.disabled = false;
            btn.textContent = 'OPNIEUW PROBEREN';
            box.classList.remove('is-klaar');
          } else {
            E.cacheStatus().then(toon);
          }
        });
      });
    },

    exportProfile: function () {
      var blob = new Blob([S.toJSON()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'big-fat-speech-soundboard-profiel.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },

    importProfile: function () {
      var self = this;
      var input = el('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            S.fromJSON(String(reader.result));
            self.init(self.defs);
            self.renderSettings();
            Object.keys(S.data.sounds).forEach(function (id) {
              E.setTrim(id, S.data.sounds[id].trimDb || 0);
            });
          } catch (err) {
            global.alert('Dit bestand kon niet worden gelezen: ' + err.message);
          }
        };
        reader.readAsText(file);
      });
      input.click();
    },

    /* ---- knop bewerken --------------------------------------------- */
    openPadSheet: function (id) {
      this.padSheetId = id;
      this.renderPadSheet();
      this.openSheet('pad-sheet');
    },

    renderPadSheet: function () {
      var self = this, id = this.padSheetId;
      if (!id) return;
      var d = this.get(id), body = $('pad-body');
      $('pad-sheet-title').textContent = d.label || 'KNOP';
      body.innerHTML = '';

      /* voorbeeld */
      var prev = el('div', 'pad-preview');
      prev.appendChild(this.padEl(d));
      body.appendChild(prev);

      /* naam */
      var name = el('input', 'text-input');
      name.type = 'text'; name.value = d.label; name.maxLength = 40;
      name.addEventListener('input', function () {
        S.setSound(id, 'label', this.value.toUpperCase());
        self.refreshPad(id);
        $('pad-sheet-title').textContent = this.value.toUpperCase() || 'KNOP';
        prev.innerHTML = '';
        prev.appendChild(self.padEl(self.get(id)));
      });
      var naamField = this.field('NAAM', '', name);
      naamField.appendChild(el('p', 'hint',
        'Dit scherm open je ook zonder het slotje: houd een knop op het bord ' +
        'even ingedrukt.'));
      body.appendChild(naamField);

      /* icoon */
      var iconBtn = el('button', 'icon-current',
        ICONS.svg(d.icon) + '<span>' + esc(ICONS.label(d.icon)) + ' &mdash; ANDER ICOON KIEZEN</span>');
      iconBtn.type = 'button';
      iconBtn.addEventListener('click', function () { self.openIconPicker(id); });
      body.appendChild(this.field('ICOON', '', iconBtn));

      /* kleur */
      var pal = S.find(S.PALETTES, S.data.palette).colors;
      var extra = ['#ff2d95', '#00e5ff', '#b14aff', '#ffd400', '#39ff88', '#ff6a00', '#2f6bff', '#ff2b4a', '#ffffff'];
      var colors = pal.concat(extra.filter(function (c) { return pal.indexOf(c) < 0; }));
      var grid = el('div', 'swatch-grid');
      colors.forEach(function (c) {
        var b = el('button', 'swatch');
        b.type = 'button';
        b.style.background = c;
        b.style.color = c;
        b.setAttribute('aria-pressed', String(c.toLowerCase() === d.color.toLowerCase()));
        b.setAttribute('aria-label', 'Kleur ' + c);
        b.addEventListener('click', function () {
          S.setSound(id, 'color', c);
          self.refreshPad(id);
          self.renderPadSheet();
        });
        grid.appendChild(b);
      });
      var colField = this.field('KLEUR', '', grid);
      var custom = el('input', 'color-input');
      custom.type = 'color'; custom.value = d.color;
      custom.style.marginTop = '8px';
      custom.addEventListener('input', function () {
        S.setSound(id, 'color', this.value);
        self.refreshPad(id);
        prev.innerHTML = '';
        prev.appendChild(self.padEl(self.get(id)));
      });
      colField.appendChild(custom);
      body.appendChild(colField);

      /* volume */
      var trim = el('input');
      trim.type = 'range'; trim.min = '-12'; trim.max = '12'; trim.step = '0.5';
      trim.value = d.trimDb;
      trim.addEventListener('input', function () {
        var v = parseFloat(this.value);
        S.setSound(id, 'trimDb', v);
        E.setTrim(id, v);
        body.querySelector('[data-v="trim"]').textContent = (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
      });
      var trimField = this.field('VOLUME T.O.V. GENORMALISEERD',
        (d.trimDb > 0 ? '+' : '') + d.trimDb.toFixed(1) + ' dB', trim);
      trimField.querySelector('.field-value').dataset.v = 'trim';

      this.renderWave(body, id);
      this.renderPolish(body, id);

      var trimRow = el('div', 'row');
      trimRow.style.marginTop = '8px';
      var testBtn = el('button', 'btn btn--accent', 'BELUISTEREN');
      testBtn.type = 'button';
      testBtn.addEventListener('click', function () { E.play(id); self.wake(); });
      var fadeBtn = el('button', 'btn', 'UITFADEN');
      fadeBtn.type = 'button';
      fadeBtn.addEventListener('click', function () { E.fade(id, S.data.fade); });
      var zeroBtn = el('button', 'btn', 'OP 0');
      zeroBtn.type = 'button';
      zeroBtn.addEventListener('click', function () {
        S.setSound(id, 'trimDb', 0); E.setTrim(id, 0); self.renderPadSheet();
      });
      trimRow.appendChild(testBtn); trimRow.appendChild(fadeBtn); trimRow.appendChild(zeroBtn);
      trimField.appendChild(trimRow);
      trimField.appendChild(el('p', 'hint',
        'Gemeten correctie voor dit geluid: ' + (d.gainDb > 0 ? '+' : '') + d.gainDb.toFixed(2) +
        ' dB. De schuif komt daar bovenop.'));
      body.appendChild(trimField);

      /* volgorde */
      var pos = S.data.order.indexOf(id);
      var moveRow = el('div', 'row');
      var left = el('button', 'btn', '&larr; NAAR VOREN');
      left.type = 'button';
      left.disabled = pos <= 0;
      left.addEventListener('click', function () { self.move(id, -1); self.renderPadSheet(); });
      var right = el('button', 'btn', 'NAAR ACHTEREN &rarr;');
      right.type = 'button';
      right.addEventListener('click', function () { self.move(id, 1); self.renderPadSheet(); });
      moveRow.appendChild(left); moveRow.appendChild(right);
      var kopieRow = el('div', 'row');
      var kopieBtn = el('button', 'btn btn--accent', 'KOPIE MAKEN');
      kopieBtn.type = 'button';
      kopieBtn.addEventListener('click', function () { self.cloneSound(id); });
      kopieRow.appendChild(kopieBtn);
      var isKopie = (S.data.clones || []).some(function (c) { return c.id === id; });
      if (isKopie) {
        var wegBtn = el('button', 'btn btn--danger', 'KOPIE WEGHALEN');
        wegBtn.type = 'button';
        wegBtn.addEventListener('click', function () { self.removeClone(id); });
        kopieRow.appendChild(wegBtn);
      }
      var kopieField = this.field('MEERDERE FRAGMENTEN', '', kopieRow);
      kopieField.appendChild(el('p', 'hint',
        'Een kopie is een tweede knop op hetzelfde geluid, met een eigen naam, ' +
        'kleur en uitsnede. Zo haal je meerdere fragmenten uit één opname. Het ' +
        'geluid wordt maar één keer ingeladen, hoeveel kopieën je ook maakt.'));
      body.appendChild(kopieField);

      var archRow = el('div', 'row');
      var archBtn = el('button', 'btn btn--danger', 'NAAR ARCHIEF');
      archBtn.type = 'button';
      archBtn.addEventListener('click', function () { self.archive(id); });
      archRow.appendChild(archBtn);
      var archField = this.field('VAN HET BORD HALEN', '', archRow);
      archField.appendChild(el('p', 'hint',
        'De knop verdwijnt van het bord maar blijft bewaard. Terugzetten kan via ' +
        'Instellingen &rarr; Archief. Slepen kan ook: zet het slotje open en sleep de ' +
        'knop naar de prullenbak die onderin verschijnt.'));
      body.appendChild(archField);

      var plekField = this.field('PLEK IN HET ROOSTER',
        'PLEK ' + (pos + 1) + ' VAN ' + S.data.order.length, moveRow);

      var gapRow = el('div', 'row');
      gapRow.style.marginTop = '8px';
      var gapBefore = el('button', 'btn', 'LEGE PLEK ERVOOR');
      gapBefore.type = 'button';
      gapBefore.addEventListener('click', function () { self.insertGap(pos); self.renderPadSheet(); });
      var gapAfter = el('button', 'btn', 'LEGE PLEK ERNA');
      gapAfter.type = 'button';
      gapAfter.addEventListener('click', function () { self.insertGap(pos + 1); self.renderPadSheet(); });
      gapRow.appendChild(gapBefore); gapRow.appendChild(gapAfter);
      plekField.appendChild(gapRow);

      plekField.appendChild(el('p', 'hint',
        'Een lege plek schuift de knoppen erachter een plaats op, zodat je bijvoorbeeld ' +
        'het midden van een rij kunt openlaten. Slepen kan ook: zolang het slotje open ' +
        'staat verhuist een knop naar het streepjesvak waar je hem loslaat, en blijft ' +
        'zijn oude plek open. Laat je hem op een andere knop los, dan wisselen die twee om.'));
      body.appendChild(plekField);
    },

    /* ---- golfvorm en bijsnijden ---------------------------------- */
    renderWave: function (body, id) {
      var self = this;
      var base = this.byId[id] || {};
      var peaks = base.peaks;
      var d = this.get(id);

      if (!peaks || !peaks.length) {
        body.appendChild(this.field('BIJSNIJDEN', '',
          el('p', 'hint', 'Voor dit geluid is geen golfvorm beschikbaar.')));
        return;
      }

      var over = S.sound(id);
      var totaal = base.duration || 0;
      var start = Math.max(0, Math.min(over.trimStart || 0, totaal));
      var eind = (over.trimEnd && over.trimEnd > start) ? Math.min(over.trimEnd, totaal) : totaal;

      var wrap = el('div', 'wave');
      wrap.style.setProperty('--c', d.color);
      wrap.style.setProperty('--c-rgb', hexToRgb(d.color));
      var canvas = el('canvas', 'wave-canvas');
      var vlakVoor = el('div', 'wave-dim wave-dim--voor');
      var vlakNa = el('div', 'wave-dim wave-dim--na');
      var kop = el('div', 'wave-head');
      var grA = el('div', 'wave-grip wave-grip--a', '<i></i>');
      var grB = el('div', 'wave-grip wave-grip--b', '<i></i>');
      wrap.appendChild(canvas); wrap.appendChild(vlakVoor); wrap.appendChild(vlakNa);
      wrap.appendChild(kop); wrap.appendChild(grA); wrap.appendChild(grB);

      var veld = this.field('BIJSNIJDEN', '', wrap);
      var uitlezing = veld.querySelector('.field-label');
      uitlezing.insertAdjacentHTML('beforeend', '<span class="field-value" data-v="span"></span>');
      var lees = uitlezing.querySelector('[data-v="span"]');

      function pct(t) { return totaal ? (t / totaal * 100) : 0; }
      function toon() {
        vlakVoor.style.width = pct(start) + '%';
        vlakNa.style.left = pct(eind) + '%';
        vlakNa.style.width = (100 - pct(eind)) + '%';
        grA.style.left = pct(start) + '%';
        grB.style.left = pct(eind) + '%';
        lees.textContent = (eind - start).toFixed(2) + ' s  ·  ' +
          start.toFixed(2) + '–' + eind.toFixed(2);
        teken();
      }
      function teken() {
        var c = canvas.getContext('2d');
        var dpr = global.devicePixelRatio || 1;
        var w = canvas.clientWidth || 300, h = canvas.clientHeight || 70;
        canvas.width = w * dpr; canvas.height = h * dpr;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, h);
        var n = peaks.length, bw = w / n;
        for (var i = 0; i < n; i++) {
          var t = (i + 0.5) / n * totaal;
          var erin = t >= start && t <= eind;
          c.fillStyle = erin ? d.color : 'rgba(255,255,255,.16)';
          var bh = Math.max(2, peaks[i] / 100 * (h * 0.92));
          c.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 0.7), bh);
        }
      }

      function sleep(grip, isStart) {
        grip.addEventListener('pointerdown', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          var r = wrap.getBoundingClientRect();
          function beweeg(e) {
            var t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * totaal;
            if (isStart) start = Math.min(t, eind - 0.05);
            else eind = Math.max(t, start + 0.05);
            toon();
          }
          function los() {
            grip.removeEventListener('pointermove', beweeg);
            grip.removeEventListener('pointerup', los);
            grip.removeEventListener('pointercancel', los);
            S.setSound(id, 'trimStart', +start.toFixed(3));
            S.setSound(id, 'trimEnd', +eind.toFixed(3));
            self.pushEdit(id);
          }
          try { grip.setPointerCapture(ev.pointerId); } catch (e) {}
          grip.addEventListener('pointermove', beweeg);
          grip.addEventListener('pointerup', los);
          grip.addEventListener('pointercancel', los);
        });
      }
      sleep(grA, true); sleep(grB, false);

      var rij = el('div', 'row');
      rij.style.marginTop = '10px';
      var hoor = el('button', 'btn btn--accent', 'BELUISTEREN');
      hoor.type = 'button';
      hoor.addEventListener('click', function () {
        self.pushEdit(id);
        E.play(id);
        self.wake();
        (function loop() {
          var p = E.progress(id);
          if (E.voiceCount(id)) {
            kop.style.opacity = 1;
            kop.style.left = (pct(start) + p * (pct(eind) - pct(start))) + '%';
            requestAnimationFrame(loop);
          } else { kop.style.opacity = 0; }
        })();
      });
      var stil = el('button', 'btn', 'STILTE ERAF');
      stil.type = 'button';
      stil.addEventListener('click', function () {
        var top = 0;
        peaks.forEach(function (v) { if (v > top) top = v; });
        var drempel = Math.max(4, top * 0.08);
        var a = 0, b = peaks.length - 1;
        while (a < peaks.length && peaks[a] < drempel) a++;
        while (b > a && peaks[b] < drempel) b--;
        var vak = totaal / peaks.length;
        start = Math.max(0, a * vak - 0.04);
        eind = Math.min(totaal, (b + 1) * vak + 0.06);
        S.setSound(id, 'trimStart', +start.toFixed(3));
        S.setSound(id, 'trimEnd', +eind.toFixed(3));
        self.pushEdit(id);
        toon();
      });
      var alles = el('button', 'btn', 'ALLES');
      alles.type = 'button';
      alles.addEventListener('click', function () {
        start = 0; eind = totaal;
        S.setSound(id, 'trimStart', 0);
        S.setSound(id, 'trimEnd', 0);
        self.pushEdit(id);
        toon();
      });
      rij.appendChild(hoor); rij.appendChild(stil); rij.appendChild(alles);
      veld.appendChild(rij);
      veld.appendChild(el('p', 'hint',
        'Sleep de grepen om het begin en eind te verleggen. Er wordt niets uit ' +
        'het bestand geknipt: de knop speelt gewoon alleen het stuk tussen de ' +
        'grepen, en met ALLES staat alles weer open.'));
      body.appendChild(veld);
      setTimeout(toon, 0);
    },

    /* ---- oppoetsen ----------------------------------------------- */
    renderPolish: function (body, id) {
      var self = this, over = S.sound(id);
      var box = el('div');

      var presets = [
        { id: 'uit',    name: 'UIT',        hp: 0,   presence: 0 },
        { id: 'stem',   name: 'STEM',       hp: 110, presence: 4 },
        { id: 'scherp', name: 'STEM SCHERP', hp: 150, presence: 7 },
        { id: 'rommel', name: 'MINDER ROMMEL', hp: 220, presence: 3 },
        { id: 'warm',   name: 'WARM',       hp: 60,  presence: -3 }
      ];
      var huidig = 'eigen';
      presets.forEach(function (p) {
        if ((over.hp || 0) === p.hp && (over.presence || 0) === p.presence) huidig = p.id;
      });

      box.appendChild(this.chipRow(presets, huidig, function (p) {
        S.setSound(id, 'hp', p.hp);
        S.setSound(id, 'presence', p.presence);
        self.pushEdit(id);
        self.renderPadSheet();
      }));

      function schuif(label, sleutel, min, max, stap, eenheid) {
        var r = el('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = stap;
        r.value = over[sleutel] || 0;
        r.style.marginTop = '10px';
        var f = self.field(label, (over[sleutel] || 0) + ' ' + eenheid, r);
        f.style.marginBottom = '10px';
        r.addEventListener('input', function () {
          S.setSound(id, sleutel, parseFloat(this.value));
          self.pushEdit(id);
          f.querySelector('.field-value').textContent = this.value + ' ' + eenheid;
        });
        return f;
      }
      box.appendChild(schuif('LAAG WEGHALEN', 'hp', 0, 400, 10, 'Hz'));
      box.appendChild(schuif('HELDERHEID', 'presence', -8, 10, 1, 'dB'));

      var veld = this.field('OPPOETSEN', '', box);
      veld.appendChild(el('p', 'hint',
        'Laag weghalen ruimt gerommel en gebrom op, helderheid tilt het ' +
        'stembereik iets op. Dit maakt een opname helderder, maar het kan ' +
        'geen muziek of een tweede stem uit een fragment halen — daar is ' +
        'een heel ander soort gereedschap voor nodig.'));
      body.appendChild(veld);
    },

    /** Geeft de bewerking van dit geluid door aan de engine. */
    pushEdit: function (id) {
      var o = S.sound(id);
      E.setEdit(id, {
        start: o.trimStart || 0,
        end: o.trimEnd || 0,
        hp: o.hp || 0,
        presence: o.presence || 0
      });
    },

    refreshPad: function (id) {
      var wrap = document.querySelector('#board .pad-wrap[data-id="' + id + '"]');
      if (!wrap) return;
      var d = this.get(id);
      wrap.style.setProperty('--c', d.color);
      wrap.style.setProperty('--c-rgb', hexToRgb(d.color));
      wrap.querySelector('.pad-label').textContent = d.label;
      var pad = wrap.querySelector('.pad');
      pad.setAttribute('aria-label', d.label);
      var old = pad.querySelector('.ico');
      if (old) old.outerHTML = ICONS.svg(d.icon);
    },

    move: function (id, delta) {
      var i = S.data.order.indexOf(id), j = i + delta;
      if (i < 0 || j < 0 || j > S.data.order.length) return;
      this.moveToSlot(i, j);
    },

    /* ---- iconenkiezer ---------------------------------------------- */
    openIconPicker: function (id) {
      var self = this, body = $('icon-body'), d = this.get(id);
      body.innerHTML = '';

      var base = this.byId[id] || {};
      var hints = ICONS.suggest((base.label || '') + ' ' + (base.file || '') + ' ' + d.label, 8);
      if (base.icon && hints.indexOf(base.icon) < 0) hints.unshift(base.icon);

      function gridOf(ids) {
        var g = el('div', 'icon-grid');
        ids.forEach(function (iid) {
          var b = el('button', 'icon-opt', ICONS.svg(iid));
          b.type = 'button';
          b.title = ICONS.label(iid);
          b.setAttribute('aria-label', ICONS.label(iid));
          b.setAttribute('aria-pressed', String(iid === d.icon));
          b.addEventListener('click', function () {
            S.setSound(id, 'icon', iid);
            self.refreshPad(id);
            self.openPadSheet(id);
          });
          g.appendChild(b);
        });
        return g;
      }

      if (hints.length) {
        body.appendChild(this.field('SUGGESTIES VOOR "' + d.label + '"', '', gridOf(hints)));
      }

      var search = el('input', 'text-input');
      search.type = 'search';
      search.placeholder = 'ZOEK ICOON…';
      body.appendChild(this.field('ALLE ICONEN (' + ICONS.order.length + ')', '', search));

      var all = gridOf(ICONS.order);
      body.appendChild(all);
      search.addEventListener('input', function () {
        var q = this.value.trim().toLowerCase();
        var opts = all.querySelectorAll('.icon-opt');
        ICONS.order.forEach(function (iid, i) {
          var ic = ICONS.all[iid];
          var hit = !q || ic.label.toLowerCase().indexOf(q) >= 0 ||
            ic.keywords.some(function (k) { return k.indexOf(q) >= 0; });
          opts[i].style.display = hit ? '' : 'none';
        });
      });

      this.openSheet('icon-sheet');
    }
  };

  global.UI = UI;
  global.UI.fmt = fmt;
})(window);
