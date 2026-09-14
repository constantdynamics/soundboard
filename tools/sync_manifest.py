#!/usr/bin/env python3
"""
Bouwt/actualiseert data/sounds.json: de lijst met knoppen die de soundboard
inlaadt. Bestaande handmatige aanpassingen (label, icoon, kleur, volgorde)
blijven staan; alleen de gemeten gain wordt bijgewerkt en nieuwe
audiobestanden worden onderaan toegevoegd.

Werkwijze bij een nieuw geluid:
    1. zet het bestand in audio/
    2. python3 tools/analyze_loudness.py
    3. python3 tools/sync_manifest.py
"""
import glob, hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "audio")
LOUDNESS = os.path.join(ROOT, "data", "loudness.json")
MANIFEST = os.path.join(ROOT, "data", "sounds.json")

# Geluiden langer dan dit worden gestreamd in plaats van vooraf gedecodeerd.
# Een gedecodeerde minuut stereo kost ongeveer 22 MB werkgeheugen; met een
# handvol volledige nummers loopt dat op tot honderden megabytes, en dat is op
# een telefoon vragen om een tab die halverwege je speech wordt weggegooid.
# Korte geluiden blijven wel vooraf gedecodeerd: daar telt elke milliseconde.
STREAM_BOVEN_SECONDEN = 60.0

# Neonkleuren waar nieuwe knoppen doorheen roteren.
PALETTE = ["#ff2d95", "#00e5ff", "#b14aff", "#ffd400",
           "#39ff88", "#ff6a00", "#2f6bff", "#ff3355"]

# Trefwoord -> icoon, voor een automatische eerste gok bij nieuwe bestanden.
GUESS = [
    (r"ba.?dum|rimshot|tss|drum", "drum"),
    (r"roast|burn|diss", "fire"),
    (r"quiz|vraag|question", "question"),
    (r"applaus|clap|applause", "clap"),
    (r"lach|laugh|funny|grap", "laugh"),
    (r"boo|buh|sad", "sad"),
    (r"alarm|siren|police", "siren"),
    (r"bel|bell|ding|correct|goed", "bell"),
    (r"fout|wrong|error|buzz", "cross"),
    (r"diamond|juweel", "diamond"),
    (r"friend|loyal|love|hart", "heart"),
    (r"win|trophy|champion", "trophy"),
    (r"feest|party|confetti", "confetti"),
    (r"krekel|cricket|stilte", "bug"),
]


# Aantal punten in de golfvorm die de app tekent. Genoeg detail om een woord
# te herkennen, klein genoeg om in het manifest te passen.
GOLF_PUNTEN = 240


def waveform(path):
    """Pieken per tijdvak, als gehele getallen 0-100. Vooraf uitrekenen
    scheelt de app het decoderen van een nummer van drie minuten alleen om
    een plaatje te kunnen tekenen."""
    try:
        import numpy as np
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from analyze_loudness import read_audio
        data, _ = read_audio(path)
        mono = np.abs(data).max(axis=1)
        vakken = np.array_split(mono, GOLF_PUNTEN)
        pieken = np.array([v.max() if len(v) else 0.0 for v in vakken])
        top = pieken.max() or 1.0
        return [int(round(v / top * 100)) for v in pieken]
    except Exception as e:
        print(f"  (golfvorm van {os.path.basename(path)} mislukt: {e})")
        return None


def file_hash(path):
    """Korte hash van de inhoud. Die hangt in de url achter het bestand, zodat
    een vervangen geluid een nieuwe url krijgt en de browser hem opnieuw
    ophaalt in plaats van de opgeslagen versie te blijven gebruiken."""
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for blok in iter(lambda: f.read(65536), b""):
            h.update(blok)
    return h.hexdigest()[:10]


def slugify(name):
    s = re.sub(r"\.[A-Za-z0-9]+$", "", name).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "geluid"


def labelize(name):
    s = re.sub(r"\.[A-Za-z0-9]+$", "", name)
    s = re.sub(r"[_\-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.upper()


def guess_icon(name):
    low = name.lower()
    for pattern, icon in GUESS:
        if re.search(pattern, low):
            return icon
    return "wave"


def main():
    if not os.path.exists(LOUDNESS):
        sys.exit("data/loudness.json ontbreekt — draai eerst analyze_loudness.py")
    loud = json.load(open(LOUDNESS))["sounds"]

    manifest = {"sounds": []}
    if os.path.exists(MANIFEST):
        manifest = json.load(open(MANIFEST))
    by_file = {s["file"]: s for s in manifest["sounds"]}

    files = sorted(os.path.basename(p) for p in glob.glob(os.path.join(AUDIO_DIR, "*"))
                   if p.lower().endswith((".mp3", ".ogg", ".wav", ".m4a")))

    out, added = [], 0
    for entry in manifest["sounds"]:                  # bestaande volgorde eerst
        if entry["file"] in files:
            out.append(entry)
    for name in files:                                # daarna het nieuwe werk
        if name in by_file:
            continue
        out.append({
            "id": slugify(name),
            "file": name,
            "label": labelize(name),
            "icon": guess_icon(name),
            "color": PALETTE[(len(out)) % len(PALETTE)],
        })
        added += 1

    for entry in out:                                 # meting en hash doorzetten
        m = loud.get(entry["file"])
        if m:
            entry["gainDb"] = m["gainDb"]
            entry["duration"] = m["duration"]
        pad = os.path.join(AUDIO_DIR, entry["file"])
        if os.path.exists(pad):
            entry["hash"] = file_hash(pad)
            golf = waveform(pad)
            if golf:
                entry["peaks"] = golf
        if entry.get("duration", 0) > STREAM_BOVEN_SECONDEN:
            entry["stream"] = True
        else:
            entry.pop("stream", None)

    manifest["sounds"] = out
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"{len(out)} geluiden in data/sounds.json ({added} nieuw)")
    for e in out:
        print(f"  {e['label']:26s} {e['icon']:10s} {e['color']}  {e.get('gainDb', 0):+.2f} dB")


if __name__ == "__main__":
    main()
