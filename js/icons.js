/* ------------------------------------------------------------------
   THE BIG FAT SPEECH SOUNDBOARD — iconenbibliotheek
   Alle iconen zijn inline SVG (24x24), zodat er niets van buitenaf
   geladen hoeft te worden en ze altijd direct scherp zijn.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var I = {};   // id -> { label, keywords, svg }

  function add(id, label, keywords, svg) {
    I[id] = { id: id, label: label, keywords: keywords, svg: svg };
  }

  /* --- stem & spraak ------------------------------------------- */
  add('mic', 'Microfoon', ['mic', 'microfoon', 'stem', 'speech', 'zang', 'praat', 'roast'],
    '<rect x="9" y="2.4" width="6" height="11.2" rx="3"/><path d="M5.6 11.2v.8a6.4 6.4 0 0 0 12.8 0v-.8"/><path d="M12 18.4v3.2"/><path d="M8.2 21.6h7.6"/>');

  add('bullhorn', 'Megafoon', ['megafoon', 'roeper', 'hard', 'aankondiging', 'horn'],
    '<path d="M3.5 9.6h3.3L15 4.6v14.8l-8.2-5H3.5z"/><path d="M6.8 14.4v5.2a1.7 1.7 0 0 0 3.4 0v-3.2"/><path d="M18.4 9.2a4.2 4.2 0 0 1 0 5.6"/>');

  add('chat', 'Tekstwolk', ['praten', 'chat', 'zeggen', 'quote', 'tekst'],
    '<path d="M20.6 15.4a2.4 2.4 0 0 1-2.4 2.4H8.4L3.4 21.4v-16a2.4 2.4 0 0 1 2.4-2.4h12.4a2.4 2.4 0 0 1 2.4 2.4z"/>');

  add('speaker', 'Speaker', ['geluid', 'volume', 'speaker', 'luid'],
    '<path d="M4 9.2h3.2L12 5v14l-4.8-4.2H4z" fill="currentColor" stroke="none"/><path d="M15.6 9.6a3.6 3.6 0 0 1 0 4.8"/><path d="M18.2 7a7.2 7.2 0 0 1 0 10"/>');

  add('mute', 'Stil', ['stil', 'mute', 'uit', 'stop'],
    '<path d="M4 9.2h3.2L12 5v14l-4.8-4.2H4z" fill="currentColor" stroke="none"/><path d="M16.2 9.8l5 4.4M21.2 9.8l-5 4.4"/>');

  add('wave', 'Golven', ['geluid', 'equalizer', 'wave', 'audio', 'golf'],
    '<path d="M4 14v-4M8 17V7M12 20V4M16 16.5v-9M20 13.5v-3" stroke-width="2.1"/>');

  add('broadcast', 'Uitzending', ['radio', 'signaal', 'live', 'zender'],
    '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4"/><path d="M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 19.2a10.2 10.2 0 0 0 0-14.4"/>');

  /* --- muziek --------------------------------------------------- */
  add('note', 'Noot', ['muziek', 'noot', 'liedje', 'song', 'zang'],
    '<ellipse cx="8" cy="17.5" rx="3.2" ry="2.6" fill="currentColor" stroke="none" transform="rotate(-18 8 17.5)"/><path d="M11.2 16.4V4.2c3.2.9 5 2.4 5 4.6"/>');

  add('notes', 'Noten', ['muziek', 'noten', 'liedje', 'song', 'nummer', 'track'],
    '<ellipse cx="6.4" cy="17.6" rx="2.9" ry="2.4" fill="currentColor" stroke="none"/><ellipse cx="17.2" cy="15.6" rx="2.9" ry="2.4" fill="currentColor" stroke="none"/><path d="M9.3 17.6V6.4l10.8-2.6v11.8"/><path d="M9.3 10.2 20.1 7.6"/>');

  add('vinyl', 'Plaat', ['plaat', 'vinyl', 'dj', 'draaien', 'disco'],
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>');

  add('cassette', 'Cassette', ['cassette', 'tape', 'retro', '80s'],
    '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><circle cx="15.5" cy="11" r="2.2"/><path d="M6 19l1.6-3.4h8.8L18 19"/>');

  add('boombox', 'Boombox', ['boombox', 'ghettoblaster', 'retro', '80s', 'muziek'],
    '<rect x="2.5" y="7.5" width="19" height="12" rx="2"/><circle cx="7.5" cy="13.5" r="3.2"/><circle cx="16.5" cy="13.5" r="3.2"/><path d="M8 7.5A5 5 0 0 0 16 7.5"/><path d="M11.4 10.5h1.2"/>');

  add('guitar', 'Gitaar', ['gitaar', 'band', 'rock', 'muziek', 'solo'],
    '<circle cx="8.5" cy="15.5" r="5.8"/><circle cx="8.5" cy="15.5" r="1.8"/><path d="M12.7 11.3 17.8 6.2"/><path d="M16.3 4.7 19.3 7.7"/>');

  add('piano', 'Toetsen', ['piano', 'toetsen', 'keyboard', 'synth', 'muziek'],
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M12 5v14M16 5v14"/><rect x="6.1" y="5" width="2.4" height="8" rx=".6" fill="currentColor" stroke="none"/><rect x="10.5" y="5" width="2.4" height="8" rx=".6" fill="currentColor" stroke="none"/><rect x="15" y="5" width="2.4" height="8" rx=".6" fill="currentColor" stroke="none"/>');

  /* --- drums & knallen ------------------------------------------ */
  add('drum', 'Drum', ['drum', 'badum', 'tss', 'grap', 'rimshot', 'slagwerk'],
    '<ellipse cx="12" cy="7.6" rx="8.4" ry="3.4"/><path d="M3.6 7.6v8.2a8.4 3.4 0 0 0 16.8 0V7.6"/><path d="M5.6 10.6 9 15M18.4 10.6 15 15M12 11v4.6"/>');

  add('sticks', 'Drumstokken', ['drumstok', 'rimshot', 'badum', 'tss', 'slagwerk'],
    '<path d="M3.5 20.5 14.4 9.6" stroke-width="2.2"/><circle cx="16.2" cy="7.8" r="2.4" fill="currentColor" stroke="none"/><path d="M20.5 20.5 9.6 9.6" stroke-width="2.2"/><circle cx="7.8" cy="7.8" r="2.4" fill="currentColor" stroke="none"/>');

  add('bomb', 'Bom', ['bom', 'knal', 'explosie', 'roast', 'boem'],
    '<circle cx="10.4" cy="15.2" r="6.4"/><path d="M15.4 10.4c1.2-1.2 1.8-2.8 1.4-4.2 1.2 1 3 1 4-.4"/><path d="M20.6 6.4 22.8 5.6M20.6 6.4l1.4-2M20.6 6.4 19 5"/>');

  add('bolt', 'Bliksem', ['bliksem', 'knal', 'power', 'energie', 'flits'],
    '<path d="M13.6 2.4 5.2 13.6h5.2l-.8 8 8.4-11.2h-5.2z" fill="currentColor" stroke="none"/>');

  add('fire', 'Vuur', ['vuur', 'fire', 'heet', 'roast', 'brand', 'hard'],
    '<path d="M12 2.5c1 3.4 3 5 4.4 6.7 1.6 2 2.4 3.8 2.4 5.8a6.8 6.8 0 0 1-13.6 0c0-2.3 1-4 2.6-5.6.2 1.9 1.1 3 2.1 3 1.3 0 2-1.5 1.8-4.1a12 12 0 0 1 .3-5.8z"/><path d="M12 21.3a3.5 3.5 0 0 1-3.5-3.5c0-1.9 1.6-3 2.5-4.6 1 1.6 4.5 2.9 4.5 4.6a3.5 3.5 0 0 1-3.5 3.5z" fill="currentColor" stroke="none"/>');

  add('siren', 'Sirene', ['sirene', 'alarm', 'politie', 'waarschuwing'],
    '<path d="M6.4 15.4a5.6 5.6 0 0 1 11.2 0z"/><rect x="4.4" y="15.4" width="15.2" height="3.6" rx="1.2"/><path d="M12 4.4v2.6M5.6 7 7.4 8.8M18.4 7l-1.8 1.8M2.6 13.4h2.6M18.8 13.4h2.6"/>');

  add('bell', 'Bel', ['bel', 'ding', 'goed', 'juist', 'quiz'],
    '<path d="M6 16.6v-4.8a6 6 0 0 1 12 0v4.8l2 2.4H4z"/><path d="M9.8 19v.6a2.2 2.2 0 0 0 4.4 0V19"/><path d="M12 3.4V5.8"/>');

  add('rocket', 'Raket', ['raket', 'lancering', 'snel', 'boost', 'start'],
    '<path d="M12 2.4c3.2 2.4 5 6 5 9.8v3.4l-2.4 2.2H9.4L7 15.6v-3.4c0-3.8 1.8-7.4 5-9.8z"/><circle cx="12" cy="10" r="2.2"/><path d="M7 13.6 4 16.4v3.8l3-1.8M17 13.6l3 2.8v3.8l-3-1.8"/><path d="M10.4 19.4 12 22.4l1.6-3"/>');

  /* --- reacties ------------------------------------------------- */
  add('laugh', 'Lachen', ['lach', 'grap', 'humor', 'haha', 'joke', 'funny'],
    '<circle cx="12" cy="12" r="9.2"/><path d="M6.6 13.4h10.8a5.4 5.4 0 0 1-10.8 0z" fill="currentColor" stroke="none"/><path d="M7.6 9.6c.9-1.2 2.3-1.2 3.2 0M13.2 9.6c.9-1.2 2.3-1.2 3.2 0"/>');

  add('smile', 'Blij', ['blij', 'smile', 'leuk', 'positief'],
    '<circle cx="12" cy="12" r="9.2"/><path d="M7.8 14.2a5 5 0 0 0 8.4 0"/><circle cx="9" cy="9.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="9.6" r="1.2" fill="currentColor" stroke="none"/>');

  add('sad', 'Zielig', ['zielig', 'sad', 'jammer', 'boe', 'verdrietig'],
    '<circle cx="12" cy="12" r="9.2"/><path d="M7.8 16a5 5 0 0 1 8.4 0"/><circle cx="9" cy="9.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="9.6" r="1.2" fill="currentColor" stroke="none"/>');

  add('cool', 'Cool', ['cool', 'stoer', 'zonnebril', 'deal'],
    '<circle cx="12" cy="12" r="9.2"/><path d="M4.6 9.4h5.6v2.2a2.8 2.8 0 0 1-5.6 0z" fill="currentColor" stroke="none"/><path d="M13.8 9.4h5.6v2.2a2.8 2.8 0 0 1-5.6 0z" fill="currentColor" stroke="none"/><path d="M10.2 10h3.6"/><path d="M8.6 16.2a5.2 5.2 0 0 0 6.8 0"/>');

  add('hand', 'Hand', ['hand', 'high five', 'stop', 'zwaaien'],
    '<path fill="currentColor" stroke="none" d="M9.6 5.4a1.3 1.3 0 0 1 1.3 1.3v4.6h.8V4.2a1.3 1.3 0 0 1 2.6 0v7.1h.8V6.1a1.3 1.3 0 0 1 2.6 0v5.2h.8V8.6a1.3 1.3 0 0 1 2.6 0v6.6a6.2 6.2 0 0 1-6.2 6.2h-1.3c-2 0-3.9-1-5-2.7l-2.8-4.3a1.4 1.4 0 0 1 2.1-1.8l1.4 1.4V6.7a1.3 1.3 0 0 1 1.3-1.3z"/>');

  add('clap', 'Applaus', ['applaus', 'klappen', 'bravo', 'clap', 'juichen'],
    '<path fill="currentColor" stroke="none" d="M11 7.4a1.1 1.1 0 0 1 1.1 1.1v3.9h.7V6.6a1.1 1.1 0 0 1 2.2 0v5.8h.7V8.2a1.1 1.1 0 0 1 2.2 0v4.2h.7v-2.2a1.1 1.1 0 0 1 2.2 0v5.6a5.3 5.3 0 0 1-5.3 5.3h-1.1c-1.7 0-3.3-.9-4.2-2.3l-2.4-3.7a1.2 1.2 0 0 1 1.8-1.5l1.2 1.2V8.5A1.1 1.1 0 0 1 11 7.4z"/><path d="M6.2 8.2 3.8 6M8.4 4.8 7.6 2M12.2 3.6 12.6 1.2"/>');

  add('thumbup', 'Duim', ['duim', 'top', 'goed', 'like', 'ja'],
    '<path d="M7 10.4 11 3.2a2.2 2.2 0 0 1 3.2 2v3.6h4.6a2.2 2.2 0 0 1 2.1 2.8l-2 7A2.2 2.2 0 0 1 16.8 20H7z"/><rect x="2.2" y="10.4" width="4.8" height="9.6" rx="1.4"/>');

  add('thumbdown', 'Duim omlaag', ['afkeuring', 'boe', 'slecht', 'nee', 'dislike', 'jammer'],
    '<path d="M7 13.6 11 20.8a2.2 2.2 0 0 0 3.2-2v-3.6h4.6a2.2 2.2 0 0 0 2.1-2.8l-2-7A2.2 2.2 0 0 0 16.8 4H7z"/><rect x="2.2" y="4" width="4.8" height="9.6" rx="1.4"/>');

  add('check', 'Goed', ['goed', 'juist', 'correct', 'vinkje', 'ja'],
    '<path d="M4 12.8 9.4 18.2 20 6.4" stroke-width="2.4"/>');

  add('cross', 'Fout', ['fout', 'nee', 'kruis', 'mis', 'afgekeurd'],
    '<path d="M5.6 5.6 18.4 18.4M18.4 5.6 5.6 18.4" stroke-width="2.4"/>');

  add('question', 'Vraag', ['vraag', 'quiz', 'wat', 'raadsel', 'onbekend'],
    '<circle cx="12" cy="12" r="9.2"/><path d="M9.2 9.4a2.9 2.9 0 1 1 3.8 2.8c-.7.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17.4" r="1.2" fill="currentColor" stroke="none"/>');

  add('exclaim', 'Uitroep', ['uitroep', 'let op', 'wow', 'belangrijk'],
    '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.8v7"/><circle cx="12" cy="17.4" r="1.2" fill="currentColor" stroke="none"/>');

  add('warning', 'Let op', ['waarschuwing', 'let op', 'gevaar', 'pas op'],
    '<path d="M12 3.4 22 20.6H2z"/><path d="M12 9.4v4.8"/><circle cx="12" cy="17.4" r="1.1" fill="currentColor" stroke="none"/>');

  add('bulb', 'Idee', ['idee', 'lamp', 'slim', 'quiz', 'antwoord', 'denken'],
    '<path d="M9 17.4a6.6 6.6 0 1 1 6 0v1.8H9z"/><path d="M9.6 20.8h4.8M10.4 22.4h3.2"/><path d="M10.2 15.4c0-1.5.7-2.1 1.8-3.1 1.1 1 1.8 1.6 1.8 3.1"/>');

  add('brain', 'Brein', ['brein', 'denken', 'slim', 'quiz', 'kennis'],
    '<path d="M12 4.2v15.6"/><path d="M12 5.4a3 3 0 0 0-5.4 1.2 2.8 2.8 0 0 0-2.2 4.2 3 3 0 0 0 .6 4.6 3 3 0 0 0 4.4 3.2A2.6 2.6 0 0 0 12 18.4"/><path d="M12 5.4a3 3 0 0 1 5.4 1.2 2.8 2.8 0 0 1 2.2 4.2 3 3 0 0 1-.6 4.6 3 3 0 0 1-4.4 3.2A2.6 2.6 0 0 1 12 18.4"/>');

  add('eye', 'Oog', ['oog', 'kijken', 'zien', 'let op'],
    '<path d="M1.8 12s3.8-6.4 10.2-6.4S22.2 12 22.2 12s-3.8 6.4-10.2 6.4S1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3.2"/>');

  /* --- sfeer & feest -------------------------------------------- */
  add('star', 'Ster', ['ster', 'top', 'favoriet', 'held'],
    '<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" fill="currentColor" stroke="none"/>');

  add('sparkle', 'Glitter', ['glitter', 'magie', 'sprankel', 'shine', 'diamant'],
    '<path d="M10.5 3c.8 4.7 3 6.9 7.7 7.7-4.7.8-6.9 3-7.7 7.7-.8-4.7-3-6.9-7.7-7.7C7.5 9.9 9.7 7.7 10.5 3z" fill="currentColor" stroke="none"/><path d="M18.5 14.4c.4 2 1.3 2.9 3.3 3.3-2 .4-2.9 1.3-3.3 3.3-.4-2-1.3-2.9-3.3-3.3 2-.4 2.9-1.3 3.3-3.3z" fill="currentColor" stroke="none"/>');

  add('heart', 'Hart', ['hart', 'liefde', 'vriend', 'love', 'lief'],
    '<path d="M12 20.6 4.4 13a4.7 4.7 0 0 1 6.6-6.7l1 1 1-1a4.7 4.7 0 0 1 6.6 6.7z" fill="currentColor" stroke="none"/>');

  add('diamond', 'Diamant', ['diamant', 'edelsteen', 'juweel', 'rijk', 'shine'],
    '<path d="M12 21.4 2.6 9.6 6 3.6h12l3.4 6z"/><path d="M2.6 9.6h18.8M8.4 9.6 12 21.4l3.6-11.8M8.4 9.6 10 3.6M15.6 9.6 14 3.6"/>');

  add('crown', 'Kroon', ['kroon', 'koning', 'winnaar', 'baas', 'top'],
    '<path d="M3 18.4 4.8 6.6l4.8 4.2L12 4.4l2.4 6.4 4.8-4.2L21 18.4z"/><path d="M3.8 21.2h16.4"/>');

  add('trophy', 'Beker', ['beker', 'winnaar', 'prijs', 'kampioen'],
    '<path d="M7.6 3.4h8.8v6.2a4.4 4.4 0 0 1-8.8 0z"/><path d="M7.6 5.2H4.8a3.2 3.2 0 0 0 3.2 3.2M16.4 5.2h2.8a3.2 3.2 0 0 1-3.2 3.2"/><path d="M12 14v3.4"/><path d="M8.4 20.6h7.2l-.8-3.2H9.2z"/>');

  add('medal', 'Medaille', ['medaille', 'prijs', 'winnaar', 'eer'],
    '<circle cx="12" cy="15.4" r="6"/><path d="m8 10-3.4-7M16 10l3.4-7"/><path d="M12 12.4l1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="currentColor" stroke="none"/>');

  add('confetti', 'Confetti', ['confetti', 'feest', 'party', 'hoera', 'vieren'],
    '<path d="M3.4 20.6 7.8 9.8l6.4 6.4z"/><path d="M12.6 8.4a2.6 2.6 0 0 1 3.4-1.6M17.4 12.4a2.6 2.6 0 0 1 1.6-3.4"/><circle cx="18.6" cy="4.6" r="1" fill="currentColor" stroke="none"/><circle cx="21.4" cy="8.6" r="1" fill="currentColor" stroke="none"/><circle cx="14.6" cy="3.4" r="1" fill="currentColor" stroke="none"/><circle cx="21" cy="14.4" r="1" fill="currentColor" stroke="none"/>');

  add('cheers', 'Proost', ['proost', 'toost', 'champagne', 'feest', 'borrel'],
    '<path d="M4 3.4h6.4l-1.2 6a2.2 2.2 0 0 1-4 0z"/><path d="M7.2 11.6v7.8M4.6 20.6h5.2"/><path d="M13.6 3.4H20l-1.2 6a2.2 2.2 0 0 1-4 0z"/><path d="M16.8 11.6v7.8M14.2 20.6h5.2"/>');

  add('beer', 'Bier', ['bier', 'borrel', 'drinken', 'kroeg', 'pils'],
    '<path d="M5 8.4h11v11.2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M16 10.6h2.4a2.6 2.6 0 0 1 0 5.2H16"/><path d="M5 8.4a2.4 2.4 0 0 1 2.4-2.4 2.6 2.6 0 0 1 4.6-1.4 2.4 2.4 0 0 1 4 1.6"/><path d="M9 12v6M12.4 12v6"/>');

  add('cake', 'Taart', ['taart', 'verjaardag', 'feest', 'jarig', 'gebak'],
    '<path d="M3.6 20.6v-5.2a2 2 0 0 1 2-2h12.8a2 2 0 0 1 2 2v5.2z"/><path d="M2.6 20.6h18.8"/><path d="M12 13.4V9.8M8 13.4v-2.6M16 13.4v-2.6"/><path d="M12 7.4c.9-.9.9-1.8 0-2.8-.9 1-.9 1.9 0 2.8zM8 9.4c.7-.7.7-1.4 0-2.2-.7.8-.7 1.5 0 2.2zM16 9.4c.7-.7.7-1.4 0-2.2-.7.8-.7 1.5 0 2.2z" fill="currentColor" stroke="none"/>');

  add('gift', 'Cadeau', ['cadeau', 'kado', 'verrassing', 'geschenk'],
    '<rect x="2.8" y="9.6" width="18.4" height="11.6" rx="1.8"/><path d="M1.8 9.6h20.4v3.6H1.8z" fill="currentColor" stroke="none"/><path d="M12 9.6v11.6"/><path d="M12 9.6C10.4 7 8.8 6 7.4 6a2.4 2.4 0 0 0 0 4.8M12 9.6C13.6 7 15.2 6 16.6 6a2.4 2.4 0 0 1 0 4.8"/>');

  add('money', 'Geld', ['geld', 'cash', 'duur', 'rijk', 'euro'],
    '<rect x="2.4" y="5.6" width="19.2" height="12.8" rx="2"/><circle cx="12" cy="12" r="3.4"/><circle cx="5.8" cy="9.2" r=".9" fill="currentColor" stroke="none"/><circle cx="18.2" cy="14.8" r=".9" fill="currentColor" stroke="none"/>');

  /* --- personages ----------------------------------------------- */
  add('skull', 'Schedel', ['schedel', 'dood', 'roast', 'hard', 'skull'],
    '<path d="M12 2.6a8.6 8.6 0 0 0-8.6 8.6c0 2.9 1.4 5 3.4 6.3v2.4a1.6 1.6 0 0 0 1.6 1.6h7.2a1.6 1.6 0 0 0 1.6-1.6v-2.4c2-1.3 3.4-3.4 3.4-6.3A8.6 8.6 0 0 0 12 2.6z"/><circle cx="8.6" cy="11.4" r="2.1" fill="currentColor" stroke="none"/><circle cx="15.4" cy="11.4" r="2.1" fill="currentColor" stroke="none"/><path d="M10.4 21.4v-2.8M13.6 21.4v-2.8M12 15.4v1.4"/>');

  add('ghost', 'Spook', ['spook', 'ghost', 'boe', 'eng', 'halloween'],
    '<path d="M4.6 21.4V11a7.4 7.4 0 0 1 14.8 0v10.4l-2.46-1.9-2.47 1.9-2.47-1.9-2.47 1.9-2.47-1.9z"/><circle cx="9.4" cy="10.6" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.6" cy="10.6" r="1.3" fill="currentColor" stroke="none"/>');

  add('alien', 'Alien', ['alien', 'ufo', 'ruimte', 'vreemd'],
    '<path d="M12 2.8c4.8 0 8.2 3.2 8.2 7.6 0 5.4-4.4 10.8-8.2 10.8S3.8 15.8 3.8 10.4C3.8 6 7.2 2.8 12 2.8z"/><path d="M7.6 9.4c1.8 0 3.2 1.2 3.2 2.6s-1.4 2-3.2 1.4-3-2-2.6-3.2c.3-.6 1.4-.8 2.6-.8z" fill="currentColor" stroke="none"/><path d="M16.4 9.4c-1.8 0-3.2 1.2-3.2 2.6s1.4 2 3.2 1.4 3-2 2.6-3.2c-.3-.6-1.4-.8-2.6-.8z" fill="currentColor" stroke="none"/>');

  add('robot', 'Robot', ['robot', 'computer', 'code', 'ai', 'machine'],
    '<rect x="3.6" y="7.4" width="16.8" height="12.6" rx="3"/><path d="M12 4.4v3"/><circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/><circle cx="8.6" cy="12.6" r="1.6" fill="currentColor" stroke="none"/><circle cx="15.4" cy="12.6" r="1.6" fill="currentColor" stroke="none"/><path d="M9 16.6h6"/><path d="M1.6 11.4v4M22.4 11.4v4"/>');

  add('bug', 'Krekel', ['krekel', 'insect', 'stilte', 'bug', 'beestje'],
    '<ellipse cx="12" cy="13.6" rx="4.6" ry="6.4"/><path d="M12 7.4V20"/><circle cx="12" cy="5.2" r="2.4"/><path d="M10.6 3.4 9 1.6M13.4 3.4 15 1.6"/><path d="M7.4 9.4 3.6 7.4M7.4 13.6H3.2M7.6 17.6 4 20M16.6 9.4l3.8-2M16.6 13.6h4.2M16.4 17.6 20 20"/>');

  /* --- retro & scherm ------------------------------------------- */
  add('retrosun', 'Retrozon', ['zon', 'synthwave', 'retro', '80s', 'outrun'],
    '<circle cx="12" cy="12" r="8.6"/><path d="M4.4 15h15.2M6.2 18h11.6M8.6 20.6h6.8"/>');

  add('sun', 'Zon', ['zon', 'dag', 'licht', 'warm'],
    '<circle cx="12" cy="12" r="5.2"/><path d="M12 1.8v2.6M12 19.6v2.6M4.8 4.8l1.9 1.9M17.3 17.3l1.9 1.9M1.8 12h2.6M19.6 12h2.6M4.8 19.2l1.9-1.9M17.3 6.7l1.9-1.9"/>');

  add('moon', 'Maan', ['maan', 'nacht', 'slaap', 'donker'],
    '<path d="M20.4 14.4A8.8 8.8 0 0 1 9.6 3.6a8.8 8.8 0 1 0 10.8 10.8z"/>');

  add('palm', 'Palmboom', ['palm', 'vakantie', 'strand', 'miami', '80s'],
    '<path d="M12.6 21.4c-.8-5.4-.4-9.2 1-12.4"/><path d="M13.6 9C11.2 6.8 7.6 6.6 5 8.8M13.6 9c-.6-3 1-6 4-7.2M13.6 9c3-1 6 .2 7.4 3M13.6 9c-1.6 2.4-1.6 5.2 0 7.6"/>');

  add('car', 'Auto', ['auto', 'rijden', 'race', 'outrun', 'weg'],
    '<path d="M3.4 15.4v-2.2l2-5a2.4 2.4 0 0 1 2.3-1.6h8.6a2.4 2.4 0 0 1 2.3 1.6l2 5v2.2z"/><path d="M3.4 13.2h17.2"/><circle cx="7.4" cy="16.8" r="2.2"/><circle cx="16.6" cy="16.8" r="2.2"/>');

  add('tv', 'TV', ['tv', 'scherm', 'televisie', 'show'],
    '<rect x="2.4" y="7.4" width="19.2" height="13.2" rx="2.4"/><path d="m7.4 3.4 4.6 4 4.6-4"/><path d="M6.4 12h3.2"/>');

  add('clapper', 'Filmklapper', ['film', 'klapper', 'actie', 'scene', 'bioscoop'],
    '<rect x="2.6" y="4.2" width="18.8" height="4.6" rx="1"/><rect x="2.6" y="8.8" width="18.8" height="11" rx="1.6"/><path d="M7 4.2 5 8.8M12 4.2l-2 4.6M17 4.2l-2 4.6"/>');

  add('camera', 'Camera', ['camera', 'foto', 'kiek', 'plaatje'],
    '<rect x="2.4" y="6.6" width="19.2" height="14" rx="2.6"/><path d="M8.4 6.6l1.4-2.8h4.4l1.4 2.8"/><circle cx="12" cy="13.6" r="4.2"/>');

  add('gamepad', 'Controller', ['game', 'spel', 'quiz', 'controller', 'console'],
    '<rect x="2.4" y="7.4" width="19.2" height="11.2" rx="4.4"/><path d="M7.6 11.4v3.4M5.9 13.1h3.4"/><circle cx="16.4" cy="11.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.6" cy="14.4" r="1.3" fill="currentColor" stroke="none"/>');

  add('dice', 'Dobbelsteen', ['dobbelsteen', 'geluk', 'kans', 'spel', 'random'],
    '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="3.4"/><circle cx="8.4" cy="8.4" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.6" cy="8.4" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="8.4" cy="15.6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.6" cy="15.6" r="1.5" fill="currentColor" stroke="none"/>');

  add('target', 'Roos', ['roos', 'doel', 'raak', 'precies', 'target'],
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>');

  add('clock', 'Klok', ['klok', 'tijd', 'wachten', 'timer'],
    '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.6V12l3.6 2.4"/>');

  add('hourglass', 'Zandloper', ['zandloper', 'tijd', 'wachten', 'duur'],
    '<path d="M6 2.8h12M6 21.2h12"/><path d="M7.4 2.8v3.4c0 2.2 4.6 3.6 4.6 5.8s-4.6 3.6-4.6 5.8v3.4"/><path d="M16.6 2.8v3.4c0 2.2-4.6 3.6-4.6 5.8s4.6 3.6 4.6 5.8v3.4"/>');

  add('flag', 'Vlag', ['vlag', 'start', 'finish', 'land'],
    '<path d="M5.4 21.4V3.4"/><path d="M5.4 4.6h13.2l-2.6 4.4 2.6 4.4H5.4z"/>');

  /* --- publieke API --------------------------------------------- */
  var ORDER = Object.keys(I);

  function svgFor(id, extraClass) {
    var ic = I[id] || I.wave;
    return '<svg class="ico' + (extraClass ? ' ' + extraClass : '') +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      ic.svg + '</svg>';
  }

  /** Raadt op basis van een naam welke iconen passen, beste eerst. */
  function suggest(text, limit) {
    var words = String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    var scored = [];
    ORDER.forEach(function (id) {
      var ic = I[id], score = 0;
      ic.keywords.forEach(function (kw) {
        words.forEach(function (w) {
          if (w === kw) score += 10;
          else if (w.length > 3 && kw.indexOf(w) === 0) score += 5;
          else if (kw.length > 3 && w.indexOf(kw) === 0) score += 4;
        });
      });
      if (score) scored.push({ id: id, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit || 6).map(function (s) { return s.id; });
  }

  global.ICONS = {
    all: I,
    order: ORDER,
    svg: svgFor,
    suggest: suggest,
    has: function (id) { return Object.prototype.hasOwnProperty.call(I, id); },
    label: function (id) { return (I[id] || {}).label || id; }
  };
})(window);
