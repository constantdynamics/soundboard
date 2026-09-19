#!/usr/bin/env python3
"""
Normaliseert één audiobestand offline met ffmpeg loudnorm (EBU R128).

Normaal gesproken raken we de audiobestanden niet aan: de gemeten correctie
wordt tijdens het afspelen als gain toegepast, zodat er geen kwaliteit
verloren gaat. Dat werkt alleen zolang de correctie redelijk blijft.

Een opname die tientallen dB te stil is red je daar niet mee: de gain wordt
begrensd, en de enkele losse piek die er wel in zit zou de limiter op de
master vol open trekken. Voor zo'n bestand is een eenmalige offline ronde met
loudnorm beter - die regelt de luidheid én begrenst de ware piek netjes.

Gebruik:  python3 tools/normalize_file.py audio/bestand.m4a [--target -16]
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        from shutil import which
        exe = which("ffmpeg")
        if not exe:
            sys.exit("ffmpeg niet gevonden (pip install imageio-ffmpeg)")
        return exe


def measure(ff, path, target, tp, lra):
    """Eerste ronde: meten wat erin zit."""
    out = subprocess.run(
        [ff, "-hide_banner", "-i", path,
         "-af", f"loudnorm=I={target}:TP={tp}:LRA={lra}:print_format=json",
         "-f", "null", "-"],
        capture_output=True, text=True).stderr
    blob = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", out, re.S)
    if not blob:
        sys.exit("loudnorm gaf geen meetwaarden terug:\n" + out[-800:])
    return json.loads(blob.group(0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bestand")
    ap.add_argument("--target", type=float, default=-16.0)
    ap.add_argument("--true-peak", type=float, default=-1.5)
    ap.add_argument("--lra", type=float, default=11.0)
    ap.add_argument("--bitrate", default="128k")
    args = ap.parse_args()

    src = os.path.abspath(args.bestand)
    if not os.path.exists(src):
        sys.exit(f"{args.bestand} bestaat niet")
    ff = ffmpeg_exe()

    m = measure(ff, src, args.target, args.true_peak, args.lra)
    print(f"gemeten : {m['input_i']} LUFS, ware piek {m['input_tp']} dBTP, "
          f"bereik {m['input_lra']} LU")

    ext = os.path.splitext(src)[1].lower()
    film = ext in (".mp4", ".m4v", ".mov", ".webm")
    codec = ["-c:a", "libmp3lame", "-b:a", args.bitrate] if ext == ".mp3" \
        else ["-c:a", "aac", "-b:a", args.bitrate]
    # Bij een video blijft het beeld ongemoeid: alleen het geluidsspoor gaat
    # door loudnorm, de videostroom wordt letterlijk overgeschreven.
    beeld = ["-c:v", "copy", "-map", "0:v:0", "-map", "0:a:0",
             "-movflags", "+faststart"] if film else []

    with tempfile.TemporaryDirectory() as tmp:
        dst = os.path.join(tmp, "uit" + ext)
        cmd = [ff, "-hide_banner", "-loglevel", "error", "-y", "-i", src,
               "-af", (f"loudnorm=I={args.target}:TP={args.true_peak}:LRA={args.lra}:"
                       f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
                       f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
                       f"offset={m['target_offset']}:print_format=summary"),
               "-ar", "48000"] + beeld + codec + [dst]
        subprocess.run(cmd, check=True)
        shutil.move(dst, src)

    na = measure(ff, src, args.target, args.true_peak, args.lra)
    print(f"nu      : {na['input_i']} LUFS, ware piek {na['input_tp']} dBTP")
    print(f"geschreven naar {os.path.relpath(src, ROOT)} "
          f"({os.path.getsize(src):,} bytes)")
    print("Draai hierna opnieuw: tools/analyze_loudness.py en tools/sync_manifest.py")


if __name__ == "__main__":
    main()
