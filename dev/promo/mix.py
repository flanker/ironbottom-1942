"""Sound for an edit made by compose.py.  python3 dev/promo/mix.py b|x
game sound + the game's own hymn (title, room, outro) + a sea bed + UI clicks in the room scenes; everything ducks
where the narration goes. Writes mix.wav, guide.wav (AI read alone), and muxes final.mp4 / preview_with_guide.mp4."""
import json, os, subprocess, sys
import numpy as np
from compose import SP, SR, TTS, REPO, load_audio, load_prod



def ramp_env(N, spans, low, r=0.3):
    """1 outside spans, `low` inside, with r-second ramps"""
    env = np.ones(N, np.float32)
    for a, b in spans:
        i0, i1 = int(max(0, a - r) * SR), int(min(N / SR, b + r) * SR)
        x = np.arange(i0, i1) / SR
        k = np.clip(np.minimum((x - (a - r)) / r, ((b + r) - x) / r), 0, 1)
        env[i0:i1] = np.minimum(env[i0:i1], 1 - (1 - low) * k)
    return env


def place(dst, src, t, g=1.0):
    i = int(round(t * SR)); n = min(len(src), len(dst) - i)
    if n > 0: dst[i:i + n] += src[:n] * g


def lowpass(x, a):
    y = np.empty_like(x); acc = 0.0
    # one-pole, vectorised in blocks via cumulative trick is overkill here; use scipy-free IIR with numpy loop in chunks
    from itertools import accumulate
    return np.array(list(accumulate(x, lambda p, v: p + a * (v - p))), np.float32)


def sea(N):
    rng = np.random.default_rng(7)
    n = rng.standard_normal(N // 8 + 2).astype(np.float32)
    lp = lowpass(n, 0.08)
    lp = np.interp(np.arange(N) / 8, np.arange(len(lp)), lp).astype(np.float32)
    t = np.arange(N) / SR
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 7.3) * np.sin(2 * np.pi * t / 11.1 + 1)
    s = lp * swell
    s /= np.abs(s).max() + 1e-9
    return np.stack([s, np.roll(s, 2400)], 1) * 0.05


def click(kind='btn'):
    n = int(0.05 * SR); t = np.arange(n) / SR
    rng = np.random.default_rng(1)
    if kind == 'key': f, dec, g = 2600, 160, 0.18
    else: f, dec, g = 1500, 90, 0.3
    x = (np.sin(2 * np.pi * f * t) * 0.6 + rng.standard_normal(n) * 0.4) * np.exp(-t * dec) * g
    return np.stack([x, x], 1).astype(np.float32)


def write_wav(p, a):
    a = np.clip(a, -1, 1)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', p], input=a.astype(np.float32).tobytes(), check=True)


def main(which):
    prod = load_prod()
    S, _, k, G = prod['EDITS'][which]()
    out = f'{SP}/out/{k}'
    tl = json.load(open(f'{out}/timeline.json')); total = tl['total']; starts = tl['starts']; narr = tl['narr']
    N = int(round(total * SR))
    game = np.load(f'{out}/game.npy')[:N]
    music = np.zeros((N, 2), np.float32)
    hymn = load_audio(f'{REPO}/sfx/music_hymn.mp3')
    hymn /= np.abs(hymn).max() + 1e-9
    xf = int(2.0 * SR)
    def looped(n):
        o = hymn.copy()
        while len(o) < n:
            o = np.vstack([o[:-xf], o[-xf:] * np.linspace(1, 0, xf)[:, None] + hymn[:xf] * np.linspace(0, 1, xf)[:, None], hymn[xf:]])
        return o
    def lay(t0, t1, start_in=0.0, fi=1.5, fo=2.5):
        """the hymn from t0 to t1, looping with a crossfade, faded in and out"""
        n = int((t1 - t0) * SR); i = int(start_in * SR)
        buf = looped(n + i)[i:i + n].copy()
        e = np.ones(n, np.float32); a, b = int(fi * SR), int(fo * SR)
        e[:a] = np.linspace(0, 1, a); e[-b:] = np.minimum(e[-b:], np.linspace(1, 0, b))
        place(music, buf * e[:, None], t0)
    mg = prod['music'](which, S, starts, narr, total, lay)
    # UI clicks (button presses, keystrokes) from the production
    ui = np.zeros((N, 2), np.float32)
    for t, kind in prod['clicks'](S, starts): place(ui, click(kind), t)
    # ducking under the narration
    spans = [(a, a + d) for a, _, d in narr]
    duck_game = ramp_env(N, spans, 0.5)[:, None]
    duck_music = ramp_env(N, spans, 0.4)[:, None]
    bed = sea(N)
    mix = game * duck_game + music * mg * duck_music + bed * duck_music + ui * duck_game
    pk = np.abs(mix).max(); print(f'{which}: peak {pk:.2f}')
    mix = np.tanh(mix / max(1.0, pk * 0.8)) if pk > 1 else mix
    write_wav(f'{out}/mix.wav', mix)
    # the AI guide read, alone, on the same timeline
    guide = np.zeros((N, 2), np.float32)
    for a, key, d in narr: place(guide, load_audio(TTS[key][0]), a)
    write_wav(f'{out}/guide.wav', guide)
    v = f'{out}/video_only.mp4'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', v, '-i', f'{out}/mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', f'{out}/final.mp4'], check=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', v, '-i', f'{out}/mix.wav', '-i', f'{out}/guide.wav', '-map', '0:v',
                    '-filter_complex', '[1:a]loudnorm=I=-16:TP=-2[g];[2:a]loudnorm=I=-15:TP=-1.5,volume=1.0[n];[g][n]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]',
                    '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', f'{out}/preview_with_guide.mp4'], check=True)
    print('  final.mp4, preview_with_guide.mp4, guide.wav')


if __name__ == '__main__':
    main(sys.argv[1])
