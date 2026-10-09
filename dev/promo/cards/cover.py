"""Covers: python3 dev/promo/cards/cover.py  → $PROMO_WORK/out/cover_bilibili_1920x1080.png, cover_xhs_1080x1440.png
$PROMO_PROD/cover.html names its background and inset frames as {{TAKES}}/<SC>/<take>/fNNNNN.jpg; pick them with tsheet.py first."""
import asyncio, os
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__))
W = os.environ.get('PROMO_WORK') or os.path.abspath('promo-work')
PROD = os.path.abspath(os.environ.get('PROMO_PROD') or os.path.join(D, '../productions/2026-10-duel'))
async def main():
    html = open(f'{PROD}/cover.html').read().replace('{{TAKES}}', f'{W}/takes')
    page = f'{W}/cards/_cover.html'; os.makedirs(f'{W}/cards', exist_ok=True); os.makedirs(f'{W}/out', exist_ok=True)
    open(page, 'w').write(html)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--allow-file-access-from-files']); pg = await b.new_page(viewport={'width': 1920, 'height': 2600})
        await pg.goto('file://' + page); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(500)
        await pg.locator('#h').screenshot(path=f'{W}/out/cover_bilibili_1920x1080.png')
        await pg.locator('#v').screenshot(path=f'{W}/out/cover_xhs_1080x1440.png')
        await b.close()
asyncio.run(main())
