# THE BIG FAT SPEECH SOUNDBOARD

Een soundboard voor tijdens een speech. Dark synthwave, elke knop een eigen
neonkleur, alles vooraf ingeladen en gelijktijdig af te spelen.

**Live:** https://constantdynamics.github.io/soundboard/

---

## Wat het doet

- **Geen vertraging.** Korte geluiden worden bij het opstarten opgehaald en
  gedecodeerd naar geheugen (Web Audio). Een knop indrukken start het geluid
  direct, zonder netwerk- of decodeerwachttijd. Volledige nummers worden
  gestreamd; zie *Korte geluiden en lange nummers*.
- **Alles tegelijk.** Meerdere knoppen tegelijk is geen probleem, en dezelfde
  knop nog eens indrukken start een nieuwe laag terwijl de vorige doorspeelt.
- **Gelijk volume.** Elk geluid is gemeten volgens EBU R128 en wordt op
  −16 LUFS afgespeeld. Per geluid kun je daar met een schuif van afwijken.
- **Wegdrukken.** Speel je iets terwijl er al geluid loopt, dan zakt het oudere
  zachtjes weg en komt het terug zodra het nieuwe klaar is — zoals een
  radiomaker een muziekbed onder een stem duwt. Instelbaar van licht tot bijna
  weg, of helemaal uit.
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
  Bovenaan de instellingen staat **Offline klaarzetten**: die laat zien of alle
  geluiden al in je toestel staan en haalt met één druk binnen wat er nog
  ontbreekt. Handig vlak voor een speech. Op je telefoon kun je de soundboard
  aan je beginscherm toevoegen.

## Bediening

| | |
|---|---|
| Knop indrukken | geluid afspelen (stapelt) |
| Fade-knopje op een spelende knop | alleen dat geluid uitfaden |
| **STOP** | alles uitfaden |
| **Slotje** | bewerkmodus aan/uit |
| Knop die wordt weggedrukt | dooft op het bord zolang er iets nieuwers speelt |
| Knop ingedrukt houden | naam, icoon, kleur, bijsnijden, oppoetsen, volume en plek aanpassen — ook met het slotje dicht |
| Knop aantikken in bewerkmodus | hetzelfde bewerkscherm |
| Knop naar een lege plek slepen | verhuist daarheen, oude plek blijft open |
| Knop op een andere knop slepen | die twee wisselen om |
| Knop naar de prullenbak slepen | gaat naar het archief, blijft bewaard |
| Timer aantikken | starten / pauzeren |
| Balk onder het bord | alleen bij lange nummers: pauzeren, hervatten, 15 seconden terug of vooruit, of ergens naartoe schuiven |

Buiten de bewerkmodus kun je niets per ongeluk verslepen of veranderen, en zijn
lege plekken onzichtbaar — ze houden hun ruimte wel vast, zodat de indeling
blijft staan zoals je hem hebt gemaakt.

In de bewerkmodus staan er onder je knoppen altijd een paar lege plekken klaar
om naartoe te slepen. Liever niet slepen? Tik een knop aan en gebruik
**Lege plek ervoor** of **Lege plek erna** — dat schuift de knoppen erachter een
plaats op. Alle gaten haal je in één keer weg via
**Instellingen → Lege plekken → Lege plekken opruimen**. Ze werken het best met
een vast aantal kolommen; op AUTO schuift het rooster mee met de schermbreedte.

## Als het misgaat

De soundboard is gebouwd om te blijven werken als er iets wegvalt:

- **Het manifest is geen netwerkoproep.** De lijst met geluiden staat in
  `js/manifest.js` en wordt als gewoon script geladen. Eerder werd hij met
  fetch opgehaald, en één hapering maakte de hele soundboard onbruikbaar.
- **Eén onbereikbaar geluid stopt de rest niet.** De andere knoppen werken
  gewoon door, en bovenaan de instellingen staat welk geluid ontbreekt met
  een knop om het alsnog op te halen.
- **Op het startscherm staat een noodknop** die alle opgeslagen bestanden en
  de service worker weggooit en opnieuw begint. Voor als er iets vastzit.
- **Werkt offline**, mits je de soundboard op dat toestel al eens hebt
  geopend. Zie *Offline klaarzetten* hierboven.

### Noodpakket: één bestand, nul afhankelijkheden

