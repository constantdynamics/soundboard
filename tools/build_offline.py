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
import base64, mimetypes, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = ["js/manifest.js", "js/icons.js", "js/settings.js",
           "js/audio.js", "js/ui.js", "js/app.js"]


def lees(pad):
    with open(os.path.join(ROOT, pad), encoding="utf-8") as f:
        return f.read()


def audio_blok():
    """Alle audio als data-urls, gesleuteld op het id uit het manifest."""
    import json
    manifest = json.load(open(os.path.join(ROOT, "data", "sounds.json")))
    regels, totaal = [], 0
    for e in manifest["sounds"]:
        pad = os.path.join(ROOT, "audio", e["file"])
        if not os.path.exists(pad):
            print(f"  overgeslagen (niet gevonden): {e['file']}")
            continue
        soort = mimetypes.guess_type(pad)[0] or "audio/mpeg"
        with open(pad, "rb") as f:
            rauw = f.read()
        totaal += len(rauw)
        b64 = base64.b64encode(rauw).decode("ascii")
        regels.append(f'  "{e["id"]}": "data:{soort};base64,{b64}"')
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

    # losse verwijzingen die zonder server nergens op slaan
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">', "")
    html = html.replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">', "")

    # scripts erin, met de audio ervoor
    blok = "<script>\n" + audio_blok() + "</script>\n"
    for pad in SCRIPTS:
        code = lees(pad)
        if pad == "js/app.js":
            # geen service worker: die kan niet vanaf een los bestand, en is
            # hier ook nergens voor nodig - alles zit al in de pagina
            code = re.sub(r"  if \('serviceWorker' in navigator\) \{.*?\n  \}\n",
                          "  /* service worker weggelaten: niet nodig in het noodpakket */\n",
                          code, flags=re.S)
        blok += "<script>\n" + code + "\n</script>\n"

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
