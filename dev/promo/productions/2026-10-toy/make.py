"""Single-player promo for the bilibili Toy build: one landscape cut (B站, about 2:08, narrated) and three portrait slices.
  python3 dev/promo/productions/2026-10-toy/make.py cards           → $PROMO_WORK/cards/*.png from cards.html
  python3 dev/promo/productions/2026-10-toy/make.py h|v1|v2|v3      → $PROMO_WORK/out/toy/<name>.mp4 (+ <name>_vo.mp4, guide.wav)
  python3 dev/promo/productions/2026-10-toy/make.py export <dir>    → the landscape deliverables: both mp4s, 旁白稿.md, SRT, AI track
Footage comes from the legacy single-player recorder (dev/record/legacy/), driven shot by shot into
$PROMO_WORK/sp/shots (1920×1080) and $PROMO_WORK/sp_v/shots (1080×1920, fov ×1.75): f00000.jpg… at 30 fps plus audio.wav.
Narration: lines.json → `PROMO_PROD=dev/promo/productions/2026-10-toy python3 dev/promo/tts.py` (edge-tts guide read, $PROMO_WORK/tts/b).
A segment is (shot, start s, length s, cards, narration); a card with no times covers the segment; a segment longer than its
footage holds the last frame; narration (key, delay) starts at the later of segment start + delay and the previous line's end + GAP.
Sound: the shots' game audio and the game's Navy Hymn, both ducked under the narration (DUCK_*), -14 LUFS.
<name>.mp4 has the ducking but no voice (for the author's own read); <name>_vo.mp4 has the AI read mixed in. No links on screen."""
import asyncio, json, os, re, shutil, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
WORK = os.environ.get('PROMO_WORK') or os.path.abspath('promo-work')
FPS, SR, GAP = 30, 48000, 0.3
# under the narration: game sound and music both down to 30 % (gunfire is dense here; 50 % buried the voice), voice 4 dB over the bed
DUCK_GAME, DUCK_MUSIC = 0.3, 0.3
# lines that land on a salvo or a hit get the game sound pushed further down
DUCK_LINE = {'ballistic': 0.15, 'impact': 0.12, 'torphit': 0.12, 'scope': 0.2, 'result': 0.2}
HYMN = f'{REPO}/sfx/music_hymn.mp3'
LINES = dict(json.load(open(f'{HERE}/lines.json'))['b'])

H = [
    ('hook', 0, 4.5, ['h-hook'], None),
    ('title', 0, 5, ['h-title'], ('title', 0.4)),
    ('long_tele', 0, 8, [], ('setting', 0.3)),
    ('lineup', 0, 6, ['h-lineup'], ('ships', 0.3)),
    ('d_kongo', 0, 2.6, ['h-details'], ('details', 0.3)), ('d_brooklyn', 0, 2.6, ['h-details'], None),
    ('d_fletcher', 0, 2.6, ['h-details'], None), ('d_takao', 0, 2.6, ['h-details'], None),
    ('g_start', 0, 4, ['h-waves'], ('waves', 0.3)),
    ('g_nc', 1, 8, ['h-aim'], ('aim', 0.3)),
    ('g_nc', 9, 6, ['h-scope'], ('scope', 0.3)),
    ('duel', 0, 6.2, ['h-ballistic'], ('ballistic', 0.4)),
    ('shellcam', 0, 7, ['h-shellcam'], ('shellcam', 0.3)),
    ('impact', 0, 5.5, ['h-impact'], ('impact', 1.0)),
    ('sink', 0, 6, [('h-sink', 0.8, 6)], ('sink', 0.6)),
    ('g_dd', 0, 10, ['h-torp'], ('dd', 0.3)),
    ('torp1', 0, 2.8, [], None),
    ('torp2', 0, 5, [('h-torphit', 2.2, 5)], ('torphit', 2.3)),
    ('evade', 0, 7, ['h-evade'], ('evade', 0.5)),
    ('melee_wide', 1, 6, ['h-melee'], ('melee', 0.4)), ('melee_close', 0, 6, [], ('result', 3.0)), ('melee_hit', 0, 5.5, [], None),
    ('outro', 0, 9, [('h-outro', 1.2, 9)], ('outro', 0.5)),
]
# the hymn (cut seconds, length, level): under the title stretch, under the quiet torpedo evasion, over the ending
H_MUSIC = [(4.5, 18, 0.45), (94.1, 8, 0.4), ('end', 10, 0.6)]
# what is on screen for each line, for the narration script
PIC = {
    'title': '片名：无人机掠过航行中的舰队，叠「铁底湾1942」', 'setting': '远景：战列舰在夕阳下向远方齐射',
    'ships': '三艘可选座舰并排航行：驱逐舰、轻巡、战列舰', 'details': '舰船特写：金刚型塔桅、海伦娜号弹射器、弗莱彻号鱼雷管、高雄型舰桥',
    'waves': '实机画面（华盛顿号）：第三波开局横幅', 'aim': '实机画面：HUD、提前量标记、齐射', 'scope': '实机画面：开望远镜瞄准',
    'ballistic': '华盛顿号对雾岛远距离炮战', 'shellcam': '跟着一发 16 英寸炮弹飞向雾岛', 'impact': '雾岛中弹起火',
    'sink': '雾岛爆炸下沉，叠「击沉雾岛！」', 'dd': '实机画面（弗莱彻号）：绕到侧面放鱼雷', 'torphit': '鱼雷齐射，命中水柱',
    'evade': '急转规避：鱼雷从两舷擦过', 'melee': '巡洋舰、驱逐舰战列对射', 'result': '近距离混战，命中', 'outro': '华盛顿号驶向夕阳，叠片尾卡',
}

