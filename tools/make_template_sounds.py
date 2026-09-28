#!/usr/bin/env python3
"""
Maakt de geluiden van de werk-sjablonen (PRESENTATIE, AFSCHEID, TEAMUITJE)
helemaal zelf, uit sinussen en ruis. Er zit geen opname van iemand anders in,
dus er rust ook geen recht op: ze mogen overal voor gebruikt en gedeeld worden.

Het script is deterministisch (vaste seed voor de ruis): opnieuw draaien geeft
precies dezelfde geluiden. Daarna meet het de luidheid en werkt het het
manifest bij, zoals bij elk ander geluid.

Gebruik:
    python3 tools/make_template_sounds.py            # audio/*.mp3 + manifest
    python3 tools/make_template_sounds.py --wav DIR  # ook wav's in DIR, om te beluisteren
    python3 tools/make_template_sounds.py --alleen gong,bel
"""
import argparse, json, os, subprocess, sys, tempfile

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "audio")
MANIFEST = os.path.join(ROOT, "data", "sounds.json")

SR = 48000
SEED = 20260927

# id -> (naam op de knop, icoon). De kleur komt op een bord uit het palet.
META = {
    "gong":         ("GONG",         "target"),
    "bel":          ("BEL",          "bell"),
    "aftellen":     ("AFTELLEN",     "hourglass"),
    "tiktak":       ("TIKTAK",       "clock"),
    "zoemer":       ("ZOEMER",       "bolt"),
    "whoosh":       ("WHOOSH",       "rocket"),
    "tadaa":        ("TADAA",        "sparkle"),
    "applaus":      ("APPLAUS",      "clap"),
    "tromgeroffel": ("TROMGEROFFEL", "drum"),
    "fanfare":      ("FANFARE",      "crown"),
    "proost":       ("PROOST",       "cheers"),
    "speeldoos":    ("SPEELDOOS",    "notes"),
    "rimshot":      ("RIMSHOT",      "sticks"),
    "fluit":        ("FLUIT",        "flag"),
    "goed":         ("GOED",         "check"),
    "fout":         ("FOUT",         "thumbdown"),
    "toeter":       ("TOETER",       "bullhorn"),
    "krekels":      ("KREKELS",      "bug"),
}

rng = np.random.default_rng(SEED)


# ---- bouwstenen ----------------------------------------------------------

def tijd(sec):
    return np.arange(int(round(sec * SR))) / SR


def leeg(sec, kanalen=1):
    n = int(round(sec * SR))
    return np.zeros(n) if kanalen == 1 else np.zeros((n, kanalen))


def plak(doel, stuk, op, gain=1.0):
    """Mengt `stuk` in `doel`, beginnend op `op` seconden."""
    i = int(round(op * SR))
    n = min(len(stuk), len(doel) - i)
    if n > 0 and i >= 0:
        doel[i:i + n] += gain * stuk[:n]


