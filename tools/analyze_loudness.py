#!/usr/bin/env python3
"""
Meet de waargenomen luidheid (EBU R128 / ITU-R BS.1770-4) van elk audiobestand
en schrijf per geluid een gain-correctie weg naar data/loudness.json.

De audiobestanden zelf worden NIET aangeraakt: er wordt niets gehercodeerd,
dus er gaat geen kwaliteit verloren. De soundboard past de gemeten gain
tijdens het afspelen toe in de Web Audio-grafiek.

Gebruik:  python3 tools/analyze_loudness.py [--target -16.0]
"""
import argparse, glob, json, os, sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "audio")
OUT = os.path.join(ROOT, "data", "loudness.json")

# Hoeveel de automatische correctie maximaal mag bij- of afregelen.
MAX_BOOST_DB = 18.0
MAX_CUT_DB = 24.0

# Piekplafond na correctie, in dBFS. Korte, knallende geluiden (rimshots) hebben
# een lage gemiddelde luidheid maar hoge pieken; zonder plafond duwt de
# correctie die pieken ver over 0 dBFS. Web Audio rekent intern in float, dus
# een klein beetje overschrijding is prima: de limiter op de master vangt het
# op, en 3 dB terugregelen op een transient is nauwelijks hoorbaar.
PEAK_CEILING_DB = 3.0


def momentary_max(data, rate, window=0.4):
    """Hoogste momentane luidheid (400 ms). Zegt iets over de 'klap' van een
    geluid, waar de integrale luidheid vooral het gemiddelde weergeeft."""
    n = int(window * rate)
    if data.shape[0] < n:
        return None
    meter = pyln.Meter(rate, block_size=window)
    step = max(1, n // 4)
    vals = [meter.integrated_loudness(data[s:s + n])
            for s in range(0, data.shape[0] - n + 1, step)]
    vals = [v for v in vals if np.isfinite(v)]
    return round(max(vals), 2) if vals else None


def measure(path):
    data, rate = sf.read(path, always_2d=True)
    mono_peak = float(np.max(np.abs(data))) if data.size else 0.0

    meter = pyln.Meter(rate)  # EBU R128, 400 ms blokken, 75% overlap
    loudness = float(meter.integrated_loudness(data))

    return {
        "momentaryMax": momentary_max(data, rate),
        "sampleRate": rate,
        "channels": data.shape[1],
        "duration": round(data.shape[0] / rate, 3),
        "lufs": None if np.isneginf(loudness) else round(loudness, 2),
        "peak": round(mono_peak, 5),
        "peakDb": round(20 * np.log10(mono_peak), 2) if mono_peak > 0 else -120.0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=float, default=-16.0,
                    help="doelluidheid in LUFS (standaard -16)")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(AUDIO_DIR, "*.mp3")) +
                   glob.glob(os.path.join(AUDIO_DIR, "*.ogg")) +
                   glob.glob(os.path.join(AUDIO_DIR, "*.wav")) +
                   glob.glob(os.path.join(AUDIO_DIR, "*.m4a")))
    if not files:
        sys.exit("Geen audiobestanden gevonden in audio/")

    result = {"target": args.target, "peakCeiling": PEAK_CEILING_DB, "sounds": {}}
    print(f"Doelluidheid: {args.target} LUFS\n")
    print(f"{'bestand':30s} {'duur':>8s} {'LUFS':>8s} {'piek dB':>8s} "
          f"{'gain dB':>8s} {'piek na':>8s}")
    print("-" * 78)

    for path in files:
        name = os.path.basename(path)
        m = measure(path)

        if m["lufs"] is None:          # volledig stil bestand
            gain_db = 0.0
        else:
            gain_db = args.target - m["lufs"]
            gain_db = max(-MAX_CUT_DB, min(MAX_BOOST_DB, gain_db))
            # Nooit verder opdraaien dan het piekplafond toelaat.
            gain_db = min(gain_db, PEAK_CEILING_DB - m["peakDb"])

        peak_after = m["peakDb"] + gain_db
        result["sounds"][name] = {
            "lufs": m["lufs"],
            "momentaryMax": m["momentaryMax"],
            "peakDb": m["peakDb"],
            "gainDb": round(gain_db, 2),
            "peakAfterDb": round(peak_after, 2),
            "duration": m["duration"],
            "sampleRate": m["sampleRate"],
            "channels": m["channels"],
        }
        print(f"{name:30s} {m['duration']:7.2f}s {str(m['lufs']):>8s} "
              f"{m['peakDb']:8.2f} {gain_db:8.2f} {peak_after:8.2f}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"\nGeschreven naar {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