V1 = [('hook', 0, 4.5, ['v-hook'], None), ('duel', 0, 5.5, ['v-ballistic'], None), ('impact', 0, 5.5, ['v-impact'], None),
      ('sink', 0, 6, [('v-sink', 0.8, 3.6), ('v-end', 3.8, 6)], None)]
V2 = [('d_fletcher', 0, 2.6, ['v-torp'], None), ('torp1', 0, 2.8, ['v-torp'], None), ('torp2', 0, 5, [('v-torphit', 2.2, 5)], None),
      ('evade', 0, 7, [('v-evade', 0, 4.4), ('v-end', 4.6, 7)], None)]
V3 = [('shellcam', 0, 7, ['v-shellcam'], None), ('melee_wide', 1, 5, ['v-melee'], None), ('melee_close', 0, 4.5, ['v-melee'], None),
      ('melee_hit', 0, 5.5, [('v-end', 2.8, 5.5)], None)]
CUTS = {'h': (H, 'sp', (1920, 1080), [], H_MUSIC), 'v1': (V1, 'sp_v', (1080, 1920), ['v-top'], [('end', 5, 0.5)]),
        'v2': (V2, 'sp_v', (1080, 1920), ['v-top'], [('end', 5, 0.5)]), 'v3': (V3, 'sp_v', (1080, 1920), ['v-top'], [('end', 5, 0.5)])}


def run(*a): subprocess.run([str(x) for x in a], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
def dur(p): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]))
def tts(key): return next(f'{WORK}/tts/b/{f}' for f in sorted(os.listdir(f'{WORK}/tts/b')) if f[3:-4] == key)


def load(p):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'])
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def save(p, a):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', p], input=a.astype(np.float32).tobytes(), check=True)


def place(track, clip, at):
    i = int(at * SR); n = max(0, min(len(clip), len(track) - i)); track[i:i + n] += clip[:n]


def ramp_env(n, spans, r=0.2):
    """1 outside the spans, each span's `low` inside, with r-second ramps"""
    t = np.arange(n) / SR; e = np.ones(n, np.float32)
    for a, b, low in spans:
        k = np.clip(np.minimum(t - (a - r), (b + r) - t) / r, 0, 1)
        e = np.minimum(e, 1 - (1 - low) * k)
    return e


def schedule(segs):
    """segment start times and narration slots [(start, key, length)]; warns where a line runs well past its segment"""
    starts, narr, t, end = [], [], 0.0, -GAP
    for shot, t0, d, cs, n in segs:
        starts.append(t)
        if n:
            key, delay = n; a = max(t + delay, end + GAP); L = dur(tts(key)); end = a + L
            narr.append((round(a, 2), key, round(L, 2)))
            if end > t + d + 3: print(f'  WARN {key}: runs {end - t - d:.1f}s past its segment ({shot})')
        t += d
    if end > t - 1: print(f'  WARN narration ends at {end:.1f}s, the cut fades out at {t - 1:.1f}s')
    return starts, narr, t


async def cards():
    from playwright.async_api import async_playwright
    os.makedirs(f'{WORK}/cards', exist_ok=True)
    page = f'{WORK}/cards/_toy_cards.html'
    open(page, 'w').write(open(f'{HERE}/cards.html').read().replace('{{REPO}}', 'file://' + REPO))
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--allow-file-access-from-files']); pg = await b.new_page(viewport={'width': 1920, 'height': 1920})
        await pg.goto('file://' + page); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(500)
        for cid in await pg.eval_on_selector_all('.card', 'els => els.map(e => e.id)'):
            await pg.locator('#' + cid).screenshot(path=f'{WORK}/cards/{cid}.png', omit_background=True)
        await b.close()


