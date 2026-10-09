"""Single-player promo for the bilibili Toy build: one landscape cut (B站, about 1:45) and three portrait slices (15–25 s).
  python3 dev/promo/productions/2026-10-toy/make.py cards        → $PROMO_WORK/cards/*.png from cards.html
  python3 dev/promo/productions/2026-10-toy/make.py h|v1|v2|v3   → $PROMO_WORK/out/toy/<name>.mp4
Footage comes from the legacy single-player recorder (dev/record/legacy/), driven shot by shot into
$PROMO_WORK/sp/shots (1920×1080) and $PROMO_WORK/sp_v/shots (1080×1920, fov ×1.75): f00000.jpg… at 30 fps plus audio.wav.
Each segment is (shot, start s, length s, [(card, from, to)]); a card with no times covers the whole segment.
Sound is the shots' own game audio, with the game's Navy Hymn under the title and the ending, normalised to -14 LUFS.
No narration and no links: the Toy entry sits under the video."""
import asyncio, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
WORK = os.environ.get('PROMO_WORK') or os.path.abspath('promo-work')
FPS, SR = 30, 48000
HYMN = f'{REPO}/sfx/music_hymn.mp3'

H = [
    ('hook', 0, 4.5, ['h-hook']),
    ('title', 0, 5, ['h-title']),
    ('lineup', 0.5, 5, ['h-lineup']),
    ('d_kongo', 0, 2.6, [('h-details', 0, 99)]), ('d_brooklyn', 0, 2.6, ['h-details']), ('d_fletcher', 0, 2.6, ['h-details']),
    ('g_start', 0, 4, ['h-waves']),
    ('g_nc', 1, 7, ['h-aim']),
    ('g_nc', 9, 5, ['h-scope']),
    ('duel', 0, 6.2, ['h-ballistic']),
    ('shellcam', 0, 7, ['h-shellcam']),
    ('impact', 0, 5.5, ['h-impact']),
    ('sink', 0, 6, [('h-sink', 0.8, 6)]),
    ('g_dd', 0, 9, ['h-torp']),
    ('torp1', 0, 2.8, []),
    ('torp2', 0, 5, [('h-torphit', 2.2, 5)]),
    ('evade', 0, 7, ['h-evade']),
    ('melee_wide', 1, 5, ['h-melee']), ('melee_close', 0, 4.5, []), ('melee_hit', 0, 5.5, []),
    ('outro', 0, 7, [('h-outro', 1.2, 7)]),
]
# the hymn: under the title through the ship details, under the quiet torpedo evasion, and over the ending (cut seconds)
H_MUSIC = [(4.5, 18.5, 0.45), (79.3, 8, 0.4), ('end', 9, 0.6)]

V1 = [('hook', 0, 4.5, ['v-hook']), ('duel', 0, 5.5, ['v-ballistic']), ('impact', 0, 5.5, ['v-impact']), ('sink', 0, 6, [('v-sink', 0.8, 3.6), ('v-end', 3.8, 6)])]
V2 = [('d_fletcher', 0, 2.6, ['v-torp']), ('torp1', 0, 2.8, ['v-torp']), ('torp2', 0, 5, [('v-torphit', 2.2, 5)]), ('evade', 0, 7, [('v-evade', 0, 4.4), ('v-end', 4.6, 7)])]
V3 = [('shellcam', 0, 7, ['v-shellcam']), ('melee_wide', 1, 5, ['v-melee']), ('melee_close', 0, 4.5, ['v-melee']), ('melee_hit', 0, 5.5, [('v-end', 2.8, 5.5)])]
CUTS = {'h': (H, 'sp', (1920, 1080), [], H_MUSIC), 'v1': (V1, 'sp_v', (1080, 1920), ['v-top'], [('end', 5, 0.5)]),
        'v2': (V2, 'sp_v', (1080, 1920), ['v-top'], [('end', 5, 0.5)]), 'v3': (V3, 'sp_v', (1080, 1920), ['v-top'], [('end', 5, 0.5)])}


def run(*a): subprocess.run([str(x) for x in a], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


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
    vlist, alist, total = [], [], 0.0
    for i, (shot, t0, d, cs) in enumerate(segs):
        sd = f'{WORK}/{src}/shots/{shot}'
        cs = [(c, 0, d) if isinstance(c, str) else (c[0], c[1], min(c[2], d)) for c in cs] + [(c, 0, d) for c in always]
        args = ['ffmpeg', '-y', '-framerate', FPS, '-start_number', round(t0 * FPS), '-i', f'{sd}/f%05d.jpg']
        fl = [f'[0:v]scale={w}:{h},setsar=1[b0]']
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
        vlist.append(f"file '{tmp}/{i:02d}.mp4'"); alist.append(f"file '{tmp}/{i:02d}.wav'"); total += d
    open(f'{tmp}/v.txt', 'w').write('\n'.join(vlist)); open(f'{tmp}/a.txt', 'w').write('\n'.join(alist))
    run('ffmpeg', '-y', '-f', 'concat', '-safe', 0, '-i', f'{tmp}/v.txt', '-c', 'copy', f'{tmp}/video.mp4')
    run('ffmpeg', '-y', '-f', 'concat', '-safe', 0, '-i', f'{tmp}/a.txt', '-c', 'copy', f'{tmp}/game.wav')
    # mix: game sound, the hymn where the cut asks for it, fade in from black and out at the end, -14 LUFS
    ins, fl, mix = ['-i', f'{tmp}/video.mp4', '-i', f'{tmp}/game.wav'], [], ['[1:a]']
    for k, (at, d, vol) in enumerate(music):
        at = total - d if at == 'end' else at
        ins += ['-i', HYMN]
        fl.append(f'[{k + 2}:a]atrim=0:{d},asetpts=PTS-STARTPTS,volume={vol},afade=in:st=0:d=1.5,afade=out:st={d - 2.5}:d=2.5,'
                  f'adelay={int(at * 1000)}|{int(at * 1000)}[m{k}]')
        mix.append(f'[m{k}]')
    fl.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:duration=first,afade=out:st={total - 1}:d=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    fl.append(f'[0:v]fade=in:st=0:d=0.4,fade=out:st={total - 1}:d=1[v]')
    run('ffmpeg', '-y', *ins, '-filter_complex', ';'.join(fl), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', 18,
        '-pix_fmt', 'yuv420p', '-r', FPS, '-c:a', 'aac', '-b:a', '192k', '-ar', SR, '-movflags', '+faststart', f'{out}/{name}.mp4')
    print(f'{out}/{name}.mp4', f'{total:.1f}s')


if __name__ == '__main__':
    what = sys.argv[1]
    if what == 'cards': asyncio.run(cards())
    else:
        for n in sys.argv[1:]: cut(n)
