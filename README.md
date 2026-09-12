# THE BIG FAT SPEECH SOUNDBOARD

Een soundboard voor tijdens een speech. Dark synthwave, elke knop een eigen
neonkleur, alles vooraf ingeladen en gelijktijdig af te spelen.

**Live:** https://constantdynamics.github.io/soundboard/

---

## Wat het doet

- **Geen vertraging.** Alle geluiden worden bij het opstarten opgehaald en
  gedecodeerd naar geheugen (Web Audio). Een knop indrukken start het geluid
  direct, zonder netwerk- of decodeerwachttijd.
- **Alles tegelijk.** Meerdere knoppen tegelijk is geen probleem, en dezelfde
  knop nog eens indrukken start een nieuwe laag terwijl de vorige doorspeelt.
- **Gelijk volume.** Elk geluid is gemeten volgens EBU R128 en wordt op
  −16 LUFS afgespeeld. Per geluid kun je daar met een schuif van afwijken.
- **Uitfaden.** De grote STOP-knop faadt alles uit. Zodra een geluid speelt
  verschijnt er rechtsboven op die knop een klein fade-knopje voor alleen dat
  geluid.
- **Timer rechtsboven.** Telt op, met een instelbare doelduur: vanaf 80% wordt
  hij geel, daarboven rood. Start vanzelf bij het eerste geluid.
- **Zelf aan te passen.** Lettertype, tekstgrootte, kleurenpalet, knopstijl,
  randdikte, afronding, tussenruimte, knopgrootte, aantal kolommen, volgorde,
  icoon per knop, kleur per knop en volume per knop — allemaal met presets,
  alles wordt bewaard in je browser.
- **16 kleurenpaletten en 10 knopstijlen.** De meerkleurige paletten lopen over
  de hele kleurencirkel, zodat knoppen naast elkaar echt van elkaar verschillen.
  De knopstijl bepaalt hoe die kleur over de knop wordt verdeeld.
- **Lege plekken in het rooster.** De indeling is een rooster van plekken die
  ook leeg mogen zijn, dus je kunt bijvoorbeeld het midden van een rij van drie
  openlaten.
- **Archief.** Knoppen die je even niet nodig hebt sleep je naar de prullenbak
  of zet je weg via het bewerkscherm. Ze verdwijnen van het bord maar blijven
  bewaard, en komen via Instellingen &rarr; Archief weer terug.
- **Werkt offline.** Na één keer laden draait de soundboard zonder internet.
  Op je telefoon kun je hem aan je beginscherm toevoegen.

## Bediening

| | |
|---|---|
| Knop indrukken | geluid afspelen (stapelt) |
| Fade-knopje op een spelende knop | alleen dat geluid uitfaden |
| **STOP** | alles uitfaden |
| **Slotje** | bewerkmodus aan/uit |
| Knop ingedrukt houden | naam, icoon, kleur, volume en plek aanpassen — ook met het slotje dicht |
| Knop aantikken in bewerkmodus | hetzelfde bewerkscherm |
| Knop naar een lege plek slepen | verhuist daarheen, oude plek blijft open |
| Knop op een andere knop slepen | die twee wisselen om |
| Knop naar de prullenbak slepen | gaat naar het archief, blijft bewaard |
| Timer aantikken | starten / pauzeren |

Buiten de bewerkmodus kun je niets per ongeluk verslepen of veranderen, en zijn
lege plekken onzichtbaar — ze houden hun ruimte wel vast, zodat de indeling
blijft staan zoals je hem hebt gemaakt.

In de bewerkmodus staan er onder je knoppen altijd een paar lege plekken klaar
om naartoe te slepen. Liever niet slepen? Tik een knop aan en gebruik
**Lege plek ervoor** of **Lege plek erna** — dat schuift de knoppen erachter een
plaats op. Alle gaten haal je in één keer weg via
**Instellingen → Lege plekken → Lege plekken opruimen**. Ze werken het best met
een vast aantal kolommen; op AUTO schuift het rooster mee met de schermbreedte.

