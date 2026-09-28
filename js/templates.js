/* ------------------------------------------------------------------
   THE BIG FAT SOUNDBOARD — werk-sjablonen
   Een kant-en-klaar begin voor een nieuw bord: knoppen, uiterlijk en een
   passende timer. De geluiden zijn zelf gemaakt (tools/make_template_sounds.py)
   en staan in de site zelf, dus ze werken voor iedereen, ook offline en
   zonder persoonlijke link.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SJABLONEN = [
    {
      id: 'presentatie', name: 'PRESENTATIE',
      uitleg: 'Openen, overgangen, een quizvraag en het applaus aan het eind.',
      doc: {
        palette: 'ice', font: 'orbitron', fill: 'glas', columns: '3', timerTarget: 900,
        order: ['gong', 'bel', 'aftellen',
                'tiktak', 'whoosh', 'tadaa',
                'goed', 'zoemer', 'applaus']
      }
    },
    {
      id: 'afscheid', name: 'AFSCHEID',
      uitleg: 'Voor een afscheidsspeech: tromgeroffel, fanfare, proosten en een traantje.',
      doc: {
        palette: 'sunset', font: 'righteous', fill: 'gloed', columns: '3', timerTarget: 300,
        order: ['tromgeroffel', 'fanfare', 'tadaa',
                'proost', 'speeldoos', 'applaus',
                'rimshot', 'krekels', 'bel']
      }
    },
    {
      id: 'teamuitje', name: 'TEAMUITJE',
      uitleg: 'Spelletjes en quizrondes: fluitje, goed, fout, toeter en de winnaar.',
      doc: {
        palette: 'arcade', font: 'pressstart', fill: 'vol', columns: '3', timerTarget: 600,
        order: ['fluit', 'aftellen', 'tiktak',
                'goed', 'fout', 'zoemer',
                'tromgeroffel', 'toeter', 'applaus',
                'krekels', 'fanfare', 'whoosh']
      }
    }
  ];

  global.TEMPLATES = SJABLONEN.map(function (t) { return { id: t.id, name: t.name, uitleg: t.uitleg }; });

  global.Templates = {
    /** Een nieuw, volledig bord volgens het sjabloon (een losse kopie). */
    doc: function (id) {
      var S = global.Settings;
      var t = SJABLONEN.filter(function (x) { return x.id === id; })[0];
      var doc = S.merge(S.defaults(), t ? JSON.parse(JSON.stringify(t.doc)) : {});
      if (t) doc.title = t.name;
      return doc;
    }
  };
})(window);
