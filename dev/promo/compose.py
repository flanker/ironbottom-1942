"""Edit → picture and game sound. python3 dev/promo/compose.py b|x [timeline]
The edit itself lives in the production ($PROMO_PROD/edit.py): segments of d (s), v (layout + sources), ov (cards),
n (narration key, delay), a (audio mix). Writes $PROMO_WORK/out/<b|x>/: video_only.mp4, game.npy, timeline.json, segs/.
`timeline` only checks the narration slots."""
import json, os, subprocess, sys, wave
import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
SP = os.environ.get('PROMO_WORK') or os.path.abspath('promo-work')   # work dir: streams, runs/, takes/, tts/, cards/, out/
PROD = os.path.abspath(os.environ.get('PROMO_PROD') or os.path.join(REPO, 'dev/promo/productions/2026-10-duel'))   # this video's edit, lines, cover
FPS, SR = 30, 48000
CARD = f'{SP}/cards'
RUNS = {}
for f in os.listdir(f'{SP}/runs'):
    if f.endswith('.json') and not f.startswith('t_') and f != 'list.json':
        j = json.load(open(f'{SP}/runs/{f}'))
        for tk in j['takes']:
            RUNS[tk['name']] = (os.path.join(j['out'], tk['name']), tk['t0'])
BASE = {sc: json.load(open(f'{SP}/{sc}.json'))['start'] + 0.19 for sc in ('BB', 'DD', 'CA')}
SC = lambda take: take.split('_')[0].upper()


def off(take, bt=None, session=None, rel=None):
    """seconds into a take, from battle time, session time or take-relative time"""
    d, t0 = RUNS[take]
    if rel is not None: return rel
    if session is not None: return session - t0
    return BASE[SC(take)] + bt - t0


TTS = {}
for k in ('b', 'x'):
    for f in sorted(os.listdir(f'{SP}/tts/{k}')):
        key = f[3:-4]
        p = f'{SP}/tts/{k}/{f}'
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]))
        TTS[key] = (p, dur)
LINES = {k: dict(v) for k, v in json.load(open(f'{SP}/tts/lines.json')).items()}   # written by tts.py


def F(take, z=1, **kw): return ('full', take, off(take, **kw), z)
def P(take, **kw): return ('pfull', take, off(take, **kw))
def SPL(a, b, **kw): return ('split', a, off(a, **kw), b, off(b, **kw))
def STK(a, b, z=1, **kw): return ('stack', a, off(a, **kw), b, off(b, **kw), z)


def load_prod():
    """the production's edit.py, run with these helpers in scope: EDITS = {'b': fn, 'x': fn}, PIC, NAMES, HOOK, music(), clicks()"""
    ns = dict(globals()); ns['__file__'] = f'{PROD}/edit.py'
    exec(compile(open(f'{PROD}/edit.py').read(), f'{PROD}/edit.py', 'exec'), ns)
    return ns


def frames(take):
    d = RUNS[take][0]
    return d, len([f for f in os.listdir(d) if f.endswith('.jpg')])


def seq_input(take, o, dur):
    d, n = frames(take)
    st = max(0, int(round(o * FPS)))
    need = int(round(dur * FPS))
    if st + need > n: print(f'  !! {take}: frames {st}+{need} > {n}, holding the last')
    return ['-framerate', str(FPS), '-start_number', str(min(st, n - 1)), '-i', f'{d}/f%05d.jpg']


def render_seg(i, s, W, H, out):
    d = s['d']; v = s['v']; args = ['ffmpeg', '-y', '-v', 'error']; fc = []
    kind = v[0]
    if kind in ('full', 'pfull'):
        args += seq_input(v[1], v[2], d)
        z = v[3] if kind == 'full' and len(v) > 3 else 1
        crop = f'crop=iw/{z}:ih/{z}:(iw-iw/{z})/2:(ih-ih/{z})/2,' if z != 1 else ''
        fc.append(f'[0:v]{crop}scale={W}:{H}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=2,trim=duration={d}[b0]')
        nin = 1
    else:
        bg = 'splitbg' if kind == 'split' else 'pstackbg'
        args += ['-loop', '1', '-framerate', str(FPS), '-t', str(d), '-i', f'{CARD}/{bg}.png']
        args += seq_input(v[1], v[2], d) + seq_input(v[3], v[4], d)
        if kind == 'split': pw, ph, pa, pb = 944, 531, (8, 250), (968, 250)
        else: pw, ph, pa, pb = 1080, 608, (0, 330), (0, 978)
        z = v[5] if len(v) > 5 else 1
        crop = f'crop=iw/{z}:ih/{z}:(iw-iw/{z})/2:(ih-ih/{z})/2,' if z != 1 else ''
        fc.append(f'[1:v]{crop}scale={pw}:{ph}:flags=lanczos,tpad=stop_mode=clone:stop_duration=2[pa]')
        fc.append(f'[2:v]{crop}scale={pw}:{ph}:flags=lanczos,tpad=stop_mode=clone:stop_duration=2[pb]')
        fc.append(f'[0:v]scale={W}:{H},format=yuv420p[bg];[bg][pa]overlay={pa[0]}:{pa[1]}:shortest=0[b1];[b1][pb]overlay={pb[0]}:{pb[1]},trim=duration={d}[b0]')
        nin = 3
    cur = 'b0'
    for k, (card, a, b) in enumerate(s.get('ov', [])):
        args += ['-loop', '1', '-framerate', str(FPS), '-t', str(d), '-i', f'{CARD}/{card}.png']
        a2, b2 = max(0, a), min(d, b)
        fl = 'format=rgba'
        if a > 0: fl += f',fade=t=in:st={a2}:d=0.25:alpha=1'
        if b < d: fl += f',fade=t=out:st={max(0, b2 - 0.25)}:d=0.25:alpha=1'
        if card in ('hook', 'phook') and s.get('fin'): fl += ',fade=t=in:st=0.15:d=0.3:alpha=1'
        if card in ('hook', 'phook') and s.get('fout'): fl += f',fade=t=out:st={d - 0.3}:d=0.3:alpha=1'
        fc.append(f'[{nin}:v]{fl}[o{k}];[{cur}][o{k}]overlay=0:0[c{k}]'); cur = f'c{k}'; nin += 1
    if s.get('fade_end'): fc.append(f'[{cur}]fade=t=out:st={d - s["fade_end"]}:d={s["fade_end"]}[fe]'); cur = 'fe'
    fc.append(f'[{cur}]fps={FPS},format=yuv420p[vo]')
    args += ['-filter_complex', ';'.join(fc), '-map', '[vo]', '-frames:v', str(int(round(d * FPS))), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', str(FPS), out]
    subprocess.run(args, check=True)


def read_wav(p):
    w = wave.open(p); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    return a.reshape(-1, w.getnchannels())


def load_audio(p):
    if p.endswith('.wav'):
        try: return read_wav(p)
        except Exception: pass
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, '-f', 's16le', '-ac', '2', '-ar', str(SR), '-'])
    return np.frombuffer(raw, np.int16).astype(np.float32).reshape(-1, 2) / 32768


