/* ------------------------------------------------------------------
   THE BIG FAT SPEECH SOUNDBOARD — instellingen & presets
   Alles wordt automatisch bewaard in de browser (localStorage) en is
   te exporteren/importeren als JSON-bestand.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var KEY = 'bfss:v1';

  /* ---- presets ------------------------------------------------- */

  var FONTS = [
    { id: 'orbitron',   name: 'OUTRUN',   stack: "'Orbitron', sans-serif",     weight: 800, spacing: '.08em' },
    { id: 'audiowide',  name: 'NEON',     stack: "'Audiowide', sans-serif",    weight: 400, spacing: '.05em' },
    { id: 'righteous',  name: 'CHROME',   stack: "'Righteous', sans-serif",    weight: 400, spacing: '.04em' },
    { id: 'chakra',     name: 'TURBO',    stack: "'Chakra Petch', sans-serif", weight: 700, spacing: '.09em' },
    { id: 'monoton',    name: 'TUBE',     stack: "'Monoton', cursive",         weight: 400, spacing: '.06em' },
    { id: 'vt323',      name: 'TERMINAL', stack: "'VT323', monospace",         weight: 400, spacing: '.08em' },
    { id: 'pressstart', name: 'ARCADE',   stack: "'Press Start 2P', monospace", weight: 400, spacing: '.02em' },
    { id: 'system',     name: 'SYSTEEM',  stack: "system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 800, spacing: '.06em' }
  ];

  /* Paletten. De meerkleurige sets lopen bewust over de hele kleurencirkel,
     zodat naast elkaar liggende knoppen echt van elkaar verschillen. */
  var PALETTES = [
    { id: 'miami',   name: 'MIAMI',    colors: ['#ff2d95', '#00e5ff', '#b14aff', '#ffd400', '#39ff88', '#ff6a00', '#2f6bff', '#ff3355'] },
    { id: 'arcade',  name: 'ARCADE',   colors: ['#ff1744', '#2979ff', '#ffea00', '#00e676', '#d500f9', '#00e5ff', '#ff9100', '#76ff03'] },
    { id: 'neoncity',name: 'NEON CITY',colors: ['#ff0080', '#aaff00', '#00b0ff', '#ff6d00', '#7c4dff', '#1de9b6', '#ffc400', '#f50057'] },
    { id: 'tropic',  name: 'TROPIC',   colors: ['#00d4b4', '#ff5e5b', '#c6ff00', '#ff2d95', '#ffb300', '#1e5eff', '#00e676', '#ff8a65'] },
    { id: 'galaxy',  name: 'GALAXY',   colors: ['#7b5cff', '#ff3d9a', '#00d9ff', '#b388ff', '#ff9e00', '#26ffb0', '#ffd54f', '#5c7bff'] },
    { id: 'candy',   name: 'CANDY',    colors: ['#ff5fa2', '#4fd8ff', '#a8ff5f', '#ffd93d', '#c58bff', '#ff9166', '#5fffc8', '#ff6fd8'] },
    { id: 'outrun',  name: 'OUTRUN',   colors: ['#ff006e', '#8338ec', '#3a86ff', '#fb5607', '#ffbe0b', '#00d4ff', '#c11cad', '#06d6a0'] },
    { id: 'sunset',  name: 'SUNSET',   colors: ['#ff2e63', '#ff8c42', '#ffd166', '#f72585', '#9d4edd', '#ff5a5f', '#ffb703', '#e07a5f'] },
    { id: 'toxic',   name: 'TOXIC',    colors: ['#aaff00', '#00ffc8', '#ffee00', '#00b3ff', '#ff00e5', '#39ff14', '#ff7b00', '#7cffcb'] },
    { id: 'ice',     name: 'ICE',      colors: ['#00e5ff', '#5b8cff', '#b388ff', '#5eead4', '#8ecdf7', '#c3b1ff', '#00b4d8', '#e0f7ff'] },
    { id: 'vapor',   name: 'VAPOR',    colors: ['#ff9ec7', '#a0e9ff', '#c4a0ff', '#ffd6a0', '#9fffcb', '#ffb3de', '#a7c6ff', '#ffc8f0'] },
    { id: 'inferno', name: 'INFERNO',  colors: ['#ff2200', '#ff6a00', '#ffb300', '#ff0055', '#ff8c00', '#ffd000', '#ff3d00', '#ff0080'] },
    { id: 'pink',    name: 'MONO ROZE', colors: ['#ff2d95'] },
    { id: 'cyan',    name: 'MONO CYAAN', colors: ['#00e5ff'] },
    { id: 'lime',    name: 'MONO LIME', colors: ['#adff2f'] },
    { id: 'white',   name: 'MONO WIT',  colors: ['#e8e8ff'] }
  ];

  /* Hoe de knop zelf is ingevuld. */
  var FILLS = [
    { id: 'neon',     name: 'NEON' },
    { id: 'vol',      name: 'VOL' },
    { id: 'verloop',  name: 'VERLOOP' },
    { id: 'gloed',    name: 'GLOED' },
    { id: 'glas',     name: 'GLAS' },
    { id: 'omtrek',   name: 'OMTREK' },
    { id: 'duotoon',  name: 'DUOTOON' },
    { id: 'scanline', name: 'SCANLINE' },
    { id: 'raster',   name: 'RASTER' },
    { id: 'chroom',   name: 'CHROOM' }
  ];

  var BORDERS = [
    { id: 0, name: 'GEEN' }, { id: 1, name: 'DUN' }, { id: 2, name: 'NORMAAL' },
    { id: 3, name: 'DIK' }, { id: 5, name: 'EXTRA DIK' }, { id: 8, name: 'MAXIMAAL' }
  ];

  var RADII = [
    { id: 0, name: 'BLOK' }, { id: 8, name: 'LICHT' }, { id: 16, name: 'ZACHT' },
    { id: 22, name: 'NORMAAL' }, { id: 34, name: 'ROND' }, { id: 999, name: 'CIRKEL' }
  ];

  var GAPS = [
    { id: 4, name: 'KRAP' }, { id: 8, name: 'SMAL' }, { id: 12, name: 'NORMAAL' },
    { id: 18, name: 'RUIM' }, { id: 26, name: 'HEEL RUIM' }, { id: 36, name: 'MAXIMAAL' }
  ];

  var SIZES = [
    { id: 'xs', name: 'MINI',  pad: 74,  icon: 26, label: 8.5 },
    { id: 's',  name: 'KLEIN', pad: 86,  icon: 32, label: 9.5 },
    { id: 'm',  name: 'NORMAAL', pad: 104, icon: 38, label: 11 },
    { id: 'l',  name: 'GROOT', pad: 136, icon: 50, label: 12.5 },
    { id: 'xl', name: 'XXL',   pad: 170, icon: 62, label: 14 }
  ];

  var COLUMNS = [
    { id: 'auto', name: 'AUTO' },
    { id: '1', name: '1' }, { id: '2', name: '2' }, { id: '3', name: '3' },
    { id: '4', name: '4' }, { id: '5', name: '5' }, { id: '6', name: '6' }
  ];

  /* Hoeveel een ouder geluid wegzakt zodra er iets nieuws overheen komt. */
  var DUCKS = [
    { id: 0,  name: 'UIT' },
    { id: 6,  name: 'LICHT' },
    { id: 12, name: 'NORMAAL' },
    { id: 18, name: 'STERK' },
    { id: 30, name: 'BIJNA WEG' }
  ];

  var FADES = [
    { id: 0.4, name: 'SNEL' },
    { id: 1.2, name: 'NORMAAL' },
    { id: 2.5, name: 'TRAAG' },
    { id: 5, name: 'HEEL TRAAG' }
  ];

  var TIMER_TARGETS = [
    { id: 0, name: 'GEEN' }, { id: 120, name: '2 MIN' }, { id: 300, name: '5 MIN' },
    { id: 420, name: '7 MIN' }, { id: 600, name: '10 MIN' }, { id: 900, name: '15 MIN' },
    { id: 1200, name: '20 MIN' }
  ];

  function defaults() {
    return {
      version: 1,
      font: 'orbitron',
      fontScale: 1,
      palette: 'miami',
      fill: 'neon',
      border: 2,
      gap: 12,
      radius: 22,
      size: 'm',
      columns: 'auto',
      masterVolume: 85,
      fade: 1.2,
      duck: 12,
      timerTarget: 420,
      showLabels: true,
      order: [],
      archived: [],
      clones: [],
      sounds: {}        // id -> { label, icon, color, trimDb }
    };
  }

  var Settings = {
    FONTS: FONTS, PALETTES: PALETTES, SIZES: SIZES, FILLS: FILLS,
    BORDERS: BORDERS, GAPS: GAPS, RADII: RADII, DUCKS: DUCKS,
    COLUMNS: COLUMNS, FADES: FADES, TIMER_TARGETS: TIMER_TARGETS,
    data: defaults(),
    onchange: null,

    find: function (list, id) {
      for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
      return list[0];
    },

    load: function () {
      try {
        var raw = global.localStorage.getItem(KEY);
        if (raw) this.data = this.merge(defaults(), JSON.parse(raw));
      } catch (e) {
        console.warn('Instellingen konden niet worden gelezen:', e);
      }
      return this.data;
    },

    merge: function (base, saved) {
      Object.keys(base).forEach(function (k) {
        if (saved[k] === undefined || saved[k] === null) return;
        if (k === 'sounds' && typeof saved[k] === 'object') base[k] = saved[k];
        else if ((k === 'order' || k === 'archived' || k === 'clones') && Array.isArray(saved[k])) base[k] = saved[k];
        else if (typeof base[k] !== 'object') base[k] = saved[k];
      });
      return base;
    },

    save: function () {
      try {
        global.localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) {
        console.warn('Instellingen konden niet worden bewaard:', e);
      }
      if (this.onchange) this.onchange(this.data);
    },

    set: function (key, value) { this.data[key] = value; this.save(); },

    /** Per-geluid overschrijving, met terugval op het manifest. */
    sound: function (id) {
      if (!this.data.sounds[id]) this.data.sounds[id] = {};
      return this.data.sounds[id];
    },

    setSound: function (id, key, value) {
      this.sound(id)[key] = value;
      this.save();
    },

    reset: function () {
      this.data = defaults();
      try { global.localStorage.removeItem(KEY); } catch (e) {}
      if (this.onchange) this.onchange(this.data);
    },

    /* ---- export / import ---------------------------------------- */
    toJSON: function () {
      return JSON.stringify({
        app: 'the-big-fat-speech-soundboard',
        exported: new Date().toISOString(),
        settings: this.data
      }, null, 2);
    },

    fromJSON: function (text) {
      var parsed = JSON.parse(text);
      var incoming = parsed.settings || parsed;
      if (!incoming || typeof incoming !== 'object') throw new Error('Onbekend bestandsformaat');
      this.data = this.merge(defaults(), incoming);
      this.save();
      return this.data;
    }
  };

  global.Settings = Settings;
})(window);
