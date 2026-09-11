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
      this.defs = defs;
      defs.forEach(function (d) { self.byId[d.id] = d; });

      // De volgorde is een rooster van plekken: elke plek bevat een geluid
      // of is leeg (null). Onbekende of dubbele namen worden een lege plek,
      // zodat de indeling heel blijft als er een geluid verdwijnt.
      var seen = {};
      var order = (S.data.order || []).map(function (id) {
        if (id && self.byId[id] && !seen[id]) { seen[id] = 1; return id; }
        return null;
      });
      defs.forEach(function (d) { if (!seen[d.id]) { order.push(d.id); seen[d.id] = 1; } });
      S.data.order = trimTail(order);

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
      root.setProperty('--neon-a', pal.colors[0]);
      root.setProperty('--neon-a-rgb', hexToRgb(pal.colors[0]));
      root.setProperty('--neon-b', pal.colors[1] || pal.colors[0]);
      root.setProperty('--neon-b-rgb', hexToRgb(pal.colors[1] || pal.colors[0]));

      var board = $('board');
      board.className = 'board' + (d.columns !== 'auto' ? ' cols-' + d.columns : '') +
        (d.showLabels ? '' : ' no-labels') + (this.editing ? ' is-editing' : '');

      var mv = $('master-vol');
      if (mv && String(mv.value) !== String(d.masterVolume)) mv.value = d.masterVolume;
      E.setMaster(d.masterVolume);
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

      fade.addEventListener('click', function (ev) {
        ev.stopPropagation();
        E.fade(id, S.data.fade);
      });

      pad.addEventListener('click', function () {
        if (self.editing) return;                 // in bewerkmodus doet slepen/tikken iets anders
        self.trigger(id, pad);
      });

      // Slepen (alleen in bewerkmodus). Tik zonder beweging = bewerken.
      pad.addEventListener('pointerdown', function (ev) {
        if (!self.editing || ev.button > 0) return;
        self.startDrag(ev, wrap, pad);
      });
    },

    trigger: function (id, pad) {
      var v = E.play(id);
      if (!v) return;
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
      var moved = false, target = null;

      function highlight(next) {
        if (target === next) return;
        if (target) target.classList.remove('is-drop-target');
        target = next;
        if (target) target.classList.add('is-drop-target');
      }

      function move(e) {
        if (!moved && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 9) return;
        if (!moved) { moved = true; wrap.classList.add('dragging'); }
        wrap.style.transform = 'translate(' + (e.clientX - startX) + 'px,' +
          (e.clientY - startY) + 'px)';
        highlight(self.slotUnder(e.clientX, e.clientY, wrap));
      }

      function up() {
        pad.removeEventListener('pointermove', move);
        pad.removeEventListener('pointerup', up);
        pad.removeEventListener('pointercancel', up);
        wrap.classList.remove('dragging');
        wrap.style.transform = '';
        var drop = target;
        highlight(null);

        if (!moved) {
          self.openPadSheet(wrap.dataset.id);      // tik = knop bewerken
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
        if (n > 1) w.querySelector('.pad-voices').textContent = n;
        var prog = w.querySelector('.pad-prog');
        prog.style.width = playing ? (E.progress(id) * 100).toFixed(1) + '%' : '0';
      }
      $('btn-stop').disabled = !E.anyPlaying();
      this.paintTimer();
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
        'Je instellingen worden automatisch in deze browser bewaard. ' +
        'Exporteren geeft je een JSON-bestand als reservekopie of om op een ander apparaat te gebruiken.'));
      body.appendChild(profField);

      /* over */
      body.appendChild(el('p', 'hint',
        'Alle geluiden zijn genormaliseerd op &minus;16 LUFS (EBU R128). ' +
        'Wil je er eentje harder of zachter? Zet het slotje aan en tik de knop aan.'));
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
      body.appendChild(this.field('NAAM', '', name));

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
      body.appendChild(this.field('PLEK IN HET ROOSTER',
        'PLEK ' + (pos + 1) + ' VAN ' + S.data.order.length, moveRow));
      body.lastChild.appendChild(el('p', 'hint',
        'Zolang het slotje open staat kun je knoppen ook gewoon verslepen. ' +
        'Laat je er eentje op een lege plek los, dan verhuist hij daarheen en blijft ' +
        'zijn oude plek open. Laat je hem op een andere knop los, dan wisselen ze om.'));
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