Voor als het écht niet mis mag gaan. In **Instellingen → Noodpakket** staan
twee knoppen:

| | inhoud | grootte |
|---|---|---|
| **ALLES** | alle geluiden | ~31 MB |
| **ALLEEN KORTE** | zonder de lange nummers | ~9 MB |

Beide leveren één HTML-bestand met de code, de stijl, de lettertypes en de
audio als ingebakken data-urls. Geen server, geen service worker, geen cache.
Zet het op je telefoon en open het vanuit je bestanden: het werkt zonder enige
verbinding, ook op een toestel dat de site nog nooit heeft gezien.

**Het is een export van jóuw bord.** De namen, kleuren, volgorde, lege plekken,
het palet, de vulstijl, het archief, de kopieën en hun uitsnedes gaan mee. Bij
het openen op een schoon toestel staat alles er precies zo bij als bij jou.
Pas je daarna in het pakket iets aan, dan is dat van jou: de ingebakken versie
overschrijft je eigen wijzigingen niet meer. Daarmee is het pakket meteen de
makkelijkste manier om een bord te delen.

**ALLEEN KORTE** laat de lange nummers weg — behalve die waar een kopie op
staat, want dat fragment zou anders niet werken. De knoppen die eruit vallen
worden lege plekken in het rooster; de rest schuift niet op.

De app bouwt het ter plekke uit wat er op dat moment in staat, dus het is
altijd actueel. Hetzelfde kan vanaf de opdrachtregel, eventueel met een
geëxporteerd profiel als bord:

```bash
python3 tools/build_offline.py
BORD=~/Downloads/soundboard-profiel.json python3 tools/build_offline.py
```

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
| Knopgrootte | 48 tot 200 px, per pixel, met zes presets van Micro tot XXL |
| Kolommen | Auto of een vast aantal van 1 tot 6 |
| Lettertype | 8 lettertypes |
| Tekstgrootte | 50 tot 200 %, per procent, met vijf presets |

Een palet zet de kleur van alle knoppen opnieuw. Wil je één knop een eigen
kleur geven, zet dan het slotje open en tik die knop aan.

### Precies instellen

Knopgrootte en tekstgrootte hebben allebei een schuif met een **−** en een
**+** ernaast. De schuif is voor grof werk, de knopjes voor de laatste paar
stappen: op een aanraakscherm sleep je nooit precies op een pixel.

De maat in pixels is de maat die je krijgt. Het raster maakt kolommen die
precies zo breed zijn als je hebt ingesteld en zet ze gecentreerd; wat
overblijft valt als gelijke marge aan weerskanten. Eerder rekten de knoppen
uit tot de rand, en dan bepaalde de breedte van je scherm de maat: de schuif
deed dan pas iets op het moment dat er een kolom bij of af sprong. Alleen als
je een vast aantal kolommen kiest dat niet past, krimpen de knoppen alsnog —
zes van 60 px passen nu eenmaal niet op 390 px scherm.

Onder de 48 px kan niet: daaronder is een knop te klein om met een duim te
raken. Icoon en label groeien mee met de knop, waarbij het label bewust wat
achterblijft — tekst hoeft niet twee keer zo groot als de knop twee keer zo
groot wordt. De tekstgrootte staat daar los van, dus kleine letters onder
grote knoppen kan ook.

## Video

Een knop kan ook een video zijn. Die staat gewoon tussen de andere knoppen,
met een afspeel-icoon en een klein hoekje rechtsboven.

**Voordat hij begint wordt het gevraagd.** Een video per ongeluk starten
midden in een speech is een stuk vervelender dan een geluidje; er komt dus
eerst een schermpje met NEE en AFSPELEN.

**Wat er speelde wordt onthouden.** Bij het starten wordt genoteerd wat er
liep en hoe ver het was, en dat faadt weg. Sluit je de video, dan pakt het
de draad weer op op precies dat punt — ook halverwege een nummer.

**Beeldvullend, met de juiste verhoudingen.** Een liggende video op een
staand scherm wordt een kwartslag gedraaid, knoppen en al: dat scheelt bijna
een factor twee in beeldgrootte. Kantel je toestel en het staat goed. Draait
het scherm zelf mee (Android kan dat vastzetten), dan gaat onze eigen draai
er weer af. Waar het kan wordt ook de fullscreen-api aangeroepen om de
browserbalken kwijt te raken; op iOS bestaat die voor een gewone laag niet,
maar daar is de laag zelf al het hele scherm.

