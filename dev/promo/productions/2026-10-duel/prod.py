"""Recorder jobs for the 2026-10 duel promo (BB seed 12, DD seed 26, CA seed 17).
   python3 dev/promo/productions/2026-10-duel/prod.py > $PROMO_WORK/runs/list.txt
lobby() is the BB room scene; its click times match SCENARIOS.BB.lobby in dev/record/duel-stream.js."""
import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..')); from jobs import *
CLS = lambda v: f'#lbCls button[data-v="{v}"]'
ESC = lambda v: f'#lbEsc button[data-v="{v}"]'
def lobby(side):
    """the BB session's room scene, in session seconds (out time = session + 10.5)"""
    if side == 'US':
        return [[0, 'cursor', 1, 1180, 470], [3.6, 'move', '#modeSolo', 1.0, 0, -20], [7.4, 'move', '#modeDuel', 1.0, 0, -20],
                [12.6, 'move', '#modeDuel', 0.6, 60, 10], [13.6, 'click', '#modeDuel'], [14.8, 'move', '#mpCreate', 0.8], [16.3, 'click', '#mpCreate'],
                [19.8, 'move', '#lbCopy', 0.8], [21.0, 'click', '#lbCopy'],
                [30.0, 'move', CLS('DD'), 0.5], [31.0, 'move', CLS('CL'), 0.4], [31.8, 'move', CLS('CA'), 0.4], [32.6, 'move', CLS('BB'), 0.5], [34.0, 'click', CLS('BB')],
                [39.8, 'move', '.lb-side[data-side="US"] dl', 0.8], [43.6, 'move', '.lb-side[data-side="JP"] dl', 0.9],
                [49.0, 'move', ESC(2), 0.8], [52.0, 'move', ESC(0), 0.6], [53.5, 'click', ESC(0)],
                [56.2, 'move', '#lbReady', 0.6], [57.0, 'click', '#lbReady'], [59.5, 'move', [1300, 760], 1.0], [61.0, 'cursor', 0]]
    return [[11.0, 'cursor', 1, 1100, 640], [12.6, 'move', '#modeDuel', 0.8, 0, -20], [13.8, 'click', '#modeDuel'],
            [23.4, 'move', '#mpCode', 0.7], [24.2, 'click', '#mpCode'], [24.4, 'type', '#mpCode', '1942', 5], [25.5, 'move', '#mpJoin', 0.6], [26.6, 'click', '#mpJoin'],
            [57.0, 'move', '#lbReady', 0.7], [58.0, 'click', '#lbReady'], [59.5, 'move', [1250, 760], 1.0], [61.0, 'cursor', 0]]

PW, PH = 864, 1536   # portrait viewport (×1.25 = 1080×1920)
def zoom(sc, a, b): return [[bt(sc, a), 'zoom', 1], [bt(sc, b), 'zoom', 0]]
def again(sc, a): return [[bt(sc, a - 1.2), 'cursor', 1, 900, 700], [bt(sc, a - 1.0), 'move', '#againBtn', 0.8], [bt(sc, a), 'click', '#againBtn']]
L = BASE['BB']
J = []
# ---- battleships: the room scene and the battle through each captain's eyes
J.append(job('bb_us', 'BB', 'US', again('BB', 147),
    [take('bb_us_lobby', 'BB', 0, L + 12, absolute=True), take('bb_us_mid', 'BB', 94, 112), take('bb_us_end', 'BB', 126, 152)]))
J.append(job('bb_jp', 'BB', 'JP', again('BB', 148),
    [take('bb_jp_lobby', 'BB', 11, L + 12, absolute=True), take('bb_jp_mid', 'BB', 94, 112), take('bb_jp_end', 'BB', 126, 152)]))
# ---- battleships: the film crew
def bb_c1(p=False):
    f = 1.75 if p else 1
    pl = cine('BB', 3.5, 'target', ship='JP', **{'from': 'US', 'd0': 360, 'd1': 320, 'h': 22, 'sw0': -0.6, 'sw1': -0.45, 'dur': 7, 'fov': 30 * f}) \
       + cine('BB', 69.0, 'shell', ship='US', at='JP', pick=1, side=0, back=30, fov=48 * (1.3 if p else 1)) \
       + cine('BB', 127.0, 'orbit', ship='JP', az0=-1.9, az1=-1.3, d0=340, d1=300, el=0.12, ly=6, dur=18, fov=30 * f)
    s = 'p' if p else ''
    return pl, [take(f'bb_tgtJP{s}', 'BB', 3.5, 10.5), take(f'bb_shell{s}', 'BB', 69.0, 80.0), take(f'bb_sink{s}', 'BB', 127, 145)]