def take_audio(take, o, d):
    a = read_wav(RUNS[take][0] + '/audio.wav')
    s, n = int(round(o * SR)), int(round(d * SR))
    seg = a[s:s + n]
    if len(seg) < n: seg = np.vstack([seg, np.zeros((n - len(seg), 2), np.float32)])
    return seg


def music_bed(total, narr, spans):
    """the game's hymn under the title, room and outro; sea wash under everything"""
    hymn = load_audio(f'{os.path.dirname(SP)}/hymn.wav') if os.path.exists(f'{os.path.dirname(SP)}/hymn.wav') else None
    return hymn


def main(which, preview=False):
    S, (W, H), k, G = load_prod()['EDITS'][which]()
    out = f'{SP}/out/{k}'; os.makedirs(f'{out}/segs', exist_ok=True)
    t = 0; starts = []
    for s in S: starts.append(t); t += s['d']
    total = t
    for card, si, a, b in G:
        A, B = starts[si] + a, starts[si] + b
        for sg, t0 in zip(S, starts):
            if A < t0 + sg['d'] and B > t0: sg.setdefault('ov', []).append((card, A - t0 if A > t0 + 1e-6 else -1, B - t0))
    print(f'{which}: {len(S)} segments, {total:.1f} s')
    # narration slots
    narr = []
    for s, t0 in zip(S, starts):
        ns = s.get('n'); ns = [ns] if isinstance(ns, tuple) else (ns or [])
        for key, dl in ns: narr.append((t0 + dl, key, TTS[key][1]))
    narr.sort()
    for a, b in zip(narr, narr[1:]):
        if a[0] + a[2] > b[0] - 0.1: print(f'  !! narration overlap {a[1]} → {b[1]} ({a[0] + a[2]:.2f} > {b[0]:.2f})')
    json.dump({'total': total, 'segs': [[st, s['d'], s['v'][0], s['v'][1]] for s, st in zip(S, starts)], 'narr': narr}, open(f'{out}/timeline.json', 'w'), ensure_ascii=False, indent=1)
    if preview == 'timeline': return
    # video
    lst = []
    for i, s in enumerate(S):
        p = f'{out}/segs/s{i:03d}.mp4'; lst.append(p)
        render_seg(i, s, W, H, p)
    with open(f'{out}/segs/list.txt', 'w') as f: f.write(''.join(f"file '{p}'\n" for p in lst))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{out}/segs/list.txt', '-c', 'copy', f'{out}/video_only.mp4'], check=True)
    # game sound, segment by segment, with short fades at the cuts
    N = int(round(total * SR)); game = np.zeros((N, 2), np.float32)
    for s, t0 in zip(S, starts):
        v = s['v']; d = s['d']
        if v[0] in ('split', 'stack'): a = take_audio(v[1], v[2], d) * 0.75 + take_audio(v[3], v[4], d) * 0.55
        else: a = take_audio(v[1], v[2], d)
        n = len(a); r = min(int(0.02 * SR), n // 2)
        a[:r] *= np.linspace(0, 1, r)[:, None]; a[-r:] *= np.linspace(1, 0, r)[:, None]
        i0 = int(round(t0 * SR)); game[i0:i0 + n] += a[:N - i0]
        if s.get('fade_end'):
            fe = int(s['fade_end'] * SR); game[i0 + n - fe:i0 + n] *= np.linspace(1, 0, fe)[:, None]
    np.save(f'{out}/game.npy', game)
    json.dump({'total': total, 'narr': narr, 'starts': starts, 'segs': [{'d': s['d'], 'v': list(map(str, s['v'])), 'plan': s.get('plan')} for s in S]}, open(f'{out}/timeline.json', 'w'), ensure_ascii=False, indent=1)
    print('  video and game sound done')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else False)
