#!/usr/bin/env python3
"""
Bouwt één HTML-bestand met alles erin: de code, de stijl, het manifest en
alle audio als ingebakken data-urls.

Zo'n bestand heeft geen server, geen service worker en geen cache nodig. Je
zet het op je telefoon en het werkt, ook als er nergens een netwerk is. Dat
is de enige vorm waarin je een soundboard echt honderd procent kunt
garanderen: er valt niets meer weg te vallen.

Gebruik:  python3 tools/build_offline.py [uitvoer.html]
"""
import base64, json, mimetypes, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = ["js/manifest.js", "js/icons.js", "js/settings.js",
           "js/audio.js", "js/ui.js", "js/app.js"]


def lees(pad):
    with open(os.path.join(ROOT, pad), encoding="utf-8") as f:
        return f.read()


def audio_blok():
    """Alle audio als data-urls, gesleuteld op de bestandsnaam. Kopieen
    (meerdere knoppen op een opname) komen zo bij hetzelfde geluid uit."""
    manifest = json.load(open(os.path.join(ROOT, "data", "sounds.json")))
    regels, totaal, gezien = [], 0, set()
    for e in manifest["sounds"]:
        if e["file"] in gezien:
            continue
        map_ = "video" if e.get("kind") == "video" else "audio"
        pad = os.path.join(ROOT, map_, e["file"])
        if not os.path.exists(pad):
            print(f"  overgeslagen (niet gevonden): {e['file']}")
            continue
        gezien.add(e["file"])
        soort = mimetypes.guess_type(pad)[0] or "audio/mpeg"
        with open(pad, "rb") as f:
            rauw = f.read()
        totaal += len(rauw)
        b64 = base64.b64encode(rauw).decode("ascii")
        regels.append(f'  {json.dumps(e["file"])}: "data:{soort};base64,{b64}"')
        print(f"  {e['label']:24s} {len(rauw)/1024:8.0f} kB")
    print(f"  {'-'*24} {totaal/1048576:8.1f} MB aan audio")
    return "window.AUDIO_DATA = {\n" + ",\n".join(regels) + "\n};\n"


def main():
    uit = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        ROOT, "The Big Fat Speech Soundboard (noodpakket).html")

    html = lees("index.html")

    # stijl erin
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        "<style>\n" + lees("css/style.css") + "\n</style>")

    # de letters erin, als data-urls
    fonts = lees("css/fonts.css")
    for rel in sorted(set(re.findall(r"url\((\.\./fonts/[^)]+)\)", fonts))):
        pad = os.path.join(ROOT, rel.replace("../", ""))
        with open(pad, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        fonts = fonts.replace(rel, "data:font/woff2;base64," + b64)
    html = html.replace('<link rel="stylesheet" href="css/fonts.css">',
                        "<style>\n" + fonts + "\n</style>")

    # losse verwijzingen die zonder server nergens op slaan
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">', "")
    html = html.replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">', "")

    # scripts erin, met de audio ervoor
    # geen service worker: die kan niet vanaf een los bestand, en is hier ook
    # nergens voor nodig - alles zit al in de pagina
    blok = "<script>window.NO_SW = true;</script>\n"
    bord = os.environ.get("BORD")
    if bord and os.path.exists(bord):
        with open(bord, encoding="utf-8") as f:
            profiel = json.load(f)
        instellingen = profiel.get("settings", profiel)
        blok += ("<script>window.PRESET_SETTINGS = "
                 + json.dumps(instellingen, ensure_ascii=False).replace("<", "\\u003c")
                 + ";</script>\n")
        print(f"  bord ingebakken uit {os.path.basename(bord)}")
    blok += "<script>\n" + audio_blok() + "</script>\n"
    for pad in SCRIPTS:
        blok += "<script>\n" + lees(pad) + "\n</script>\n"
        if pad == "js/manifest.js":
            blok += ("<script>window.SOUNDS.sounds = window.SOUNDS.sounds"
                     ".filter(function (d) { return !!window.AUDIO_DATA[d.file]; });"
                     "</script>\n")

    for pad in SCRIPTS:
        html = html.replace(f'<script src="{pad}"></script>', "")
    html = html.replace("</body>", blok + "</body>")

    html = html.replace("<title>The Big Fat Speech Soundboard</title>",
                        "<title>The Big Fat Speech Soundboard — noodpakket</title>")

    with open(uit, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\nGeschreven: {os.path.basename(uit)}  ({os.path.getsize(uit)/1048576:.1f} MB)")
    print("Zet dit bestand op je telefoon. Openen kan zonder enige verbinding.")


if __name__ == "__main__":
    main()
