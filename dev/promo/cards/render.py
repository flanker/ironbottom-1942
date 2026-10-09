"""Title cards (dev/promo/cards/cards.html, in the game's fonts) → transparent PNGs in $PROMO_WORK/cards/."""
import asyncio, os, sys
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.environ.get('PROMO_WORK') or os.path.abspath('promo-work'), 'cards'); os.makedirs(OUT, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1920, 'height': 1920})
        await pg.goto('file://' + D + '/cards.html'); await pg.evaluate('document.fonts.ready')
        names = await pg.evaluate('Object.keys(CARDS)')
        for n in names:
            w, h, opaque = await pg.evaluate('n => render(n)', n)
            await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(50)
            await pg.locator('#c').screenshot(path=f'{OUT}/{n}.png', omit_background=not opaque)
        print(len(names), 'cards')
        await b.close()
asyncio.run(main())