pl, tk = bb_c1(); J.append(job('bb_c1', 'BB', 'US', pl, tk, opening_plan=lobby('US')))
pl, tk = bb_c1(True); J.append(job('bb_c1p', 'BB', 'US', pl, tk, PW, PH, opening_plan=lobby('US')))
def bb_c2(p=False):
    f = 1.75 if p else 1; s = 'p' if p else ''
    pl = cine('BB', 4.5, 'target', ship='US', **{'from': 'JP', 'd0': 380, 'd1': 340, 'h': 24, 'sw0': 0.55, 'sw1': 0.4, 'dur': 6, 'fov': 30 * f}) \
       + cine('BB', 20, 'chase', ship='US', at='JP', back=440, off=70, h=80, aim=0.5, fov0=30 * f, fov1=26 * f, dur=9) \
       + cine('BB', 40, 'orbit', ship='US', az0=2.5, az1=1.8, d0=330, d1=290, el=0.08, ly=14, dur=9, fov=32 * f)
    return pl, [take(f'bb_tgtUS{s}', 'BB', 4.5, 10.5), take(f'bb_chase{s}', 'BB', 20, 29), take(f'bb_orbUS{s}', 'BB', 40, 49)]
pl, tk = bb_c2(); J.append(job('bb_c2', 'BB', 'JP', pl, tk, opening_plan=lobby('JP')))
pl, tk = bb_c2(True); J.append(job('bb_c2p', 'BB', 'JP', pl, tk, PW, PH, opening_plan=lobby('JP')))
# ---- destroyers
J.append(job('dd_us', 'DD', 'US', [], [take('dd_us_a', 'DD', 88, 108), take('dd_us_b', 'DD', 126, 152)]))
J.append(job('dd_jp', 'DD', 'JP', [], [take('dd_jp_a', 'DD', 74, 108)]))
def dd_c1(p=False):
    f = 1.75 if p else 1; s = 'p' if p else ''
    pl = cine('DD', 90, 'chase', ship='JP', at='US', back=260, off=50, h=45, aim=0.5, fov0=34 * f, fov1=30 * f, dur=8) \
       + cine('DD', 98.5, 'target', ship='US', **{'from': 'JP', 'd0': 230, 'd1': 200, 'h': 18, 'sw0': 0.35, 'sw1': 0.25, 'dur': 7, 'fov': 34 * f}) \
       + cine('DD', 141, 'target', ship='JP', **{'from': 'US', 'd0': 240, 'd1': 210, 'h': 20, 'sw0': -0.5, 'sw1': -0.3, 'dur': 12, 'fov': 32 * f})
    return pl, [take(f'dd_chase{s}', 'DD', 90, 98), take(f'dd_torp{s}', 'DD', 98.5, 106.5), take(f'dd_sink{s}', 'DD', 141, 153)]
pl, tk = dd_c1(); J.append(job('dd_c1', 'DD', 'JP', pl, tk))
pl, tk = dd_c1(True); J.append(job('dd_c1p', 'DD', 'JP', pl, tk, PW, PH))
# ---- cruisers with escorts
J.append(job('ca_us', 'CA', 'US', [], [take('ca_us_a', 'CA', 60, 86), take('ca_us_b', 'CA', 166, 183)]))
J.append(job('ca_jp', 'CA', 'JP', [], [take('ca_jp_a', 'CA', 60, 86), take('ca_jp_b', 'CA', 117, 131)]))
pl = cine('CA', 64, 'chase', ship='US', at='JP', back=330, off=120, h=95, aim=0.45, fov0=40, fov1=34, dur=12) \
   + cine('CA', 78, 'orbit', ship='US', az0=1.9, az1=1.4, d0=380, d1=330, el=0.1, ly=10, dur=8, fov=34) \
   + cine('CA', 138, 'target', ship='US', **{'from': '天雾', 'd0': 330, 'd1': 290, 'h': 22, 'sw0': 0.45, 'sw1': 0.3, 'dur': 8, 'fov': 32})
J.append(job('ca_c1', 'CA', 'US', pl, [take('ca_wide', 'CA', 64, 76), take('ca_orbUS', 'CA', 78, 86), take('ca_torpUS', 'CA', 138, 146)]))
print('\n'.join(J))
