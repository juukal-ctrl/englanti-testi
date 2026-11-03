#!/usr/bin/env python3
"""Generoi esiäänitetyt englanninkieliset äänileikkeet Kokoro-82M-mallilla.

Käyttö:
  node tools/tts/texts.mjs > build/texts.json
  python3 tools/tts/generate.py --texts build/texts.json --out audio
  python3 tools/tts/generate.py --texts build/texts.json --out /tmp/audio --fake   # putkitesti ilman mallia

Tulos: <out>/<tunniste>.ogg (Opus) ja <out>/manifest.json, joka kuvaa tekstin leikkeen tunnisteeksi.
Tunniste on tiiviste tekstistä, äänestä, nopeudesta ja putken versiosta, joten jo olemassa olevia leikkeitä ei
generoida uudelleen, eikä vanha leike voi jäädä käyttöön, jos jokin näistä muuttuu.
Ajo tehdään GitHub Actionsissa (.github/workflows/kokoro-audio.yml); malli ladataan sinne Hugging Facesta.
"""

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
import tempfile
import time
import wave
import zlib
from pathlib import Path

SAMPLE_RATE = 24000  # Kokoron tuottama näytteenottotaajuus
PIPELINE_REV = 1  # kasvata, kun jälkikäsittely tai koodaus muuttuu: kaikki leikkeet generoidaan silloin uudelleen
ENGINE = 'kokoro-82m'
DEFAULT_VOICE = 'af_heart'  # amerikanenglantia, nainen
SPEEDS = {'normal': 0.9, 'slow': 0.65}  # Kokoron speed-parametri; 1.0 olisi mallin oma vauhti
OPUS_KBPS = 24
TARGET_RMS = 0.085  # noin -21 dBFS aktiivisista näytteistä
PEAK_LIMIT = 0.95
LEAD_PAD_S = 0.04  # hiljaisuutta jätetään alkuun ja loppuun näin paljon (loppuun enemmän: luonnollinen vaimeneminen)
TAIL_PAD_S = 0.18


RESPELL_FILE = Path(__file__).with_name('respell.json')


def log(msg):
    print(msg, flush=True)


def load_respell(path=RESPELL_FILE):
    """Ääntämiskorjaukset: { "säännöllinen lauseke": "korvaus" }. Koskevat vain äänitystä, eivät sovelluksessa näkyvää tekstiä."""
    path = Path(path)
    if not path.exists():
        return []
    rules = json.loads(path.read_text(encoding='utf-8'))
    return [(re.compile(pattern), replacement) for pattern, replacement in rules.items()]


def respell(text, rules):
    for pattern, replacement in rules:
        text = pattern.sub(replacement, text)
    return text


def clip_id(engine_tag, voice, speed, text):
    key = f'{PIPELINE_REV}|{engine_tag}|{voice}|{speed}|{text}'
    return hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]


def build_jobs(texts, engine_tag, voice, rules=()):
    jobs = []
    for variant in ('normal', 'slow'):
        for text in texts.get(variant, []):
            spoken = respell(text, rules)  # tunniste lasketaan äänitettävästä tekstistä, joten korjaus tekee leikkeen uudelleen
            jobs.append({'variant': variant, 'text': text, 'spoken': spoken, 'id': clip_id(engine_tag, voice, SPEEDS[variant], spoken)})
    return jobs


# ---------- Äänen tuotto ----------


class KokoroSynth:
    """Kokoro-82M CPU:lla. Tuonnit tehdään vasta tässä, jotta suunnitelma- ja valetila toimivat ilman raskaita kirjastoja."""

    def __init__(self, voice):
        from kokoro import KPipeline  # noqa: PLC0415

        t0 = time.time()
        self.pipeline = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
        self.voice = voice
        log(f'Kokoro ladattu {time.time() - t0:.1f} s, ääni {voice}')

    def __call__(self, text, speed):
        import numpy as np  # noqa: PLC0415

        chunks = []
        for result in self.pipeline(text, voice=self.voice, speed=speed):
            audio = result.audio if hasattr(result, 'audio') else result[2]
            if audio is None:
                continue
            if hasattr(audio, 'detach'):
                audio = audio.detach().cpu().numpy()
            chunks.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        if not chunks:
            raise RuntimeError('Kokoro ei tuottanut ääntä')
        return np.concatenate(chunks)


