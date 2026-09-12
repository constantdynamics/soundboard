#!/usr/bin/env python3
"""
Meet de waargenomen luidheid (EBU R128 / ITU-R BS.1770-4) van elk audiobestand
en schrijf per geluid een gain-correctie weg naar data/loudness.json.

De audiobestanden zelf worden NIET aangeraakt: er wordt niets gehercodeerd,
dus er gaat geen kwaliteit verloren. De soundboard past de gemeten gain
tijdens het afspelen toe in de Web Audio-grafiek.

Gebruik:  python3 tools/analyze_loudness.py [--target -16.0]
"""
import argparse, glob, json, os, subprocess, sys, tempfile

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "audio")
OUT = os.path.join(ROOT, "data", "loudness.json")

# Hoeveel de automatische correctie maximaal mag bij- of afregelen.
MAX_BOOST_DB = 24.0
MAX_CUT_DB = 24.0

# Piekplafond na correctie, in dBFS. Korte, knallende geluiden (rimshots) hebben
# een lage gemiddelde luidheid maar hoge pieken; zonder plafond duwt de
# correctie die pieken ver over 0 dBFS. Web Audio rekent intern in float, dus
# een klein beetje overschrijding is prima: de limiter op de master vangt het
# op, en 3 dB terugregelen op een transient is nauwelijks hoorbaar.
PEAK_CEILING_DB = 3.0

# Het plafond kijkt naar het 99,9e percentiel en niet naar de absolute piek.
# Anders blokkeert een enkele losse tik - zoals de begintransient van een
# videobestand - de correctie voor de hele opname. Bij normaal materiaal
# schelen die twee minder dan een paar dB; bij zo'n uitschieter tientallen.
PEAK_PERCENTILE = 99.9


def ffmpeg_exe():
    """Pad naar een ffmpeg-binary, of None."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        from shutil import which
        return which("ffmpeg")


def read_audio(path):
    """Leest een bestand als (samples, samplerate).

    libsndfile kan geen AAC, dus voor .m4a en .mp4 wordt er via ffmpeg naar
    een tijdelijke wav gedecodeerd. Het bestand in audio/ blijft onaangeroerd;
    de tijdelijke kopie is alleen om te meten."""
    try:
        return sf.read(path, always_2d=True)
    except Exception:
        pass

    ff = ffmpeg_exe()
    if not ff:
        raise RuntimeError(f"kan {os.path.basename(path)} niet lezen en ffmpeg ontbreekt")

    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "meten.wav")
        subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y",
                        "-i", path, "-vn", "-map", "0:a:0",
                        "-c:a", "pcm_f32le", wav],
                       check=True)
        return sf.read(wav, always_2d=True)


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
    data, rate = read_audio(path)
    mono_peak = float(np.max(np.abs(data))) if data.size else 0.0
    per_sample = np.abs(data).max(axis=1) if data.size else np.zeros(1)
    work_peak = float(np.percentile(per_sample, PEAK_PERCENTILE))

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
        "workPeakDb": round(20 * np.log10(work_peak), 2) if work_peak > 0 else -120.0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=float, default=-16.0,
                    help="doelluidheid in LUFS (standaard -16)")
    args = ap.parse_args()

    files = sorted(p for p in glob.glob(os.path.join(AUDIO_DIR, "*"))
                   if p.lower().endswith((".mp3", ".ogg", ".wav", ".m4a", ".aac", ".opus")))
    if not files:
        sys.exit("Geen audiobestanden gevonden in audio/")

    result = {"target": args.target, "peakCeiling": PEAK_CEILING_DB, "sounds": {}}
    print(f"Doelluidheid: {args.target} LUFS\n")
    print(f"{'bestand':26s} {'duur':>8s} {'LUFS':>8s} {'piek':>7s} {'p99.9':>7s} "
          f"{'gain dB':>8s} {'LUFS na':>8s}")
    print("-" * 80)
    tekort = []

    for path in files:
        name = os.path.basename(path)
        m = measure(path)

        if m["lufs"] is None:          # volledig stil bestand
            gain_db = 0.0
        else:
            gain_db = args.target - m["lufs"]
            gain_db = max(-MAX_CUT_DB, min(MAX_BOOST_DB, gain_db))
            # Nooit verder opdraaien dan het piekplafond toelaat.
            gain_db = min(gain_db, PEAK_CEILING_DB - m["workPeakDb"])

        peak_after = m["peakDb"] + gain_db
        result["sounds"][name] = {
            "lufs": m["lufs"],
            "momentaryMax": m["momentaryMax"],
            "peakDb": m["peakDb"],
            "workPeakDb": m["workPeakDb"],
            "gainDb": round(gain_db, 2),
            "peakAfterDb": round(peak_after, 2),
            "duration": m["duration"],
            "sampleRate": m["sampleRate"],
            "channels": m["channels"],
        }
        na = (m["lufs"] + gain_db) if m["lufs"] is not None else 0.0
        if m["lufs"] is not None and na < args.target - 2:
            tekort.append((name, round(na, 2)))
        print(f"{name:26s} {m['duration']:7.2f}s {str(m['lufs']):>8s} "
              f"{m['peakDb']:7.2f} {m['workPeakDb']:7.2f} {gain_db:8.2f} {na:8.2f}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")
    if tekort:
        print("\nLet op: deze halen de doelluidheid niet met alleen gain:")
        for naam, na in tekort:
            print(f"  {naam} blijft op {na} LUFS steken")
    print(f"\nGeschreven naar {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