def cut(name):
    segs, src, (w, h), always, music = CUTS[name]
    out = f'{WORK}/out/toy'; tmp = f'{out}/_{name}'; os.makedirs(tmp, exist_ok=True)
    starts, narr, total = schedule(segs)
    vlist, alist = [], []
    for i, (shot, t0, d, cs, _) in enumerate(segs):
        sd = f'{WORK}/{src}/shots/{shot}'
        cs = [(c, 0, d) if isinstance(c, str) else (c[0], c[1], min(c[2], d)) for c in cs] + [(c, 0, d) for c in always]
        args = ['ffmpeg', '-y', '-framerate', FPS, '-start_number', round(t0 * FPS), '-i', f'{sd}/f%05d.jpg']
        fl = [f'[0:v]scale={w}:{h},setsar=1,tpad=stop_mode=clone:stop_duration={d}[b0]']
        for k, (c, a, e) in enumerate(cs):
            args += ['-loop', 1, '-framerate', FPS, '-t', d, '-i', f'{WORK}/cards/{c}.png']
            fin = '' if a <= 0.01 and i > 0 and c in always else f',fade=in:st={a}:d=0.3:alpha=1'
            fout = '' if c in always and i < len(segs) - 1 else f',fade=out:st={max(a, e - 0.3)}:d=0.3:alpha=1'
            fl.append(f'[{k + 1}:v]format=rgba{fin}{fout}[c{k}]')
            fl.append(f'[b{k}][c{k}]overlay=0:0:enable=\'between(t,{a},{e})\'[b{k + 1}]')
        args += ['-filter_complex', ';'.join(fl), '-map', f'[b{len(cs)}]', '-frames:v', round(d * FPS), '-r', FPS,
                 '-c:v', 'libx264', '-preset', 'medium', '-crf', 17, '-pix_fmt', 'yuv420p', f'{tmp}/{i:02d}.mp4']
        run(*args)
        run('ffmpeg', '-y', '-ss', t0, '-t', d, '-i', f'{sd}/audio.wav', '-af', f'apad,atrim=0:{d},afade=in:st=0:d=0.03,afade=out:st={d - 0.06}:d=0.06',
            '-ar', SR, '-ac', 2, f'{tmp}/{i:02d}.wav')
        vlist.append(f"file '{tmp}/{i:02d}.mp4'"); alist.append(f"file '{tmp}/{i:02d}.wav'")
    open(f'{tmp}/v.txt', 'w').write('\n'.join(vlist)); open(f'{tmp}/a.txt', 'w').write('\n'.join(alist))
    run('ffmpeg', '-y', '-f', 'concat', '-safe', 0, '-i', f'{tmp}/v.txt', '-c', 'copy', f'{tmp}/video.mp4')
    run('ffmpeg', '-y', '-f', 'concat', '-safe', 0, '-i', f'{tmp}/a.txt', '-c', 'copy', f'{tmp}/game.wav')

    # mix: game sound and hymn, ducked where the narration goes; the AI read on its own track, same timeline
    N = int(total * SR); game = np.zeros((N, 2), np.float32); place(game, load(f'{tmp}/game.wav'), 0)
    hymn, mus = load(HYMN), np.zeros((N, 2), np.float32)
    for at, d, vol in music:
        at = total - d if at == 'end' else at; n = int(d * SR); t = np.arange(n) / SR
        env = np.clip(np.minimum(t / 1.5, (d - t) / 2.5), 0, 1)[:, None] * vol
        place(mus, hymn[:n] * env[:len(hymn[:n])], at)
    bed = (game * ramp_env(N, [(a, a + L, DUCK_LINE.get(k, DUCK_GAME)) for a, k, L in narr])[:, None]
           + mus * ramp_env(N, [(a, a + L, DUCK_MUSIC) for a, k, L in narr])[:, None])
    save(f'{tmp}/mix.wav', bed)
    guide = np.zeros((N, 2), np.float32)
    for a, key, L in narr: place(guide, load(tts(key)), a)
    save(f'{out}/{name}_guide.wav', guide)
    json.dump({'total': total, 'narr': narr, 'starts': starts}, open(f'{out}/{name}_timeline.json', 'w'), ensure_ascii=False)

    vf = f'fade=in:st=0:d=0.4,fade=out:st={total - 1}:d=1'
    enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', 18, '-pix_fmt', 'yuv420p', '-r', FPS, '-c:a', 'aac', '-b:a', '192k', '-ar', SR, '-movflags', '+faststart']
    run('ffmpeg', '-y', '-i', f'{tmp}/video.mp4', '-i', f'{tmp}/mix.wav', '-filter_complex',
        f'[0:v]{vf}[v];[1:a]afade=out:st={total - 1}:d=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]', '-map', '[v]', '-map', '[a]', *enc, f'{out}/{name}.mp4')
    print(f'{out}/{name}.mp4', f'{total:.1f}s')
    if narr:
        run('ffmpeg', '-y', '-i', f'{tmp}/video.mp4', '-i', f'{tmp}/mix.wav', '-i', f'{out}/{name}_guide.wav', '-filter_complex',
            f'[0:v]{vf}[v];[1:a]loudnorm=I=-18:TP=-2[g];[2:a]loudnorm=I=-14:TP=-1.5[n];'
            f'[g][n]amix=inputs=2:normalize=0,afade=out:st={total - 1}:d=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]', '-map', '[v]', '-map', '[a]', *enc, f'{out}/{name}_vo.mp4')
        print(f'{out}/{name}_vo.mp4')
        for a, key, L in narr: print(f'  {a:6.1f}–{a + L:6.1f}  {key:10s} {LINES[key]}')


