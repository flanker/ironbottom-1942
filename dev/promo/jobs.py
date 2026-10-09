"""Helpers for recorder jobs (dev/record-duel.py): job(), take(), cine(), bt(). A production's prod.py builds its jobs with them."""
import json, os, sys
SP = os.environ.get('PROMO_WORK') or os.path.abspath('promo-work')   # work dir: streams, runs/, takes/, tts/, cards/, out/
def start(sc): return json.load(open(f'{SP}/{sc}.json'))['start'] + 0.04 + 0.15   # what the page shows lags the server
BASE = {sc: start(sc) for sc in ('BB', 'DD', 'CA')}
def opening(side, sc):
    """the clicks that open the page's connection (create / join); a production may replace them (see job(opening=…))"""
    if side == 'US': return [[0, 'click', '#modeDuel'], [0.1, 'click', '#mpCreate']]
    return [[0, 'click', '#modeDuel'], [0.05, 'eval', "document.querySelector('#mpCode').value='1942'"], [0.1, 'click', '#mpJoin']]
def bt(sc, t): return round(BASE[sc] + t, 3)
def job(name, sc, side, plan, takes, w=1536, h=864, opening_plan=None):
    d = f'{SP}/runs'; os.makedirs(d, exist_ok=True)
    j = {'stream': f'{SP}/{sc}.json', 'side': side, 'out': f'{SP}/takes/{sc}', 'w': w, 'h': h, 'plan': (opening(side, sc) if opening_plan is None else opening_plan) + plan, 'takes': takes}
    json.dump(j, open(f'{d}/{name}.json', 'w'), ensure_ascii=False, indent=0)
    return f'{d}/{name}.json'
def take(name, sc, a, b, every=1, absolute=False):
    t0, t1 = (a, b) if absolute else (bt(sc, a), bt(sc, b))
    return {'name': name, 't0': round(t0, 3), 't1': round(t1, 3), **({'every': every} if every > 1 else {})}
def cine(sc, a, cam, **o):
    return [[bt(sc, a) - 0.001, 'cine', 1], [bt(sc, a) - 0.001, 'cam', cam, o]]