## Updates

De service worker haalt bestanden op met revalidatie, zodat een nieuwe versie
meteen doorkomt in plaats van achter de cache van GitHub Pages te blijven
hangen.

Audiobestanden gaan anders: die worden uit de cache geserveerd zonder na te
vragen, want dat scheelt wachttijd en ze veranderen zelden. Vervang je er toch
eentje, dan zou je de oude versie blijven horen. Daarom zet
`tools/sync_manifest.py` een korte inhoudshash van elk bestand in
`data/sounds.json`, en vraagt de app het op als `audio/naam.mp3?v=<hash>`.
Andere inhoud betekent een andere hash, dus een andere url, dus een verse
download. Na het laden geeft de app de geldende lijst door aan de service
worker, die alles wat er niet meer bij hoort uit de cache gooit. Draait er al een oudere versie, dan verschijnt onderin **NIEUWE VERSIE
KLAAR** met een knop om te vernieuwen. Welke versie je draait staat in
**Instellingen → Versie**; daar zit ook **Nieuwste versie ophalen**, dat de
opgeslagen bestanden weggooit en opnieuw laadt (je instellingen blijven staan).

## Geluiden toevoegen of vervangen

1. Zet het audiobestand in `audio/`. Gebruik **mp3**: dat werkt in elke
   browser. AAC (`.m4a`, en het audiospoor van een `.mp4`) wordt niet overal
   ondersteund — Chromium-builds zonder propriëtaire codecs weigeren het.
   Omzetten kan zonder gedoe:

   ```bash
   ffmpeg -i opname.m4a -c:a libmp3lame -b:a 192k audio/opname.mp3
   ffmpeg -i filmpje.mp4 -vn -ac 1 -c:a libmp3lame -b:a 160k audio/filmpje.mp3
   ```
2. Meet de luidheid en werk het manifest bij:

   ```bash
   pip install numpy soundfile pyloudnorm
   python3 tools/analyze_loudness.py     # schrijft data/loudness.json
   python3 tools/sync_manifest.py        # werkt data/sounds.json bij
   ```

   `sync_manifest.py` zet ook de inhoudshash bij, dus draai hem altijd nadat je
   een bestand hebt vervangen — anders blijven mensen de oude versie horen.

3. Commit en push. GitHub Actions publiceert de site opnieuw.

`sync_manifest.py` laat bestaande namen, iconen, kleuren en volgorde met rust en
zet nieuwe bestanden onderaan met een automatisch gekozen icoon. De naam en het
icoon van een nieuwe knop pas je daarna gewoon in de app zelf aan.

## Uiterlijk

| instelling | wat het doet |
|---|---|
| Kleurenpalet | 12 meerkleurige sets plus 4 monokleuren; bepaalt de kleur per knop |
| Knopstijl | Neon, Vol, Verloop, Gloed, Glas, Omtrek, Duotoon, Scanline, Raster, Chroom |
| Randdikte | van geen rand tot 8 px |
| Afronding | van blok tot cirkel |
| Tussenruimte | 4 tot 36 px, geldt ook voor de marge langs de schermrand |
| Knopgrootte | Mini tot XXL |
| Kolommen | Auto of een vast aantal van 1 tot 6 |
| Lettertype | 8 lettertypes, met een aparte schuif voor de tekstgrootte |

Een palet zet de kleur van alle knoppen opnieuw. Wil je één knop een eigen
kleur geven, zet dan het slotje open en tik die knop aan.

## Over de normalisatie

De mp3's worden **niet** gehercodeerd — er gaat dus geen kwaliteit verloren.
`tools/analyze_loudness.py` meet per bestand de integrale luidheid (EBU R128 /
ITU-R BS.1770-4) en berekent hoeveel gain er nodig is om op −16 LUFS uit te
komen. Die waarde komt in `data/sounds.json` en wordt tijdens het afspelen in de
Web Audio-grafiek toegepast.

