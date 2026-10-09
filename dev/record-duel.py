"""Promo footage of the online duel, step 3: drive one captain's page frame by frame and screenshot it.

    python3 dev/record-duel.py job.json

job: { "stream": "BB.json", "side": "US", "out": "shots/x", "w": 1536, "h": 864, "dpr": 1.25, "fps": 30,
       "plan": [[t, action, ...args], ...], "takes": [{"name": "lobby", "t0": 0, "t1": 12}, ...] }
The page is the real game served by `npm start` (port 8080), with dev/record-duel-boot.js injected before its scripts and
dev/record-duel.js after. Session time runs from 0; frames outside every take are stepped but not captured. Each take
gets frames <out>/<name>/f00000.jpg… and <out>/<name>/audio.wav (the game's sounds for exactly those frames).
"""
import asyncio, base64, json, os, sys, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('IBS_URL', 'http://localhost:8080/')


def page_html(orig):
    boot = open(os.path.join(ROOT, 'dev/record-duel-boot.js')).read()
    rec = open(os.path.join(ROOT, 'dev/record-duel.js')).read()
    html = orig.replace('<head>', '<head><script>window.__IBS_DEBUG = true;</script><script>' + boot + '</script>', 1)
    # a hook between the game camera and the render, for the film crew's cameras
    a = '  updateCamera(dt);\n  renderView();'
    assert a in html, 'frame() changed'
    html = html.replace(a, '  updateCamera(dt); if (window.__camHook) window.__camHook(dt);\n  renderView();', 1)
    b = 'get shells() { return world.shells; },'
    assert b in html
    html = html.replace(b, b + ' get vshells() { return vshells; },', 1)
    return html.replace('</body>', '<script>' + rec + '</script></body>', 1)


async def main(job_path):
    job = json.load(open(job_path))
    base = os.path.dirname(os.path.abspath(job_path))
    stream = json.load(open(os.path.join(base, job['stream']) if not os.path.isabs(job['stream']) else job['stream']))
    out = job['out'] if os.path.isabs(job['out']) else os.path.join(base, job['out'])
    fps, w, h, dpr = job.get('fps', 30), job.get('w', 1536), job.get('h', 864), job.get('dpr', 1.25)
    takes = sorted(job['takes'], key=lambda t: t['t0'])
    end = max(t['t1'] for t in takes)
    async with async_playwright() as p:
        br = await p.chromium.launch(headless=True, args=job.get('args', ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']))
        ctx = await br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr)
        await ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL.rstrip('/'))
        page = await ctx.new_page()
        page.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
        page.on('console', lambda m: print('  [page]', m.type, m.text[:300]) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: print('  [pageerror]', e))

        async def route(r):
            resp = await r.fetch()
            await r.fulfill(response=resp, body=page_html(await resp.text()), headers={**resp.headers, 'content-type': 'text/html; charset=utf-8'})
        await page.route(URL, route)
        await page.goto(URL)
        await page.wait_for_function('window.__dr && window.__ibs && document.fonts.status === "loaded"', timeout=60000)
        await page.evaluate('document.fonts.ready')
        n = await page.evaluate('([s, side, plan]) => __dr.load(s, side, plan)', [stream, job['side'], job.get('plan', [])])
        print(f"{job_path}: {n} messages for {job['side']}, {len(takes)} takes to {end:.1f} s")
        dt = 1000 / fps
        nframes = int(round(end * fps))
        cur, k, t_start = None, 0, time.time()
        for i in range(nframes):
            t = i / fps                       # session time of the frame about to be shown
            take = next((tk for tk in takes if tk['t0'] - 1e-6 <= t < tk['t1'] - 1e-6), None)
            if take is not cur:
                if cur is not None:
                    await finish(page, cur, out, fps, k)
                cur, k = take, 0
                if take:
                    os.makedirs(os.path.join(out, take['name']), exist_ok=True)
                    await page.evaluate('__dr.startLog()')
                    print(f"  take {take['name']} {take['t0']:.2f}–{take['t1']:.2f}")
            await page.evaluate(f'__vc.advance({dt})')
            if take and (i - int(round(take['t0'] * fps))) % take.get('every', 1) == 0:
                await page.screenshot(path=os.path.join(out, take['name'], f'f{k:05d}.jpg'), type='jpeg', quality=92, animations='allow', caret='initial')
                k += 1
            if i % 300 == 0:
                errs = await page.evaluate('__dr.err.splice(0)')
                if errs: print('  director:', errs)
                print(f'  frame {i}/{nframes} t={t:.1f}s  {time.time() - t_start:.0f}s elapsed', flush=True)
        if cur is not None:
            await finish(page, cur, out, fps, k)
        await br.close()


async def finish(page, take, out, fps, k):
    if take.get('every', 1) > 1:   # a preview: stills only
        await page.evaluate('__dr.stopLog()')
        print(f"  take {take['name']}: {k} stills")
        return
    dur = k / fps
    b64 = await page.evaluate('async ([t0, dur]) => { const l = __dr.stopLog(); return await __dr.renderAudio(l, __dr.logT0, dur); }', [take['t0'], dur])
    with open(os.path.join(out, take['name'], 'audio.wav'), 'wb') as f:
        f.write(base64.b64decode(b64))
    print(f"  take {take['name']}: {k} frames, audio {dur:.2f} s")


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1]))
