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
- **Zelf aan te passen.** Lettertype, tekstgrootte, kleurenpalet, knopgrootte,
  aantal kolommen, volgorde, icoon per knop, kleur per knop en volume per knop
  — allemaal met presets, alles wordt bewaard in je browser.
- **Lege plekken in het rooster.** De indeling is een rooster van plekken die
  ook leeg mogen zijn, dus je kunt bijvoorbeeld het midden van een rij van drie
  openlaten.
- **Werkt offline.** Na één keer laden draait de soundboard zonder internet.
  Op je telefoon kun je hem aan je beginscherm toevoegen.

## Bediening

| | |
|---|---|
| Knop indrukken | geluid afspelen (stapelt) |
| Fade-knopje op een spelende knop | alleen dat geluid uitfaden |
| **STOP** | alles uitfaden |
| **Slotje** | bewerkmodus aan/uit |
| Knop aantikken in bewerkmodus | naam, icoon, kleur, volume en plek aanpassen |
| Knop naar een lege plek slepen | verhuist daarheen, oude plek blijft open |
| Knop op een andere knop slepen | die twee wisselen om |
| Timer aantikken | starten / pauzeren |

Buiten de bewerkmodus kun je niets per ongeluk verslepen of veranderen, en zijn
lege plekken onzichtbaar — ze houden hun ruimte wel vast, zodat de indeling
blijft staan zoals je hem hebt gemaakt.

In de bewerkmodus staan er onder je knoppen altijd een paar lege plekken klaar
om naartoe te slepen. Lege plekken haal je in één keer weg via
**Instellingen → Lege plekken → Lege plekken opruimen**. Ze werken het best met
een vast aantal kolommen; op AUTO schuift het rooster mee met de schermbreedte.

## Geluiden toevoegen of vervangen

1. Zet het audiobestand (`.mp3`, `.ogg`, `.wav` of `.m4a`) in `audio/`.
2. Meet de luidheid en werk het manifest bij:

   ```bash
   pip install numpy soundfile pyloudnorm
   python3 tools/analyze_loudness.py     # schrijft data/loudness.json
   python3 tools/sync_manifest.py        # werkt data/sounds.json bij
   ```

3. Commit en push. GitHub Actions publiceert de site opnieuw.

`sync_manifest.py` laat bestaande namen, iconen, kleuren en volgorde met rust en
zet nieuwe bestanden onderaan met een automatisch gekozen icoon. De naam en het
icoon van een nieuwe knop pas je daarna gewoon in de app zelf aan.

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

Gemeten waarden bij oplevering:

| geluid | LUFS | correctie |
|---|---|---|
| BA DUM TSS | −19.85 | +3.85 dB |
| BA DUM TSS 2 | −21.68 | +3.84 dB |
| DIT IS DE ROAST | −13.25 | −2.75 dB |
| CODETAAL QUIZ | −13.59 | −2.41 dB |
| CODETAAL QUIZ 2 | −13.57 | −2.43 dB |
| LOYAL FRIENDS | −13.90 | −2.10 dB |
| DIAMONDS | −13.59 | −2.41 dB |

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