Korte, knallende geluiden (zoals een rimshot) hebben een lage gemiddelde
luidheid maar hoge pieken. Daarom geldt er een piekplafond van +3 dBFS: de
correctie wordt nooit verder opgedraaid dan dat. Een limiter op de master vangt
de rest op wanneer je meerdere geluiden tegelijk indrukt.

Dat plafond kijkt naar het **99,9e percentiel** van de golfvorm, niet naar de
absolute piek. Eén losse tik — de begintransiënt van een videobestand
bijvoorbeeld — zou anders de correctie voor de hele opname blokkeren. Bij
normaal materiaal schelen die twee minder dan een paar dB; bij zo'n uitschieter
tientallen.

Voor een opname die tientallen dB te stil is, is gain alleen niet genoeg: de
correctie wordt begrensd op +24 dB. `tools/analyze_loudness.py` meldt zo'n
bestand, en dan haalt `tools/normalize_file.py` het er eenmalig offline
doorheen met ffmpeg loudnorm — die regelt de luidheid én begrenst de ware piek.
Dat is de enige plek waar er wél opnieuw gecodeerd wordt.

Gemeten waarden:

| geluid | duur | gemeten LUFS | correctie |
|---|---|---|---|
| DIT IS DE ROAST | 10.0s | -13.25 | -2.75 dB |
| BA DUM TSS | 1.9s | -19.85 | +3.85 dB |
| BA DUM TSS 2 | 2.9s | -21.68 | +5.68 dB |
| AFKEURING | 16.7s | -8.21 | -7.79 dB |
| TOPPUNT | 6.7s | -1.56 | -14.44 dB |
| CODETAAL QUIZ | 5.6s | -13.59 | -2.41 dB |
| CODETAAL QUIZ 2 | 6.8s | -13.57 | -2.43 dB |
| WHATSAPP 15:14 | 3.1s | -38.22 | +22.22 dB |
| WHATSAPP 15:17 | 2.8s | -36.67 | +20.67 dB |
| WHATSAPP 15:29 | 2.3s | -34.77 | +18.77 dB |
| WHATSAPP 16:50 | 2.5s | -29.97 | +13.97 dB |
| WHATSAPP 16:53 | 1.9s | -28.99 | +12.99 dB |
| IT WAS A GOOD DAY | 2.9s | -14.7 | -1.30 dB |
| 1000 GOOD INTENTIONS | 5.1s | -14.82 | -1.18 dB |
| RODRIGUEZ | 29.9s | -16.46 | +0.46 dB |
| LOYAL FRIENDS | 159.6s | -13.9 | -2.10 dB |
| DIAMONDS | 208.8s | -13.59 | -2.41 dB |

## Opbouw

```
index.html              opbouw van de pagina
css/style.css           synthwave-stijl, mobiel eerst
js/icons.js             iconenbibliotheek (inline SVG) + suggesties op naam
js/settings.js          presets, opslag in de browser, export/import
js/audio.js             Web Audio: vooraf laden, afspelen, faden, limiter
js/ui.js                knoppenraster, timer, panelen, slepen
js/app.js               opstarten en ontgrendelen van het geluid
sw.js                   service worker voor offline gebruik
data/sounds.json        de knoppen: naam, icoon, kleur, gemeten gain
data/loudness.json      ruwe meetresultaten
tools/                  de meet- en manifestscripts
```

Geen build-stap, geen afhankelijkheden: het is gewone HTML, CSS en JavaScript.

## Publiceren

`.github/workflows/deploy.yml` publiceert bij elke push naar `main` (en naar
`claude/**`-branches) naar GitHub Pages.

**Eenmalig instellen:** ga naar **Settings → Pages → Build and deployment** en
zet **Source** op **GitHub Actions**. Dat kan de workflow niet zelf doen; de
token van GitHub Actions heeft geen rechten om Pages aan te zetten. Draai
daarna de workflow opnieuw via **Actions → Publiceren op GitHub Pages →
Run workflow**.

Zodra er een `main`-branch is, kun je de `claude/**`-regel uit de workflow
halen.