def fake_synth(text, speed):
    """Pelkkä testiääni (ei puhetta): lyhyt, kestoltaan tekstin pituuteen verrannollinen, jotta toiston voi testata nopeasti."""
    import numpy as np  # noqa: PLC0415

    dur = (0.25 + 0.012 * len(text)) / speed
    n = int(SAMPLE_RATE * dur)
    t = np.arange(n) / SAMPLE_RATE
    f0 = 140 + zlib.crc32(text.encode('utf-8')) % 80
    env = 0.55 + 0.45 * np.sin(2 * math.pi * 4.0 * t)
    sig = sum(np.sin(2 * math.pi * f0 * k * t) / k for k in (1, 2, 3, 4)) * env * 0.3
    pad = np.zeros(int(0.1 * SAMPLE_RATE), dtype=np.float32)
    return np.concatenate([pad, sig.astype(np.float32), pad])


def postprocess(audio):
    """Siistii leikkeen: leikkaa hiljaisuudet, häivyttää reunat ja tasaa voimakkuuden. Palauttaa (näytteet, tilasto)."""
    import numpy as np  # noqa: PLC0415

    x = np.asarray(audio, dtype=np.float32).reshape(-1)
    if x.size == 0:
        raise ValueError('tyhjä ääni')
    if not np.all(np.isfinite(x)):
        raise ValueError('ääni sisältää virheellisiä arvoja')
    peak = float(np.max(np.abs(x)))
    if peak < 1e-3:
        raise ValueError('ääni on hiljainen')
    active = np.nonzero(np.abs(x) > 0.02 * peak)[0]
    start = max(0, int(active[0]) - int(LEAD_PAD_S * SAMPLE_RATE))
    end = min(x.size, int(active[-1]) + int(TAIL_PAD_S * SAMPLE_RATE))
    x = x[start:end].copy()
    fade_in = min(x.size // 4, int(0.008 * SAMPLE_RATE))
    fade_out = min(x.size // 4, int(0.05 * SAMPLE_RATE))
    if fade_in:
        x[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)
    if fade_out:
        x[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)
    loud = x[np.abs(x) > 0.02 * peak]
    rms = float(np.sqrt(np.mean(loud**2)))
    gain = TARGET_RMS / rms
    gain = min(gain, PEAK_LIMIT / float(np.max(np.abs(x))))
    x = x * gain
    peak_after = float(np.max(np.abs(x)))
    rms_after = float(np.sqrt(np.mean(x[np.abs(x) > 0.02 * peak_after] ** 2)))
    stats = {
        'seconds': x.size / SAMPLE_RATE,
        'rms_db': 20 * math.log10(max(rms_after, 1e-9)),
        'peak': peak_after,
    }
    return x, stats


def write_wav(path, x):
    import numpy as np  # noqa: PLC0415

    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())


def encode_opus(wav, out):
    cmd = [
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
        '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
        '-ac', '1', '-ar', str(SAMPLE_RATE),
        '-c:a', 'libopus', '-b:a', f'{OPUS_KBPS}k', '-vbr', 'on', '-application', 'audio',
        '-f', 'ogg', str(out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f'ffmpeg epäonnistui: {proc.stderr.strip()[-400:]}')


# ---------- Pääohjelma ----------


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--texts', required=True, help='tools/tts/texts.mjs:n tuottama JSON')
    ap.add_argument('--out', required=True, help='kohdehakemisto (audio)')
    ap.add_argument('--voice', default=DEFAULT_VOICE)
    ap.add_argument('--fake', action='store_true', help='tuota testiääntä mallin sijaan (putkitesti)')
    ap.add_argument('--respell', default=str(RESPELL_FILE), help='ääntämiskorjaukset (JSON)')
    ap.add_argument('--plan', action='store_true', help='tulosta vain puuttuvien leikkeiden määrä')
    ap.add_argument('--limit', type=int, default=0, help='generoi enintään näin monta puuttuvaa leikettä (savutesti)')
    ap.add_argument('--force', action='store_true', help='generoi kaikki uudelleen')
    args = ap.parse_args()

    texts = json.loads(Path(args.texts).read_text(encoding='utf-8'))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for stale in out.glob('*.part'):
        stale.unlink()
    engine_tag = 'fake' if args.fake else 'kokoro'
    rules = load_respell(args.respell)
    jobs = build_jobs(texts, engine_tag, args.voice, rules)
    todo = [j for j in jobs if args.force or not (out / f"{j['id']}.ogg").exists()]

    if args.plan:
        print(len(todo))
        return 0

    log(f'Tekstejä {len(jobs)} (normaali {len(texts.get("normal", []))}, hidas {len(texts.get("slow", []))}), generoitavia {len(todo)}')
    if args.limit:
        todo = todo[: args.limit]
    failures = []
    if todo:
        if subprocess.run(['ffmpeg', '-version'], capture_output=True).returncode != 0:
            log('ffmpeg puuttuu')
            return 2
        synth = fake_synth if args.fake else KokoroSynth(args.voice)
        t_start = time.time()
        audio_total = 0.0
        with tempfile.TemporaryDirectory() as tmp:
            for n, job in enumerate(todo, 1):
                speed = SPEEDS[job['variant']]
                t0 = time.time()
                try:
                    raw = synth(job['spoken'], speed)
                    x, stats = postprocess(raw)
                    expected = len(job['text']) / 14.0 / speed  # karkea arvio: ~14 merkkiä sekunnissa
                    if not args.fake and not (0.35 * expected <= stats['seconds'] <= 3.0 * expected + 1.5):
                        log(f"  VAROITUS: epätavallinen kesto {stats['seconds']:.1f} s (arvio {expected:.1f} s): {job['text']}")
                    wav = Path(tmp) / 'clip.wav'
                    write_wav(wav, x)
                    target = out / f"{job['id']}.ogg"
                    part = out / f"{job['id']}.ogg.part"
                    encode_opus(wav, part)
                    size = part.stat().st_size
                    if size < 400:
                        part.unlink()
                        raise RuntimeError(f'liian pieni tiedosto ({size} t)')
                    part.replace(target)  # valmis tiedosto ilmestyy kerralla, joten keskeytynyt ajo ei jätä rikkinäistä leikettä
                    audio_total += stats['seconds']
                    log(f"[{n}/{len(todo)}] {job['variant']:6} {stats['seconds']:5.1f} s {size / 1024:5.1f} kt rms {stats['rms_db']:.1f} dB, työ {time.time() - t0:.1f} s: {job['text']}")
                except Exception as e:  # noqa: BLE001
                    failures.append({'variant': job['variant'], 'text': job['text'], 'error': f'{type(e).__name__}: {e}'})
                    log(f"[{n}/{len(todo)}] EPÄONNISTUI {job['variant']}: {job['text']} → {type(e).__name__}: {e}")
        elapsed = time.time() - t_start
        log(f'Valmis {elapsed:.0f} s: ääntä {audio_total:.0f} s, nopeuskerroin {audio_total / max(elapsed, 1e-9):.1f}× reaaliaika')

    # Manifesti: vain tiedostot, jotka ovat olemassa.
    manifest = {
        'version': 1,
        'engine': 'fake' if args.fake else ENGINE,
        'voice': args.voice,
        'speeds': SPEEDS,
        'normal': {},
        'slow': {},
    }
    referenced = set()
    total_bytes = 0
    for j in jobs:
        f = out / f"{j['id']}.ogg"
        if f.exists():
            manifest[j['variant']][j['text']] = j['id']
            referenced.add(f.name)
            total_bytes += f.stat().st_size
    manifest['bytes'] = total_bytes
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=1) + '\n', encoding='utf-8')

    # Siivous: poistetaan leikkeet, joita manifesti ei enää käytä (teksti on muuttunut tai poistunut).
    removed = 0
    if not args.limit:
        for f in out.glob('*.ogg'):
            if f.name not in referenced:
                f.unlink()
                removed += 1
    log(f"Manifesti: normaali {len(manifest['normal'])}, hidas {len(manifest['slow'])}, yhteensä {total_bytes / 1024 / 1024:.2f} Mt, poistettu vanhoja {removed}, epäonnistui {len(failures)}")
    for f in failures:
        log(f"  EPÄONNISTUI {f['variant']}: {f['text']} → {f['error']}")
    return 3 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