def tc(t, srt=False):
    m, s = divmod(t, 60)
    return f'00:{int(m):02d}:{s:06.3f}'.replace('.', ',') if srt else f'{int(m)}:{s:04.1f}'


def export(dest):
    out = f'{WORK}/out/toy'; tl = json.load(open(f'{out}/h_timeline.json')); narr, total = tl['narr'], tl['total']
    os.makedirs(dest, exist_ok=True)
    cues = []
    for a, key, L in narr:   # SRT: split a line at sentence punctuation, time shared by length
        parts = [p for p in re.split(r'(?<=[。！？：])', LINES[key]) if p.strip()]; n = sum(len(p) for p in parts); x = a
        for p in parts: cues.append((x, x + L * len(p) / n, p.rstrip('。；：'))); x += L * len(p) / n
    with open(f'{dest}/旁白字幕.srt', 'w') as f:
        for i, (a, b, t) in enumerate(cues, 1): f.write(f'{i}\n{tc(a, True)} --> {tc(b, True)}\n{t}\n\n')
    with open(f'{dest}/旁白稿.md', 'w') as f:
        f.write(f'# 铁底湾1942 单人战役 · B站横版 旁白稿\n\n全片 {tc(total)}（{total:.1f} 秒）。`铁底湾1942_单人战役_横版_AI旁白.mp4` 已经混好了 AI 旁白（edge-tts 云希），可以直接发；'
                '想自己配音就用 `铁底湾1942_单人战役_横版_无旁白.mp4`：每句旁白的位置已经把游戏声和音乐压低了，录完按时间码对上即可。'
                '「参考时长」是 AI 试读的长度，自己读快慢差半秒左右没关系。\n\n开头 0:00–0:04.5 是精华片段，没有旁白。\n\n')
        f.write('| # | 开始 | 参考时长 | 台词 | 画面 |\n|---|---|---|---|---|\n')
        for i, (a, key, L) in enumerate(narr, 1): f.write(f'| {i} | {tc(a)} | {L:.1f}s | {LINES[key]} | {PIC.get(key, "")} |\n')
        f.write('\n## 纯台词（照着念）\n\n')
        for a, key, L in narr: f.write(f'[{tc(a)}] {LINES[key]}\n\n')
    shutil.copy(f'{out}/h_vo.mp4', f'{dest}/铁底湾1942_单人战役_横版_AI旁白.mp4')
    shutil.copy(f'{out}/h.mp4', f'{dest}/铁底湾1942_单人战役_横版_无旁白.mp4')
    run('ffmpeg', '-y', '-i', f'{out}/h_guide.wav', '-af', 'loudnorm=I=-16:TP=-1.5', '-c:a', 'aac', '-b:a', '160k', f'{dest}/AI试读参考音轨_对齐成片.m4a')
    print('exported', dest)


if __name__ == '__main__':
    what = sys.argv[1]
    if what == 'cards': asyncio.run(cards())
    elif what == 'export': export(sys.argv[2])
    else:
        for n in sys.argv[1:]: cut(n)