**Bediening:** tik ergens om te pauzeren of verder te gaan, een balk onderin
om doorheen te schuiven, een kruisje rechtsboven om af te sluiten. Na een
paar seconden spelen vallen de knoppen weg; raak het scherm aan en ze zijn
terug. Aan het eind sluit de speler vanzelf. De speech-timer loopt gewoon
door.

**Het geluid gaat door dezelfde keten** als de rest: de gemeten correctie,
het mastervolume en de limiter. Een video klinkt dus niet ineens harder of
zachter dan een geluidje. De video zit ook altijd in het noodpakket.

Aanleveren gaat zoals bij audio: zet het bestand in `video/` en draai
`analyze_loudness.py` en `sync_manifest.py`. Het manifest krijgt dan
`"kind": "video"` plus de afmetingen. Video's worden altijd gestreamd — ze
vooraf decoderen naar een audiobuffer zou het beeld toch niet meebrengen.

**Formaat: mp4 met h264 en aac.** Dat is het enige dat op elke telefoon
speelt. Let op de bitrate van wat je aanlevert: de eerste video kwam binnen
op 8 Mbit/s (29,6 MB voor 29 seconden). Opnieuw gecodeerd op crf 23 werd dat
5,1 MB met een SSIM van 0,986 tegenover het origineel — op een telefoon niet
van elkaar te onderscheiden.

## Korte geluiden en lange nummers

Een minuut gedecodeerde stereo kost ongeveer 22 MB werkgeheugen. Met vier
volledige nummers erbij zou de soundboard richting 300 MB gaan, en dat is op
een telefoon vragen om een tab die halverwege je speech wordt weggegooid.

Daarom twee routes, op duur gescheiden:

| | korter dan 60s | langer dan 60s |
|---|---|---|
| hoe | vooraf gedecodeerd naar geheugen | gestreamd uit een audio-element |
| geheugen | ~26 MB voor alle korte geluiden samen | vrijwel niets |
| vertraging bij indrukken | nul | ongeveer 80 ms |
| nog eens indrukken | stapelt over het lopende geluid heen | begint opnieuw vanaf 0 |

De grens staat in `tools/sync_manifest.py` (`STREAM_BOVEN_SECONDEN`) en komt als
`"stream": true` in `data/sounds.json` terecht. Waar het ertoe doet — de korte
klappers die je op een clou indrukt — is er dus nul vertraging en kun je
stapelen. Bij een nummer van drie minuten merk je die 80 ms niet, en stapelen
wil je daar toch niet.

De service worker snijdt voor gestreamde bestanden zelf het gevraagde stuk uit
de opgeslagen kopie en antwoordt met een 206, zodat doorspoelen werkt en alles
ook zonder internet blijft spelen.

Hoeveel een browser van een gestreamd bestand vooruit laadt bepaalt hij zelf,
en op mobiel is dat zuinig. **Instellingen &rarr; Offline klaarzetten** haalt
daarom elk bestand in zijn geheel op en zet het in de cache. Daarna staat alles
gegarandeerd lokaal, ook het einde van een nummer van drie minuten.

## Lange nummers terugvinden

Zodra er een lang nummer speelt verschijnt er een balk boven de bediening: de
naam, hoe ver je bent, een schuif over het hele nummer en knoppen voor 15
seconden terug of vooruit.

Zet je een nummer per ongeluk stil — met STOP, met de fade of met de pauze —
dan onthoudt de soundboard waar je was. De balk blijft staan en één druk op
afspelen pakt de draad daar weer op. Een tik op de knop zelf begint gewoon
weer vooraan, zodat dat voorspelbaar blijft.

De balk verschijnt alleen bij de gestreamde nummers; korte geluiden laten hem
met rust. Wegklikken kan met het kruisje, en hij komt terug zodra je weer een
nummer start.

## Bijsnijden en oppoetsen

In het bewerkscherm van een knop staat de golfvorm van het geluid. Sleep de
twee grepen om het begin en eind te verleggen; **STILTE ERAF** zoekt de randen
zelf op en **ALLES** zet het weer helemaal open.