def filt(x, soort, f, orde=2):
    sos = butter(orde, f, soort, fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def ruis(n):
    return rng.standard_normal(n)


def fase(freq):
    """Fase bij een (eventueel veranderende) frequentie, zonder sprongen."""
    freq = np.broadcast_to(freq, freq.shape if np.ndim(freq) else (1,))
    return 2 * np.pi * np.cumsum(freq) / SR


def hoorn(freq, lengte, helder, maxf=12000.0, macht=0.85):
    """Koper-achtige toon: een zaagtand waarvan de hogere boventonen
    meegroeien met `helder` (0..1). Zo klinkt een toon feller naarmate hij
    harder wordt, zoals bij een trompet."""
    t = tijd(lengte)
    f = np.broadcast_to(freq, t.shape).astype(float)
    ph = fase(f) + rng.uniform(0, 2 * np.pi)
    helder = np.broadcast_to(helder, t.shape)
    k_max = max(1, int(maxf // max(float(np.max(f)), 1.0)))
    x = np.zeros_like(t)
    for k in range(1, k_max + 1):
        x += np.sin(k * ph) * (helder ** (k - 1)) / k ** macht
    return x


def staart(x, sec):
    """Laat de laatste `sec` seconden rustig uitklinken (cosinus). Een klank
    die abrupt ophoudt geeft een tik; zo klinkt hij uit alsof hij gedempt
    wordt."""
    n = min(len(x), int(sec * SR))
    if n > 1:
        x = x.copy()
        x[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    return x


def omhulling(n, aan=0.01, uit=0.05, vorm=1.0):
    """Aanzet en uitsterven in seconden; vlak daartussen."""
    e = np.ones(n)
    a, r = int(aan * SR), int(uit * SR)
    if a > 0:
        e[:a] = np.linspace(0, 1, a) ** vorm
    if r > 0:
        e[-r:] *= np.linspace(1, 0, r) ** vorm
    return e


def galm(x, rt60=1.2, nat=0.2, kleur=6500.0, voorvertraging=0.012):
    """Een ruimte eromheen: gefilterde, uitstervende ruis als impulsrespons.
    Werkt op mono en op stereo (per kanaal een eigen respons)."""
    n = int(rt60 * SR)
    t = np.arange(n) / SR
    stereo = x.ndim == 2
    kanalen = x.shape[1] if stereo else 1
    uit = np.zeros((len(x) + n, kanalen)) if stereo else np.zeros(len(x) + n)
    for c in range(kanalen):
        ir = ruis(n) * np.exp(-6.91 * t / rt60)
        ir = filt(ir, "low", kleur)
        ir[: int(voorvertraging * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2)) + 1e-12
        droog = x[:, c] if stereo else x
        nat_ = np.zeros(len(x) + n)
        conv = fftconvolve(droog, ir)
        nat_[: len(conv)] = conv[: len(x) + n]
        if stereo:
            uit[: len(x), c] += droog
            uit[:, c] += nat * nat_
        else:
            uit[: len(x)] += droog
            uit += nat * nat_
    return uit


def noot(naam):
    """'A4' -> 440.0; ook 'Bb3', 'C#5'."""
    namen = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    stap = namen[naam[0]]
    rest = naam[1:]
    if rest.startswith("#"):
        stap += 1; rest = rest[1:]
    elif rest.startswith("b"):
        stap -= 1; rest = rest[1:]
    octaaf = int(rest)
    return 440.0 * 2 ** ((stap + 12 * (octaaf - 4)) / 12)


def klok(freq, lengte, delen, klap=0.0):
    """Een klinkend stuk metaal of glas: losse deeltonen (verhouding,
    sterkte, uitsterftijd), elk licht gesplitst zodat ze zweven."""
    t = tijd(lengte)
    x = np.zeros_like(t)
    for verh, sterk, tau in delen:
        if freq * verh > 0.42 * SR:            # boven wat het bestand kan bevatten
            continue
        for d in (-0.5, 0.5):
            f = freq * verh + d * (0.6 + 0.4 * verh)
            x += 0.5 * sterk * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t / tau)
    if klap:
        tik = filt(ruis(len(t)) * np.exp(-t / 0.0015), "high", 2000)
        x += klap * tik
    return staart(x, 0.35 * lengte)


# ---- de geluiden -----------------------------------------------------------

def gong():
    lengte = 7.0
    t = tijd(lengte)
    f0 = 98.0
    # (verhouding, sterkte, uitsterven, opbouw): hogere deeltonen bouwen
    # langzaam op na de slag, dat geeft het aanzwellen van een echte gong
    delen = [(1.00, 1.00, 5.5, 0.002), (1.51, 0.70, 4.2, 0.010), (2.03, 0.55, 3.8, 0.030),
             (2.44, 0.42, 3.1, 0.060), (2.97, 0.45, 2.7, 0.090), (3.53, 0.30, 2.3, 0.120),
             (4.18, 0.26, 1.9, 0.160), (4.87, 0.18, 1.6, 0.200), (5.62, 0.15, 1.3, 0.240),
             (6.51, 0.10, 1.0, 0.280), (7.43, 0.08, 0.8, 0.300)]
    x = np.zeros_like(t)
    for verh, sterk, tau, op in delen:
        for d in (-0.35, 0.35):
            f = f0 * verh * (1 + 0.006 * np.exp(-t / 0.5)) + d
            x += 0.5 * sterk * np.sin(fase(f) + rng.uniform(0, 2 * np.pi)) * \
                 (1 - np.exp(-t / op)) * np.exp(-t / tau)
    x += 0.6 * filt(ruis(len(t)) * np.exp(-t / 0.012), "low", 1400)
    return galm(staart(x, 2.5), rt60=2.8, nat=0.22, kleur=5000)


def bel():
    x = klok(1318.5, 3.0, [(1.00, 1.0, 1.6), (2.32, 0.45, 0.8), (4.25, 0.25, 0.45),
                           (6.63, 0.12, 0.25), (0.50, 0.15, 1.2)], klap=0.25)
    return galm(x, rt60=1.1, nat=0.15)


def piep(freq, lengte):
    t = tijd(lengte)
    x = np.sin(2 * np.pi * freq * t) + 0.22 * np.sin(4 * np.pi * freq * t) + 0.08 * np.sin(6 * np.pi * freq * t)
    return x * omhulling(len(t), 0.005, 0.03)


def aftellen():
    x = leeg(4.0)
    for i in range(3):
        plak(x, piep(880.0, 0.16), i * 1.0, 0.8)
    plak(x, piep(1760.0, 0.75), 3.0, 0.9)
    return galm(x, rt60=0.7, nat=0.12)


def tik(freq, tau=0.022):
    t = tijd(0.12)
    ex = filt(ruis(len(t)) * np.exp(-t / 0.0008), "high", 800)
    toon = np.sin(2 * np.pi * freq * t) * np.exp(-t / tau) + \
           0.4 * np.sin(2 * np.pi * 0.43 * freq * t) * np.exp(-t / (tau * 1.6))
    return staart(0.35 * ex + toon, 0.05)


def tiktak():
    x = leeg(10.8)
    for i in range(20):
        plak(x, tik(3200.0 if i % 2 == 0 else 2350.0), i * 0.5, 0.8)
    ding = klok(1568.0, 1.2, [(1.0, 1.0, 0.7), (2.32, 0.35, 0.35), (4.25, 0.15, 0.2)], klap=0.2)
    plak(x, ding, 10.0, 0.9)
    return galm(x, rt60=0.45, nat=0.14, kleur=8000)


def zoemer():
    lengte = 1.25
    t = tijd(lengte)
    x = np.zeros_like(t)
    # blokgolf (oneven boventonen) plus een zaag er net naast: schurend
    for k in range(1, 60, 2):
        if 98.0 * k < 9000:
            x += np.sin(2 * np.pi * 98.0 * k * t) / k
    for k in range(1, 80):
        if 103.5 * k < 9000:
            x += 0.6 * np.sin(2 * np.pi * 103.5 * k * t + 0.3 * k) / k
    x = filt(x, "band", [140, 4200])
    x = np.tanh(2.2 * x / (np.max(np.abs(x)) + 1e-9))
    x *= omhulling(len(t), 0.008, 0.12)
    return galm(x, rt60=0.5, nat=0.1)


def whoosh():
    lengte = 1.3
    n = int(lengte * SR)
    x = ruis(n + 4096)
    # banddoorlaat die over de tijd opschuift, via korte stukjes spectrum
    raam, stap = 2048, 256
    w = np.hanning(raam)
    freqs = np.fft.rfftfreq(raam, 1 / SR)
    uit = np.zeros(n + raam)
    norm = np.zeros(n + raam)
    for i in range(0, n, stap):
        tt = i / SR
        if tt < 0.55:
            midden = 250 * (3500 / 250) ** (tt / 0.55)
        else:
            midden = 3500 * (600 / 3500) ** ((tt - 0.55) / (lengte - 0.55))
        breed = 0.55                                   # in octaven
        masker = np.exp(-0.5 * (np.log2(np.maximum(freqs, 1) / midden) / breed) ** 2)
        stuk = np.fft.irfft(np.fft.rfft(x[i:i + raam] * w) * masker, raam)
        uit[i:i + raam] += stuk * w
        norm[i:i + raam] += w ** 2
    uit = uit[:n] / np.maximum(norm[:n], 1e-3)
    t = tijd(lengte)
    env = np.where(t < 0.55, (t / 0.55) ** 1.6, np.exp(-(t - 0.55) / 0.22))
    return galm(staart(uit * env, 0.3), rt60=0.9, nat=0.18)


def koper(noten, lengte, helder_piek=0.72, vibrato=0.0, stem=2):
    """Een akkoord koper: per noot een paar licht ontstemde stemmen."""
    t = tijd(lengte)
    helder = 0.25 + (helder_piek - 0.25) * (1 - np.exp(-t / 0.035))
    helder = np.where(t > 0.12, helder - 0.08 * (1 - np.exp(-(t - 0.12) / 0.3)), helder)
    x = np.zeros_like(t)
    for f in noten:
        for s in range(stem):
            cent = (s - (stem - 1) / 2) * 5
            freq = f * 2 ** (cent / 1200)
            if vibrato:
                inzet = np.clip((t - 0.35) / 0.3, 0, 1)
                freq = freq * (1 + vibrato * inzet * np.sin(2 * np.pi * 5.6 * t))
            x += hoorn(freq, lengte, helder, maxf=9000) / stem
    return x * omhulling(len(t), 0.018, min(0.12, lengte / 3))


def tadaa():
    x = leeg(2.0)
    akkoord = [noot(n) for n in ("Bb4", "D5", "F5", "Bb5")]
    plak(x, koper(akkoord, 0.13), 0.0, 0.7)
    lang = koper(akkoord + [noot("Bb3")], 1.5, helder_piek=0.78, vibrato=0.004)
    plak(x, lang, 0.19, 1.0)
    return galm(x, rt60=1.5, nat=0.2)


def fanfare():
    x = leeg(3.0)
    for i in range(3):
        plak(x, koper([noot("G4")], 0.12), i * 0.14, 0.75)
    plak(x, koper([noot("C5"), noot("E5")], 0.26), 0.42, 0.85)
    plak(x, koper([noot("E5"), noot("G5")], 0.13), 0.70, 0.8)
    plak(x, koper([noot("G5"), noot("C6"), noot("E5"), noot("C4")], 1.6, helder_piek=0.8, vibrato=0.005), 0.86, 1.0)
    return galm(x, rt60=1.6, nat=0.22)


def applaus():
    lengte = 5.2
    x = leeg(lengte, 2)
    # een handvol voorgebakken klappen, elk met een eigen klankkleur
    klappen = []
    for _ in range(14):
        t = tijd(0.04)
        k = ruis(len(t)) * np.exp(-t / rng.uniform(0.004, 0.009))
        mid = rng.uniform(800, 2600)
        k = filt(k, "band", [mid / 1.6, mid * 1.6])
        klappen.append(k / (np.max(np.abs(k)) + 1e-9))
    for _ in range(42):
        tempo = rng.uniform(3.6, 6.2)
        begin = rng.uniform(0.0, 0.6)
        eind = rng.uniform(3.4, 4.8)
        pan = rng.uniform(0.15, 0.85)
        sterk = rng.uniform(0.4, 1.0)
        tt = begin
        while tt < eind:
            k = klappen[rng.integers(len(klappen))]
            g = sterk * rng.uniform(0.6, 1.0)
            plak(x[:, 0], k, tt, g * np.sqrt(1 - pan))
            plak(x[:, 1], k, tt, g * np.sqrt(pan))
            tt += (1 / tempo) * rng.uniform(0.85, 1.15)
    t = tijd(lengte)
    env = np.minimum(1, t / 0.35) * np.where(t > 3.6, np.exp(-(t - 3.6) / 0.6), 1)
    x *= env[:, None]
    return galm(x, rt60=1.0, nat=0.28)


def roffelslag(helder=1.0):
    t = tijd(0.25)
    toon = np.sin(fase(180 + 60 * np.exp(-t / 0.01))) * np.exp(-t / 0.05)
    snaar = filt(ruis(len(t)), "band", [1500, 8000]) * np.exp(-t / 0.08)
    return staart(0.6 * toon + 0.8 * helder * snaar, 0.08)


def bekken(lengte=2.6, tau=1.4, laag=3000):
    t = tijd(lengte)
    x = filt(ruis(len(t)), "high", laag) * np.exp(-t / tau)
    for _ in range(40):
        f = rng.uniform(3000, 11000)
        x += 0.06 * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / rng.uniform(0.6, 2.0))
    return x * omhulling(len(t), 0.001, 0.2)


def basdrum():
    t = tijd(0.5)
    return staart(np.sin(fase(55 + 70 * np.exp(-t / 0.03))) * np.exp(-t / 0.22) +
                  0.3 * filt(ruis(len(t)) * np.exp(-t / 0.004), "low", 3000), 0.15)


def tromgeroffel():
    x = leeg(5.2)
    tt, i = 0.0, 0
    while tt < 3.0:
        sterk = 0.25 + 0.75 * (tt / 3.0) ** 1.7
        accent = 1.0 if i % 2 == 0 else 0.82
        plak(x, roffelslag(), tt, sterk * accent * rng.uniform(0.9, 1.05))
        tt += 1 / 18 + rng.uniform(-0.006, 0.006)
        i += 1
    plak(x, bekken(), 3.05, 0.75)
    plak(x, basdrum(), 3.05, 1.0)
    plak(x, roffelslag(), 3.05, 1.0)
    return galm(x, rt60=1.3, nat=0.2)


def tom(f_hoog, f_laag, tau):
    t = tijd(0.6)
    return staart(np.sin(fase(f_laag + (f_hoog - f_laag) * np.exp(-t / 0.04))) * np.exp(-t / tau) +
                  0.15 * filt(ruis(len(t)) * np.exp(-t / 0.01), "band", [500, 4000]), 0.2)


def rimshot():
    x = leeg(2.3)
    plak(x, roffelslag(), 0.0, 0.9)
    plak(x, tom(170, 120, 0.18), 0.21, 0.9)
    plak(x, bekken(1.8, 0.8, 4500), 0.46, 0.7)
    plak(x, basdrum(), 0.46, 0.8)
    return galm(x, rt60=1.0, nat=0.18)


def speeldoos():
    x = leeg(5.6)
    tel = 0.3
    melodie = ["E6", "G6", "C7", "D7", "B6", "G6", "A6", "F6", "A6", "G6", "E6", "C6"]
    bas = ["C5", "G4", "F4", "C5"]
    for i, n in enumerate(melodie):
        lang = 2.4 if i == len(melodie) - 1 else 1.2
        f = noot(n)
        tand = klok(f, lang, [(1.0, 1.0, 0.9 * 880 / f + 0.25), (6.27, 0.18, 0.12), (17.55, 0.05, 0.04)], klap=0.05)
        plak(x, tand, i * tel, 0.6)
    for i, n in enumerate(bas):
        f = noot(n)
        tand = klok(f, 1.6, [(1.0, 1.0, 1.1), (6.27, 0.12, 0.15)], klap=0.03)
        plak(x, tand, i * 3 * tel, 0.45)
    return galm(x, rt60=1.6, nat=0.25)


def fluitje(lengte):
    t = tijd(lengte)
    triller = 1 + 0.035 * np.sin(2 * np.pi * 27 * t + rng.uniform(0, 6.28)) + 0.004 * filt(ruis(len(t)), "low", 40)
    f = 3050 * (1 + 0.02 * (1 - np.exp(-t / 0.03))) * triller
    ph = fase(f)
    x = np.sin(ph) + 0.15 * np.sin(2 * ph)
    x += 0.12 * filt(ruis(len(t)), "band", [2400, 3800])
    return x * omhulling(len(t), 0.015, 0.04)


def fluit():
    x = leeg(1.9)
    plak(x, fluitje(0.22), 0.0, 0.8)
    plak(x, fluitje(0.22), 0.32, 0.8)
    plak(x, fluitje(0.85), 0.64, 0.9)
    return galm(x, rt60=0.6, nat=0.12)


def goed():
    x = leeg(1.6)
    for f, op in ((noot("C6"), 0.0), (noot("G6"), 0.12)):
        plak(x, klok(f, 1.3, [(1.0, 1.0, 0.8), (2.0, 0.25, 0.4), (3.0, 0.08, 0.25), (4.1, 0.06, 0.15)], klap=0.1), op, 0.8)
    return galm(x, rt60=0.9, nat=0.15)


def fout():
    x = leeg(3.1)
    noten = [("Bb3", 0.0, 0.45), ("A3", 0.52, 0.45), ("Ab3", 1.04, 0.45), ("G3", 1.56, 1.25)]
    for i, (n, op, lang) in enumerate(noten):
        t = tijd(lang)
        f = noot(n) * (1 + 0.03 * np.exp(-t / 0.05))
        if i == 3:
            f = f * (1 + 0.018 * np.clip((t - 0.25) / 0.2, 0, 1) * np.sin(2 * np.pi * 6.0 * t))
        wah = 0.18 + 0.55 * np.sin(np.pi * np.clip(t / lang, 0, 1)) ** 0.8
        toon = hoorn(f, lang, wah, maxf=6000, macht=1.0) * omhulling(len(t), 0.03, 0.08)
        plak(x, toon, op, 0.9)
    return galm(x, rt60=1.1, nat=0.16)


def proost():
    x = leeg(2.4)
    glas_a = [(1.0, 1.0, 1.4), (2.44, 0.5, 0.7), (4.24, 0.22, 0.35)]
    glas_b = [(1.0, 1.0, 1.3), (2.37, 0.45, 0.65), (3.95, 0.2, 0.3)]
    plak(x, klok(1810.0, 2.0, glas_a, klap=0.35), 0.0, 0.6)
    plak(x, klok(2130.0, 2.0, glas_b, klap=0.35), 0.003, 0.55)
    plak(x, klok(1810.0, 1.6, glas_a, klap=0.2), 0.24, 0.25)
    plak(x, klok(2130.0, 1.6, glas_b, klap=0.2), 0.244, 0.22)
    return galm(x, rt60=1.0, nat=0.2)


def toeter():
    x = leeg(2.1)
    for op, lang in ((0.0, 0.28), (0.36, 0.28), (0.72, 1.05)):
        t = tijd(lang)
        toon = np.zeros_like(t)
        for f in (415.0, 422.0, 433.0):
            freq = f * (1 - 0.03 * np.exp(-t / 0.04))
            toon += hoorn(freq, lang, 0.93, maxf=7000, macht=0.7) / 3
        toon = np.tanh(1.8 * toon / (np.max(np.abs(toon)) + 1e-9))
        toon = filt(toon, "band", [300, 6500])
        plak(x, toon * omhulling(len(t), 0.012, 0.05), op, 0.9)
    return galm(x, rt60=0.9, nat=0.16)


def krekels():
    lengte = 6.0
    x = leeg(lengte, 2)
    for f, pan, ritme in ((4400.0, 0.25, 0.58), (4750.0, 0.7, 0.66), (5100.0, 0.5, 0.73)):
        tt = rng.uniform(0, 0.4)
        while tt < lengte - 0.2:
            for p in range(rng.integers(3, 5)):
                t = tijd(0.013)
                puls = np.sin(2 * np.pi * f * t) * np.sin(np.pi * t / 0.013) ** 2
                g = rng.uniform(0.5, 1.0)
                plak(x[:, 0], puls, tt + p * 0.022, g * np.sqrt(1 - pan))
                plak(x[:, 1], puls, tt + p * 0.022, g * np.sqrt(pan))
            tt += ritme * rng.uniform(0.9, 1.1)
    nacht = filt(ruis(len(x)), "band", [300, 2500]) * 0.01
    x[:, 0] += nacht
    x[:, 1] += np.roll(nacht, 977)
    t = tijd(lengte)
    x *= (np.minimum(1, t / 0.5) * np.minimum(1, (lengte - t) / 0.8))[:, None]
    return galm(x, rt60=0.8, nat=0.2)


MAKERS = {
    "gong": gong, "bel": bel, "aftellen": aftellen, "tiktak": tiktak, "zoemer": zoemer,
    "whoosh": whoosh, "tadaa": tadaa, "applaus": applaus, "tromgeroffel": tromgeroffel,
    "fanfare": fanfare, "proost": proost, "speeldoos": speeldoos, "rimshot": rimshot,
    "fluit": fluit, "goed": goed, "fout": fout, "toeter": toeter, "krekels": krekels,
}


# ---- afwerken en wegschrijven ---------------------------------------------

def afwerken(x):
    """Geen gelijkspanning, staart eraf waar het stil wordt, zachte randen,
    piek op -1 dBFS."""
    x = filt(x, "high", 20)
    mono = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    top = mono.max() + 1e-12
    boven = np.nonzero(mono > top * 10 ** (-66 / 20))[0]
    eind = min(len(x), (boven[-1] if len(boven) else len(x) - 1) + int(0.02 * SR))
    x = x[:eind]
    n_in, n_uit = int(0.002 * SR), int(0.02 * SR)
    rand = np.ones(len(x))
    rand[:n_in] = np.linspace(0, 1, n_in)
    rand[-n_uit:] *= np.linspace(1, 0, n_uit)
    x = x * (rand[:, None] if x.ndim == 2 else rand)
    return x / top * 10 ** (-1 / 20)


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        from shutil import which
        exe = which("ffmpeg")
        if not exe:
            sys.exit("ffmpeg niet gevonden (pip install imageio-ffmpeg)")
        return exe


def naar_mp3(x, pad, wav_map=None, naam=""):
    stereo = x.ndim == 2
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "x.wav")
        sf.write(wav, x.astype(np.float32), SR, subtype="PCM_24")
        if wav_map:
            os.makedirs(wav_map, exist_ok=True)
            sf.write(os.path.join(wav_map, naam + ".wav"), x.astype(np.float32), SR, subtype="PCM_16")
        subprocess.run([ffmpeg(), "-y", "-hide_banner", "-loglevel", "error", "-i", wav,
                        "-c:a", "libmp3lame", "-b:a", "192k" if stereo else "160k",
                        "-ar", str(SR), pad], check=True)


def manifest_bijwerken(ids):
    """Naam, icoon en de markering 'sjabloon' op de nieuwe knoppen zetten.
    Die markering houdt ze van een oud bord af dat bij de overstap al zijn
    geluiden meekrijgt: SPEECH blijft precies zoals het was."""
    m = json.load(open(MANIFEST))
    for e in m["sounds"]:
        if e["id"] in ids:
            e["label"], e["icon"] = META[e["id"]]
            e["set"] = "sjabloon"
    with open(MANIFEST, "w") as f:
        json.dump(m, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wav", help="map om ook wav's in te zetten")
    ap.add_argument("--alleen", help="alleen deze (komma's ertussen)")
    ap.add_argument("--geen-manifest", action="store_true", help="manifest niet bijwerken")
    args = ap.parse_args()

    ids = list(MAKERS)
    if args.alleen:
        ids = [i for i in args.alleen.split(",") if i in MAKERS]
    for i in ids:
        # elke maker een eigen, vaste ruisbron: dan verandert een geluid niet
        # als er een ander bij komt of wordt aangepast
        global rng
        rng = np.random.default_rng([SEED, sum(map(ord, i))])
        x = afwerken(MAKERS[i]())
        pad = os.path.join(AUDIO_DIR, i + ".mp3")
        naar_mp3(x, pad, args.wav, i)
        print(f"  {META[i][0]:14s} {len(x) / SR:5.2f} s  {'stereo' if x.ndim == 2 else 'mono  '}  {os.path.getsize(pad) // 1024} kB")

    if args.geen_manifest:
        return
    hier = os.path.dirname(os.path.abspath(__file__))
    subprocess.run([sys.executable, os.path.join(hier, "analyze_loudness.py")], check=True)
    subprocess.run([sys.executable, os.path.join(hier, "sync_manifest.py")], check=True)
    manifest_bijwerken(set(ids))
    # nog een keer, zodat js/manifest.js de namen en iconen ook heeft
    subprocess.run([sys.executable, os.path.join(hier, "sync_manifest.py")], check=True,
                   stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