Er wordt niets uit het bestand geknipt. De bijsnijding is een begin- en
eindpunt in je instellingen: een kort geluid start met die offset, een
gestreamd nummer springt ernaartoe en stopt op het eindpunt. Dus altijd
terug te draaien, en het reist mee in je geëxporteerde profiel.

De golfvormen worden vooraf uitgerekend door `tools/sync_manifest.py` en staan
als 240 punten per geluid in `data/sounds.json`. Zo hoeft de app geen nummer
van drie minuten te decoderen alleen om een plaatje te kunnen tekenen.

**Oppoetsen** zet twee filters per geluid in de keten: een hoogdoorlaat tegen
gerommel en gebrom, en een accent rond 3 kHz voor helderheid. Met presets van
uit tot stem scherp, of zelf schuiven.

Wat dit **niet** kan: muziek of een tweede stem uit een fragment halen. Dat is
bronscheiding, en dat vraagt een getraind model in plaats van een filter.

## Meerdere fragmenten uit één opname

In het bewerkscherm van een knop staat **KOPIE MAKEN**. Dat zet een tweede
knop op hetzelfde geluid, met een eigen naam, kleur, icoon en uitsnede. Zo
haal je uit één lange opname zoveel losse knoppen als je wilt.

Het geluid wordt maar één keer opgehaald en gedecodeerd; alle kopieën delen
diezelfde buffer. Tien fragmenten uit een opname van drie minuten kosten dus
evenveel geheugen als één.

Een kopie speelt altijd uit het geheugen, ook als het origineel gestreamd
wordt. Een fragment is kort en moet direct klinken.

Kopieën staan in je instellingen, niet in het manifest. Ze reizen mee in je
geëxporteerde profiel, maar niet naar een ander apparaat of naar het
noodpakket. Wil je ze definitief maken, laat de tijdstippen dan als losse
bestanden uitknippen.

## Wegdrukken

Het nieuwste geluid houdt zijn volle volume; alles wat al liep zakt weg met
de ingestelde hoeveelheid (standaard 12 dB) en komt terug zodra het nieuwe
klaar is. Wegzakken duurt 180 ms, terugkomen 450 ms.

Knoppen die je binnen 300 ms van elkaar indrukt tellen als één moment, zodat
een bewuste dubbele aanslag zichzelf niet wegdrukt.

Elke stem heeft hiervoor een eigen gain-trap, los van die voor het uitfaden.
Anders zouden een lopende fade en een wegdrukking dezelfde waarde zitten
verzetten, en dan wint de laatste die begon.

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
| TOPPUNT | 0.8s | -2.32 | -13.68 dB |
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
| ALS GE DIT ZIET | 6.0s | -16.77 | +0.77 dB |
| CLIP 1 | 1.1s | -20.35 | +4.35 dB |
| CLIP 2 | 1.5s | -20.9 | +4.90 dB |
| CLIP 3 | 1.8s | -18.58 | +2.58 dB |
| CLIP 4 | 1.5s | -15.43 | -0.57 dB |
| CLIP 5 | 1.2s | -19.91 | +3.91 dB |
| TYPE | 0.7s | -18.06 | +2.06 dB |
| LOYAL FRIENDS | 159.6s | -13.9 | -2.10 dB |
| DIAMONDS | 208.8s | -13.59 | -2.41 dB |
| FORTUNA | 188.2s | -14.37 | -1.63 dB |
| FORTUNA 2 | 181.2s | -13.13 | -2.87 dB |
| PIAN DI CASCINA | 183.4s | -17.83 | +1.83 dB |
| PIAN DI CASCINA 1 | 10.6s | -17.83 | +1.83 dB |
| 11 STEDEN | 13.5s | -17.11 | +1.11 dB |
| REAL LIFE (video) | 29.1s | -32.43 | +16.43 dB |

## Opbouw

```
index.html              opbouw van de pagina
css/style.css           synthwave-stijl, mobiel eerst
css/fonts.css           de lettertypes, uit fonts/ in plaats van bij Google
fonts/                  de woff2-bestanden (latijnse uitsnede, 126 kB totaal)
video/                  de video's (mp4, h264 + aac)
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
Ook de lettertypes komen van de site zelf en niet van Google, zodat het bord er
zonder netwerk uitziet zoals het hoort.

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
