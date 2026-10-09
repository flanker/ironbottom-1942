// The battle itself: ships, guns, torpedoes, the AI and the sea they fight on. No DOM and no three.js, so the same file
// runs the single-player game in the page and the duel rooms on the server (server/). Whatever should be seen or heard is
// emitted as an event (World.emit) for the page to play; on the server the events go out with the snapshots.
(function (root) {
'use strict';
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
const wrapA = a => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const angDiff = (a, b) => wrapA(b - a);
const KN = 0.5144 * 2.6;             // knots -> game m/s (time-compressed)
const MAP_R = 6500;

// ---------------------------------------------------------------- noise
function hash2(ix, iy) { let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), ux), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy); }
function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s / 0.97; }

// ---------------------------------------------------------------- data
const GUNS = {
  us127: { cal: 127, label: '5"/38', dmg: 430, reload: 3.2, range: 5600, vh: 1350, arc: .075, disp: 95, fire: .05, trav: 28 },
  us152: { cal: 152, label: '6"/47', dmg: 640, reload: 5.2, range: 7200, vh: 1420, arc: .085, disp: 115, fire: .07, trav: 14 },
  us203: { cal: 203, label: '8"/55', dmg: 1350, reload: 11, range: 8200, vh: 1460, arc: .1, disp: 140, fire: .1, trav: 9 },
  us406: { cal: 406, label: '16"/45', dmg: 4400, reload: 24, range: 9800, vh: 1520, arc: .12, disp: 165, fire: .2, trav: 7 },
  jp127: { cal: 127, label: '12.7cm', dmg: 400, reload: 5, range: 5400, vh: 1300, arc: .08, disp: 105, fire: .05, trav: 14 },
  jp140: { cal: 140, label: '14cm', dmg: 520, reload: 6, range: 6200, vh: 1350, arc: .09, disp: 120, fire: .06, trav: 12 },
  jp203: { cal: 203, label: '20.3cm', dmg: 1350, reload: 12, range: 8000, vh: 1450, arc: .1, disp: 145, fire: .1, trav: 8 },
  jp356: { cal: 356, label: '35.6cm', dmg: 3600, reload: 22, range: 9200, vh: 1480, arc: .12, disp: 165, fire: .18, trav: 5 },
  sec127: { cal: 127, label: '5"/38', dmg: 260, reload: 4.5, range: 4300, vh: 1300, arc: .07, disp: 95, fire: .03, trav: 22 },
  sec152: { cal: 152, label: '15.2cm', dmg: 330, reload: 6, range: 4500, vh: 1320, arc: .08, disp: 110, fire: .04, trav: 15 },
};
for (const k in GUNS) { const g = GUNS[k]; g.g = 8 * g.arc * g.vh * g.vh / g.range; }
const TORPS = {
  mk15: { label: 'Mk15', speed: 62, range: 4600, dmg: 6500, reload: 38, salvo: 5, spread: 3.0, visR: 1e9 },
  t93: { label: '九三式', speed: 66, range: 7800, dmg: 6200, reload: 75, salvo: 4, spread: 3.4, visR: 2300 },
};
// turret houses: cf front-corner chamfer, fs/rs front/rear slope, ss side slope, rr rounded rear, hood sight hoods, ears rangefinder
const TS = {
  us5s: { len: 5.4, h: 2.8, w: 4.0, bl: 6.2, br: .17, n: 1, cf: .12, fs: .3, ss: .1, rs: .04, hood: 1 },
  us5d: { len: 4.6, h: 2.3, w: 3.8, bl: 5.6, br: .15, n: 2, cf: .12, fs: .28, ss: .1, rs: .04, hood: 1 },
  us6t: { len: 9.5, h: 3.2, w: 7.4, bl: 9.5, br: .26, n: 3, cf: .16, fs: .2, ss: .08, rs: .02, ears: 1 },
  us8t: { len: 11, h: 3.4, w: 8.8, bl: 11.5, br: .3, n: 3, cf: .18, fs: .24, ss: .09, rs: .02, ears: 1 },
  us16t: { len: 15, h: 4.8, w: 12.4, bl: 17, br: .55, n: 3, cf: .2, fs: .24, ss: .12, rs: .02, ears: 1 },
  jp5d: { len: 5.6, h: 2.7, w: 4.4, bl: 6.0, br: .16, n: 2, cf: .35, fs: .24, ss: .12, rs: .1 },
  jp5s: { len: 4.4, h: 2.5, w: 3.2, bl: 6.0, br: .16, n: 1, cf: .35, fs: .24, ss: .12, rs: .1 },
  jp55: { len: 4.6, h: 2.4, w: 3.2, bl: 7.0, br: .18, n: 1, cf: .45, fs: .22, ss: .16, rs: .05 },
  jp8d: { len: 8.2, h: 3.3, w: 7.0, bl: 10, br: .3, n: 2, cf: .45, fs: .22, ss: .16, rs: .06 },
  jp14d: { len: 13, h: 4.4, w: 10.5, bl: 15, br: .5, n: 2, cf: .3, fs: .2, ss: .1, rr: .35, ears: 1 },
  jp6c: { len: 2.6, h: 1.6, w: 2.2, bl: 5, br: .16, n: 1, cf: .3, fs: .2, ss: .1 },
};
// Ship parts, in hull-local metres (z toward the bow, y above the deck at z).
// Bx block (rf/rr rounded front/rear, fs front slope, ta top inset, win window band), Cy funnel, Ms mast (tri tripod legs),
// Pl platform, Tt torpedo mount, Aa light gun (o Oerlikon, b2/b4 Bofors, j2/j3 25 mm, ha/ha2 HA mounts), Sl searchlight,
// Rf rangefinder, Dr director, Bt boat, Cp catapult (+ floatplane), Cr crane, Gm fixed gun mount, Dc depth-charge rack.
const Bx = (z, y, len, h, w, x = 0, m = 's', o = {}) => Object.assign({ k: 'b', z, y, len, h, w, x, m }, o);
const Cy = (z, y, r, h, rake = 0, x = 0, o = {}) => Object.assign({ k: 'c', z, y, r, h, rake: rake * DEG, x }, o);
const Ms = (z, y, h, r, o = {}) => Object.assign({ k: 'm', z, y, h, r, x: 0 }, o, { rake: (o.rake || 0) * DEG });
const Pl = (z, y, len, w, x = 0) => ({ k: 'pl', z, y, len, w, x });
const Tt = (z, y, n, x = 0, len = 7.5, sh = 0) => ({ k: 'tt', z, y, n, x, len, sh });
const Aa = (z, y, x, kind) => ({ k: 'aa', z, y, x, kind });
const Sl = (z, y, x) => ({ k: 'sl', z, y, x });
const Rf = (z, y, len, x = 0) => ({ k: 'rf', z, y, len, x });
const Dr = (z, y, kind) => ({ k: 'dr', z, y, kind, x: 0 });
const Bt = (z, y, x, len) => ({ k: 'bt', z, y, x, len });
const Cp = (z, y, x, len, face, plane) => ({ k: 'cp', z, y, x, len, face: face * DEG, plane });
const Cr = (z, y, x, h, boom) => ({ k: 'cr', z, y, x, h, boom });
const Gm = (z, y, x, face, kind) => ({ k: 'gm', z, y, x, face: face * DEG, kind });
const Dc = (z, x) => ({ k: 'dc', z, y: 0, x });
const Tu = (z, y, face, kind, x = 0, sec = false) => ({ z, y, face: face * DEG, kind, x, sec });

const SENDAI_BASE = [
  Bx(40.5, 0, 11, 4.6, 8.6, 0, 's', { rf: .4 }), Bx(41, 4.6, 7.5, 3, 7.4, 0, 's', { rf: .6, win: .7 }), Bx(41.3, 7.6, 5, 2, 5.6, 0, 's', { rf: .8, win: .8 }),
  Rf(41, 9.6, 4.5), Ms(36.5, 4.6, 20, .4, { tri: 3, yards: [[.66, 7]], top: [.5, 2] }), Aa(37, 4.6, 3.6, 'j2'), Aa(37, 4.6, -3.6, 'j2'),
  Bx(9, 0, 30, 2.2, 5.6, 0, 's', { rf: .3, rr: .3 }),
  Tt(9, 0, 2, 4.4, 7), Tt(9, 0, 2, -4.4, 7), Tt(-13, 0, 2, 4.4, 7), Tt(-13, 0, 2, -4.4, 7),
  Bt(17.5, 1.4, 5.4, 8), Bt(17.5, 1.4, -5.4, 8),
  Bx(-22, 0, 16, 3, 7, 0, 's', { rr: .3, rf: .2 }), Rf(-22, 3, 3.5), Ms(-28.5, 3, 13, .3, { tri: 2, yards: [[.75, 5]] }),
];
const SPECS = {
  fletcher: { cls: 'DD', nation: 'US', type: '弗莱彻级驱逐舰', L: 114, B: 12, F: 5.2, D: 4, sheer: [[0, .9], [.5, .95], [1, 1.4]], top: 12,
    kn: 36.5, turn: 6.2, rudderT: 1.5, accelT: 9, hp: 16000, tons: 2050, gun: 'us127', torp: 'mk15', torpMounts: 2, prefRange: 3800, aiErr: 70, cam: [300, 88], dc: 3,
    parts: [
      Bx(22, 0, 14, 2.6, 8.6, 0, 's', { rf: .35 }), Bx(22.5, 2.6, 8.5, 2.4, 7.6, 0, 's', { rf: .7, win: .7, fs: .4 }), Bx(23, 5.0, 5.6, 1.9, 6.4, 0, 's', { rf: .8, win: .6 }),
      Pl(22.5, 6.9, 7.6, 8.4), Dr(20.6, 6.9, 'us37'), Aa(20.5, 5, 3.5, 'o'), Aa(20.5, 5, -3.5, 'o'),
      Ms(17, 2.6, 19, .35, { yards: [[.64, 7.5], [.8, 4]], radar: 'sc', rake: 4 }),
      Bx(1, 0, 27, 2.4, 6.4, 0, 's', { rf: .25, rr: .25 }),
      Cy(8, 2.4, 1.75, 8.2, 5, 0, { cap: 'us' }), Cy(-6, 2.4, 1.75, 7.6, 5, 0, { cap: 'us' }),
      Tt(1, 2.4, 5), Bx(-17.5, 0, 6, 0.9, 4.6), Tt(-17.5, 0.9, 5),
      Pl(-9.8, 6.6, 2.6, 3.4), Sl(-9.8, 6.6, 0), Bt(-3, 1.4, -4.6, 7.5), Aa(-11, 0, 4.1, 'o'), Aa(-11, 0, -4.1, 'o'),
      Bx(-27, 0, 11, 2.8, 7, 0, 's', { rr: .2 }), Aa(-23, 2.8, 0, 'b2'),
      Dc(-54.5, 2.2), Dc(-54.5, -2.2)],
    tur: [Tu(40, 0, 0, 'us5s'), Tu(31, 2.6, 0, 'us5s'), Tu(-28, 2.8, 180, 'us5s'), Tu(-38, 1.2, 180, 'us5s'), Tu(-47, 0, 180, 'us5s')] },
  brooklyn: { cls: 'CL', nation: 'US', type: '布鲁克林级轻巡洋舰', L: 185, B: 18.6, F: 6.4, D: 6.9, sheer: [[0, .85], [.45, .95], [1, 1.35]], top: 22,
    kn: 32.5, turn: 4.2, rudderT: 2.4, accelT: 14, hp: 34000, tons: 9767, gun: 'us152', torp: null, prefRange: 5600, aiErr: 80, cam: [400, 115], dc: 3,
    parts: [
      Bx(27, 0, 22, 5.5, 13.5, 0, 's', { rf: .25 }), Bx(29, 5.5, 13, 3.2, 11, 0, 's', { rf: .55, win: .8 }), Bx(30, 8.7, 8, 2.6, 8.4, 0, 's', { rf: .7, win: .7 }),
      Pl(30, 11.3, 9, 10.5), Dr(29.5, 11.3, 'us37'), Aa(20, 5.5, 5, 'b4'), Aa(20, 5.5, -5, 'b4'),
      Ms(23.5, 5.5, 23, .5, { yards: [[.62, 11], [.78, 6]], top: [.45, 2.6], radar: 'sc' }),
      Bx(-1, 0, 32, 3, 12.5, 0, 's', { rf: .2, rr: .2 }),
      Gm(12, 3, 5.2, 90, 'us5d'), Gm(12, 3, -5.2, -90, 'us5d'), Gm(-13, 3, 5.2, 90, 'us5d'), Gm(-13, 3, -5.2, -90, 'us5d'),
      Cy(5, 3, 2.6, 11, 0, 0, { cap: 'us' }), Cy(-7, 3, 2.6, 10.5, 0, 0, { cap: 'us' }),
      Pl(-1, 9, 4.5, 9), Sl(-1, 9, 3.2), Sl(-1, 9, -3.2), Bt(-1, 3.2, 4.3, 8), Bt(-1, 3.2, -4.3, 8),
      Bx(-27, 0, 13, 5, 11.5, 0, 's', { rr: .3 }), Bx(-26.5, 5, 7, 2.4, 7, 0, 's', { win: .5, rf: .4 }), Dr(-27.5, 7.4, 'us37'),
      Ms(-20, 5, 18, .4, { yards: [[.72, 8]] }), Aa(-36, 0, 5.2, 'b4'), Aa(-36, 0, -5.2, 'b4'),
      Bx(-72, 0, 11, 0.12, 9, 0, 'd'), Cp(-79, 0.6, 4.6, 15, 25, 1), Cp(-79, 0.6, -4.6, 15, -25, 1), Cr(-88.5, 0, 0, 6.5, 11)],
    tur: [Tu(63, 0, 0, 'us6t'), Tu(52, 2.9, 0, 'us6t'), Tu(42, 4.2, 0, 'us6t'), Tu(-44, 2.9, 180, 'us6t'), Tu(-55, 0, 180, 'us6t')] },
  neworleans: { cls: 'CA', nation: 'US', type: '新奥尔良级重巡洋舰', L: 179, B: 18.8, F: 6.2, D: 6.9, sheer: [[0, .8], [.32, .8], [.325, 1.2], [1, 1.42]], top: 24,
    kn: 32.7, turn: 4.3, rudderT: 2.4, accelT: 13, hp: 26000, tons: 9950, gun: 'us203', torp: null, prefRange: 6000, aiErr: 85, cam: [400, 115], dc: 3,
    parts: [
      Bx(26, 0, 17, 5.4, 13, 0, 's', { rf: .3 }), Bx(27, 5.4, 11, 3.2, 10.5, 0, 's', { rf: .55, win: .8 }), Bx(28, 8.6, 7, 2.6, 8, 0, 's', { rf: .7, win: .7 }),
      Pl(28, 11.2, 8, 10), Dr(27.5, 11.2, 'us37'), Ms(21.5, 5.4, 24, .5, { tri: 3, yards: [[.62, 10], [.78, 6]], top: [.45, 2.6], radar: 'sc' }),
      Aa(34, 0, 6.2, 'o'), Aa(34, 0, -6.2, 'o'),
      Bx(1, 0, 30, 3, 12, 0, 's', { rf: .2, rr: .2 }),
      Cy(10, 3, 2.7, 11.5, 0, 0, { cap: 'us' }), Cy(-1, 3, 2.5, 10.5, 0, 0, { cap: 'us' }),
      Aa(15, 3, 5.4, 'ha'), Aa(15, 3, -5.4, 'ha'), Aa(4.5, 3, 6, 'ha'), Aa(4.5, 3, -6, 'ha'), Aa(-6, 3, 6, 'ha'), Aa(-6, 3, -6, 'ha'),
      Pl(4.5, 9.5, 4.5, 9), Sl(4.5, 9.5, 3), Sl(4.5, 9.5, -3), Bt(-1, 3.2, 4.4, 8), Bt(-1, 3.2, -4.4, 8),
      Bx(-19, 0, 13, 4.4, 11.5, 0, 's', { rr: .2, rf: .2 }), Cp(-18, 4.4, 4.3, 14, 22, 1), Cp(-18, 4.4, -4.3, 14, -22, 1),
      Ms(-25.5, 0, 19, .4, { yards: [[.72, 8]] }), Cr(-25, 0, 0, 7, 12),
      Bx(-31, 0, 8, 2.8, 9, 0, 's', { rr: .4, win: .5 }), Dr(-31.5, 2.8, 'us37'), Aa(-38, 0, 5.4, 'b4'), Aa(-38, 0, -5.4, 'b4')],
    tur: [Tu(55, 0, 0, 'us8t'), Tu(43.5, 3, 0, 'us8t'), Tu(-48, 0, 180, 'us8t')] },
  nc: { cls: 'BB', nation: 'US', type: '北卡罗来纳级战列舰', L: 222, B: 33, F: 8.5, D: 10, sheer: [[0, .9], [.5, .95], [1, 1.3]], top: 30,
    kn: 28, turn: 2.6, rudderT: 4, accelT: 22, hp: 72000, tons: 36600, gun: 'us406', sec: 'sec127', torp: null, prefRange: 7600, aiErr: 100, cam: [480, 140], dc: 4,
    parts: [
      Bx(3, 0, 64, 6, 25, 0, 's', { rf: .3, rr: .3 }), Bx(38.5, 0, 6.5, 10, 6.5, 0, 's', { rf: 1, rr: 1 }),
      Bx(31, 6, 11, 4, 13, 0, 's', { rf: .6, win: .6 }), Bx(31.5, 10, 9, 4.5, 10.5, 0, 's', { rf: .7, win: .7 }),
      Bx(32, 14.5, 7, 4, 8.5, 0, 's', { rf: .75, win: .7 }), Bx(32, 18.5, 5.5, 3.5, 6.5, 0, 's', { rf: .8, win: .6 }),
      Pl(32, 22, 7.5, 9), Dr(32.5, 22, 'us38'), Ms(29.5, 22, 13, .45, { yards: [[.55, 9]], radar: 'sc' }), Dr(25.5, 6, 'us37'),
      Cy(12, 6, 4.2, 14, 4, 0, { cap: 'us' }), Cy(-5, 6, 4.2, 13, 4, 0, { cap: 'us' }),
      Pl(3.5, 12.5, 5, 11), Sl(3.5, 12.5, 3.8), Sl(3.5, 12.5, -3.8), Bt(3.5, 6.3, 6.8, 10), Bt(3.5, 6.3, -6.8, 10),
      Ms(-15, 6, 22, .55, { yards: [[.75, 10]], tri: 3, top: [.55, 2.4] }),
      Bx(-22, 6, 10, 3, 12, 0, 's', { rr: .5, win: .5 }), Dr(-22.5, 9, 'us37'), Dr(-26.5, 6, 'us38'),
      Aa(33, 6, 9.5, 'b4'), Aa(33, 6, -9.5, 'b4'), Aa(-26, 6, 9.5, 'b4'), Aa(-26, 6, -9.5, 'b4'),
      Aa(45, 0, 12, 'o'), Aa(45, 0, -12, 'o'), Aa(-40, 0, 12, 'o'), Aa(-40, 0, -12, 'o'),
      Cp(-96, 0.6, 7, 16, 25, 1), Cp(-96, 0.6, -7, 16, -25, 1), Cr(-106, 0, 0, 8, 14)],
    tur: [Tu(72, 0, 0, 'us16t'), Tu(57, 4, 0, 'us16t'), Tu(-52, 3, 180, 'us16t'),
      Tu(20, 6, 90, 'us5d', 10.5, true), Tu(10, 6, 90, 'us5d', 10.5, true), Tu(0, 6, 90, 'us5d', 10.5, true), Tu(-10, 6, 90, 'us5d', 10.5, true), Tu(-20, 6, 90, 'us5d', 10.5, true),
      Tu(20, 6, -90, 'us5d', -10.5, true), Tu(10, 6, -90, 'us5d', -10.5, true), Tu(0, 6, -90, 'us5d', -10.5, true), Tu(-10, 6, -90, 'us5d', -10.5, true), Tu(-20, 6, -90, 'us5d', -10.5, true)] },
  shiratsuyu: { cls: 'DD', nation: 'JP', type: '白露型驱逐舰', L: 111, B: 9.9, F: 4.4, D: 3.5, sheer: [[0, .85], [.618, .85], [.622, 1.45], [1, 1.65]], top: 12, stem: 'clipper',
    kn: 34, turn: 6.5, rudderT: 1.6, accelT: 9, hp: 10000, tons: 1685, gun: 'jp127', torp: 't93', torpMounts: 2, prefRange: 3600, aiErr: 80, dc: 1,
    parts: [
      Bx(23.5, 0, 9, 2.6, 7, 0, 's', { rf: .5 }), Bx(24, 2.6, 6.5, 1.9, 6, 0, 's', { rf: .75, win: .6 }), Bx(24.3, 4.5, 4.4, 1.7, 5, 0, 's', { rf: .85, win: .8 }),
      Rf(24.3, 6.2, 3), Ms(19.5, 2.6, 13, .3, { tri: 2.2, yards: [[.7, 5]], top: [.52, 1.4] }),
      Cy(7.5, 0, 1.6, 7.4, 12, 0, { cap: 'jp', pipe: 1 }), Cy(-4, 0, 1.35, 6.4, 12, 0, { cap: 'jp', pipe: 1 }),
      Tt(1.5, 0.6, 4, 0, 8, 1), Tt(-12, 0.6, 4, 0, 8, 1), Bx(-7.8, 0, 2.8, 1.2, 2.8), Aa(-7.8, 1.2, 0, 'j2'),
      Bt(6, 1.4, 3.6, 6), Bt(6, 1.4, -3.6, 6),
      Bx(-24.5, 0, 8, 2.2, 5.2, 0, 's', { rr: .3 }), Ms(-18.5, 0, 10, .25, { yards: [[.8, 3]] }), Dc(-52, 1.6), Dc(-52, -1.6)],
    tur: [Tu(34, 0, 0, 'jp5d'), Tu(-30, 2.2, 180, 'jp5d'), Tu(-40, 0, 180, 'jp5s')] },
  fubuki: { cls: 'DD', nation: 'JP', type: '吹雪型驱逐舰', L: 118, B: 10.4, F: 4.6, D: 3.2, sheer: [[0, .85], [.618, .85], [.622, 1.45], [1, 1.65]], top: 12, stem: 'clipper',
    kn: 38, turn: 6.3, rudderT: 1.6, accelT: 9, hp: 10500, tons: 1750, gun: 'jp127', torp: 't93', torpMounts: 3, torpSalvo: 3, prefRange: 3600, aiErr: 80, dc: 1,
    parts: [
      Bx(26.5, 0, 9.5, 2.8, 7.4, 0, 's', { rf: .5 }), Bx(27, 2.8, 7, 2.0, 6.4, 0, 's', { rf: .75, win: .6 }), Bx(27.3, 4.8, 4.6, 1.7, 5.2, 0, 's', { rf: .85, win: .8 }),
      Rf(27.3, 6.5, 3), Ms(22, 2.8, 13.5, .3, { tri: 2.2, yards: [[.7, 5]], top: [.52, 1.4] }),
      Cy(9, 0, 1.95, 7.8, 10, 0, { cap: 'jp', pipe: 1, ov: .62 }), Cy(-3, 0, 1.55, 6.8, 10, 0, { cap: 'jp', pipe: 1 }),
      Tt(3.5, 0.6, 3, 0, 8, 1), Tt(-10, 0.6, 3, 0, 8, 1), Tt(-18.5, 0.6, 3, 0, 8, 1),
      Bt(8, 1.4, 3.8, 6), Bt(8, 1.4, -3.8, 6),
      Bx(-27, 0, 7.5, 2.2, 5, 0, 's', { rr: .3 }), Ms(-24, 2.2, 9, .25, { yards: [[.8, 3]] }), Dc(-56, 1.6), Dc(-56, -1.6)],
    tur: [Tu(39, 0, 0, 'jp5d'), Tu(-33, 2.2, 180, 'jp5d'), Tu(-44, 0, 180, 'jp5d')] },
  sendai: { cls: 'CL', nation: 'JP', type: '川内型轻巡洋舰', L: 162, B: 14.2, F: 5.4, D: 4.8, sheer: [[0, .85], [.678, .85], [.682, 1.4], [1, 1.55]], top: 20, stem: 'clipper',
    kn: 35, turn: 4.8, rudderT: 2.2, accelT: 12, hp: 17000, tons: 5195, gun: 'jp140', torp: 't93', torpMounts: 2, prefRange: 4300, aiErr: 85, dc: 2,
    parts: [...SENDAI_BASE, ...[22, 13, 4, -5].map((z, i) => Cy(z, 0, 1.8, i === 0 || i === 3 ? 8.5 : 9, 6, 0, { cap: 'jp', ov: .8, pipe: 1 }))],
    tur: [Tu(62, 0, 0, 'jp55'), Tu(53, 2, 0, 'jp55'), Tu(30, 0, 90, 'jp55', 5), Tu(30, 0, -90, 'jp55', -5), Tu(-34, 3, 180, 'jp55'), Tu(-46, 0, 180, 'jp55'), Tu(-58, 0, 180, 'jp55')] },
  aoba: { cls: 'CA', nation: 'JP', type: '青叶型重巡洋舰', L: 185, B: 17.6, F: 5.8, D: 5.7, sheer: [[0, .8], [.438, .8], [.442, 1.25], [1, 1.45]], top: 24, stem: 'clipper',
    kn: 33, turn: 4.4, rudderT: 2.4, accelT: 13, hp: 22000, tons: 8700, gun: 'jp203', torp: 't93', torpMounts: 2, prefRange: 4800, aiErr: 90, dc: 2,
    parts: [
      Bx(33, 0, 15, 6.5, 11, 0, 's', { rf: .4 }), Bx(33.5, 6.5, 10.5, 4.3, 9, 0, 's', { rf: .55, win: .8 }), Bx(34, 10.8, 7, 3.4, 7, 0, 's', { rf: .7, win: .8 }),
      Pl(34, 14.2, 8.5, 9.5), Dr(33.5, 14.2, 'jp'), Ms(27.5, 6.5, 21, .45, { tri: 4, yards: [[.62, 9]], top: [.45, 2.6] }),
      Bx(5, 0, 28, 2.6, 8.4, 0, 's', { rf: .3, rr: .3 }),
      Cy(12, 0, 3, 12, 8, 0, { cap: 'jp', ov: .62, pipe: 2 }), Cy(-1, 0, 2.2, 10, 8, 0, { cap: 'jp', pipe: 1 }),
      Aa(18, 0, 5.6, 'ha'), Aa(18, 0, -5.6, 'ha'), Bt(4, 1.6, 5.9, 9), Bt(4, 1.6, -5.9, 9),
      Tt(-5, 0, 4, 5.8, 7), Tt(-5, 0, 4, -5.8, 7), Cp(-17, 3, 0, 15, 0, 1),
      Bx(-27, 0, 11, 3, 8.4, 0, 's', { rr: .3 }), Rf(-25, 3, 4), Ms(-31, 3, 16, .4, { tri: 3, yards: [[.75, 6]] }), Cr(-30.5, 3, 0, 8, 12)],
    tur: [Tu(58, 0, 0, 'jp8d'), Tu(47, 2.8, 0, 'jp8d'), Tu(-50, 0, 180, 'jp8d')] },
  takao: { cls: 'CA', nation: 'JP', type: '高雄型重巡洋舰', L: 193, B: 19, F: 5.8, D: 6.1, sheer: [[0, .8], [.438, .8], [.442, 1.25], [1, 1.45]], top: 28, stem: 'clipper',
    kn: 35, turn: 4.2, rudderT: 2.4, accelT: 13, hp: 24000, tons: 9850, gun: 'jp203', torp: 't93', torpMounts: 2, prefRange: 5000, aiErr: 90, dc: 2,
    parts: [
      Bx(30, 0, 22, 8, 13.5, 0, 's', { rf: .3 }), Bx(30.5, 8, 17, 6, 12, 0, 's', { rf: .45, win: .9 }), Pl(31, 14, 14, 16),
      Bx(31, 14, 12, 5, 9.5, 0, 's', { rf: .6, win: .9 }), Bx(31.5, 19, 7, 4, 7, 0, 's', { rf: .75, win: .8 }),
      Pl(31.5, 23, 8.5, 10), Dr(32, 23, 'jp'), Rf(29, 23, 6), Ms(21, 8, 25, .5, { tri: 3.5, yards: [[.66, 10]], top: [.52, 2.4] }),
      Bx(2, 0, 18, 2.8, 8.4, 0, 's', { rf: .3, rr: .3 }),
      Cy(8, 0, 3.8, 12.5, 14, 0, { cap: 'jp', ov: .6, pipe: 2 }), Cy(-5, 0, 2.5, 11.5, 14, 0, { cap: 'jp', pipe: 1 }),
      Aa(1, 2.8, 3, 'ha'), Aa(1, 2.8, -3, 'ha'), Bt(14, 1.4, 6.3, 9), Bt(14, 1.4, -6.3, 9),
      Tt(-8, 0, 4, 6.8, 8), Tt(-8, 0, 4, -6.8, 8),
      Bx(-18, 0, 13, 3.4, 12, 0, 's', { rr: .2 }), Cp(-16, 3.4, 4.2, 17, 12, 1), Cp(-16, 3.4, -4.2, 17, -12, 1),
      Bx(-29, 0, 8, 3, 8.4, 0, 's', { rr: .3 }), Rf(-26.5, 3, 4), Ms(-30, 3, 19, .45, { tri: 3, yards: [[.72, 7]] }), Cr(-29.5, 3, 0, 7, 14)],
    tur: [Tu(72, 0, 0, 'jp8d'), Tu(61, 2.8, 0, 'jp8d'), Tu(50, 4.8, 0, 'jp8d'), Tu(-46, 2.8, 180, 'jp8d'), Tu(-57, 0, 180, 'jp8d')] },
  kongo: { cls: 'BB', nation: 'JP', type: '金刚型战列舰', L: 222, B: 31, F: 8, D: 9.7, sheer: [[0, .85], [.5, .9], [1, 1.35]], top: 40,
    kn: 30, turn: 2.9, rudderT: 3.6, accelT: 20, hp: 48000, tons: 32156, gun: 'jp356', sec: 'sec152', torp: null, prefRange: 6000, aiErr: 95, dc: 3, deck: 'wood',
    parts: [
      Bx(40, 0, 16, 8, 14.5, 0, 's', { rf: .5 }), Bx(40, 8, 12, 5, 11, 0, 's', { rf: .5, win: .6 }), Pl(40, 13, 14, 15),
      Bx(40.5, 13, 9.5, 5, 9, 0, 's', { rf: .6, win: .6 }), Pl(40.5, 18, 12, 13), Bx(41, 18, 7.5, 5, 7.5, 0, 's', { rf: .6, win: .7 }), Pl(41, 23, 10, 11),
      Bx(41, 23, 6, 4.5, 6.5, 0, 's', { rf: .7, win: .8 }), Pl(41, 27.5, 8, 9), Bx(41, 27.5, 5, 4, 5.5, 0, 's', { rf: .8, win: .7 }),
      Bx(41, 31.5, 3.5, 2.5, 4.5, 0, 's', { rf: .5 }), Rf(41, 34, 9), Ms(38.5, 34, 10, .45, { yards: [[.5, 7]] }), Ms(37, 8, 26, .7, { tri: 4.5 }),
      Bx(8, 0, 36, 3.6, 16, 0, 's', { rf: .3, rr: .3 }),
      Cy(16, 0, 3.9, 14, 6, 0, { cap: 'jp', ov: .78, pipe: 2 }), Cy(0, 0, 3.7, 13, 6, 0, { cap: 'jp', ov: .78, pipe: 1 }),
      Pl(8, 11, 5, 13), Sl(8, 11, 4.5), Sl(8, 11, -4.5),
      Aa(24, 3.6, 6.4, 'ha2'), Aa(24, 3.6, -6.4, 'ha2'), Aa(-7, 3.6, 6.4, 'ha2'), Aa(-7, 3.6, -6.4, 'ha2'), Aa(8, 3.6, 6.2, 'j3'), Aa(8, 3.6, -6.2, 'j3'),
      Bx(-19, 0, 16, 6, 14, 0, 's', { rr: .4 }), Rf(-19, 6, 6), Ms(-25, 6, 22, .55, { tri: 4, yards: [[.7, 10]], top: [.5, 3] }), Cr(-24.5, 6, 0, 8, 15),
      Aa(-14, 6, 5, 'j3'), Aa(-14, 6, -5, 'j3')],
    tur: [Tu(74, 0, 0, 'jp14d'), Tu(60, 3.6, 0, 'jp14d'), Tu(-42, 3.6, 180, 'jp14d'), Tu(-58, 0, 180, 'jp14d'),
      Tu(30, -3.5, 90, 'jp6c', 15.2, true), Tu(20, -3.5, 90, 'jp6c', 15.3, true), Tu(10, -3.5, 90, 'jp6c', 15.4, true), Tu(-10, -3.5, 90, 'jp6c', 15.3, true),
      Tu(30, -3.5, -90, 'jp6c', -15.2, true), Tu(20, -3.5, -90, 'jp6c', -15.3, true), Tu(10, -3.5, -90, 'jp6c', -15.4, true), Tu(-10, -3.5, -90, 'jp6c', -15.3, true)] },
};
SPECS.nagara = Object.assign({}, SPECS.sendai, { type: '长良型轻巡洋舰', kn: 36, tons: 5170,
  parts: [...SENDAI_BASE, ...[20, 10, 0].map(z => Cy(z, 0, 1.9, 8.8, 6, 0, { cap: 'jp', ov: .8, pipe: 1 }))] });
for (const k in SPECS) SPECS[k].key = k;


const SIZE_ERR = { DD: 1.35, CL: 1.1, CA: 1, BB: 0.9 };   // small hulls are harder to range at dusk
const THROTTLE = [-.5, -.25, 0, .25, .5, .75, 1];
const DIFF = {
  cadet: { name: '见习', dmgTaken: .35, aiErr: 1.6, hpMul: 1.8, note: '敌炮散布大，受到的伤害大幅减少' },
  captain: { name: '舰长', dmgTaken: .55, aiErr: 1.15, hpMul: 1.5, note: '标准难度' },
  admiral: { name: '提督', dmgTaken: .85, aiErr: .85, hpMul: 1.25, note: '日军夜战训练有素，炮弹更准、更疼' },
};
// swell: direction, wavelength, amplitude, phase (the page's water shader and ship motion use the same four)
const WAVE_DEF = [[0.35, 190, 1.0, 0.0], [-0.55, 115, 0.6, 1.3], [1.15, 72, 0.35, 2.1], [2.45, 46, 0.2, 4.2]];

// ---------------------------------------------------------------- terrain
const ISL = [
  { x: -3300, z: -2400, r: 1300, h: 480, volc: 1, seed: 1 },
  { x: 2700, z: 1300, r: 340, h: 60, seed: 2 },
  { x: -700, z: 3500, r: 430, h: 85, seed: 3 },
  { x: 4100, z: -2900, r: 280, h: 48, seed: 4 },
  { x: -11000, z: 9900, r: 3700, h: 900, seed: 5 }, { x: -5000, z: 9500, r: 3200, h: 1100, seed: 6 }, { x: 1000, z: 9400, r: 3100, h: 800, seed: 7 },
  { x: 7000, z: 9600, r: 3300, h: 950, seed: 8 }, { x: 12500, z: 10000, r: 3500, h: 700, seed: 9 },
  { x: -9000, z: -10000, r: 3400, h: 380, seed: 10 }, { x: -2500, z: -9700, r: 3000, h: 420, seed: 11 }, { x: 4500, z: -9900, r: 3300, h: 350, seed: 12 }, { x: 11000, z: -10300, r: 3500, h: 300, seed: 13 },
];
function islH(I, x, z) {
  const d = Math.hypot(x - I.x, z - I.z) / I.r;
  const n = fbm((x + I.seed * 977) * 0.0011, (z - I.seed * 613) * 0.0011);
  const s = 1 - (d + (n - 0.5) * 0.55);
  if (s <= 0) return -30;
  const prof = I.volc ? Math.pow(s, 1.35) : s * s * (3 - 2 * s);
  const rough = fbm(x * 0.004 + I.seed * 3.1, z * 0.004 - I.seed * 1.7);
  return -6 + (I.h + 6) * prof * (0.55 + 0.9 * rough);
}
function terrainH(x, z) {
  let best = -40;
  for (const I of ISL) { const dx = x - I.x, dz = z - I.z, rr = I.r * 1.3; if (dx * dx + dz * dz > rr * rr) continue; const h = islH(I, x, z); if (h > best) best = h; }
  return best;
}

// ---------------------------------------------------------------- hull shape (shared with the page's model builder)
function interpSheer(pts, s) {
  if (s <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) if (s <= pts[i + 1][0]) { const t = (s - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return lerp(pts[i][1], pts[i + 1][1], t); }
  return pts[pts.length - 1][1];
}
const deckY = (spec, z) => spec.F * interpSheer(spec.sheer, clamp(z / spec.L + 0.5, 0, 1));
// waterline plan (also the hit-test outline)
function halfW(s) {
  if (s < 0.12) return 0.74 + 0.26 * Math.sin((s / 0.12) * Math.PI / 2);
  if (s < 0.58) return 1;
  const u = clamp((s - 0.58) / 0.42, 0, 1); return Math.max(0.018, Math.pow(Math.max(0, Math.cos(u * Math.PI / 2)), 0.8));
}

// ---------------------------------------------------------------- ships
// a gun or torpedo with per-ship overrides (the duel's levelled numbers); the shell's drop is recomputed to suit
function tuned(base, over) {
  if (!over) return base;
  const g = Object.assign({}, base, over);
  if (g.vh) g.g = 8 * g.arc * g.vh * g.vh / g.range;
  return g;
}
class Ship {
  constructor(w, key, team, name, o = {}) {
    const spec = this.spec = SPECS[key], tune = o.tune || null;
    this.w = w; this.id = o.id || ++w.seq; if (this.id > w.seq) w.seq = this.id;
    this.key = key; this.team = team; this.name = name; this.isPlayer = !!o.player; this.hullNo = o.no || '';
    this.typeLabel = o.type || spec.type;
    this.x = o.x || 0; this.z = o.z || 0; this.heading = o.heading || 0;
    this.maxV = spec.kn * KN; this.speed = this.maxV * (o.speedFrac != null ? o.speedFrac : 0.8); this.vx = 0; this.vz = 0;
    this.throttle = 6; this.rudder = 0; this.rudderCmd = 0;
    this.maxHp = (tune && tune.hp || spec.hp) * (o.hpMul || 1); this.hp = this.maxHp;
    this.alive = true; this.sinkT = -1; this.removed = false;
    this.fires = []; this.dc = { charges: spec.dc || 2, cd: 0, active: 0 };
    this.aiErr = tune && tune.aiErr || spec.aiErr;
    this.gun = tuned(GUNS[spec.gun], tune && tune.gun); this.secGun = spec.sec ? GUNS[spec.sec] : null;
    this.torp = spec.torp ? tuned(TORPS[spec.torp], tune && tune.torp) : null;
    this.torpSalvo = spec.torpSalvo || (this.torp ? this.torp.salvo : 0);
    this.torpReady = Array.from({ length: spec.torpMounts || 0 }, () => rand(0, 3));
    this.aimX = this.x; this.aimZ = this.z; this.secT = null; this.secAimX = 0; this.secAimZ = 0;
    this.dmgBy = new Map(); this.lastRam = 0;
    this.sinkRoll = rand(0.6, 1.1) * (Math.random() < 0.5 ? -1 : 1); this.sinkPitch = rand(-0.25, 0.25); this.bob = 0;
    this.stats = { shots: 0, hits: 0, torps: 0, torpHits: 0, dealt: 0, taken: 0 };
    this.turrets = spec.tur.map(t => {
      const side = Math.abs(Math.abs(t.face) - Math.PI / 2) < 0.3, gun = t.sec ? this.secGun : this.gun;
      return { x: t.x, y: deckY(spec, t.z) + t.y, z: t.z, home: t.face, rel: t.face, arc: (t.sec ? 80 : side ? 100 : 148) * DEG, sec: t.sec, ts: TS[t.kind], gun,
        trav: gun.trav * DEG * (t.sec ? 1.5 : 1), reload: rand(0.2, 1.5), onTarget: false, inArc: false, elev: 0 };
    });
    this.mainTurrets = this.turrets.filter(t => !t.sec);
  }
  toWorld(lx, lz) { const c = Math.cos(this.heading), s = Math.sin(this.heading); return [this.x + lx * c + lz * s, this.z - lx * s + lz * c]; }
  toLocal(wx, wz) { const c = Math.cos(this.heading), s = Math.sin(this.heading), dx = wx - this.x, dz = wz - this.z; return [dx * c - dz * s, dx * s + dz * c]; }
  physics(dt) {
    const spec = this.spec, w = this.w;
    if (this.alive) {
      const target = THROTTLE[this.throttle] * this.maxV, acc = this.maxV / spec.accelT;
      this.speed += clamp(target - this.speed, -acc * dt * 1.4, acc * dt);
      this.rudder += clamp(this.rudderCmd - this.rudder, -dt / spec.rudderT, dt / spec.rudderT);
    } else { this.speed *= 1 - 0.35 * dt; this.rudder *= 1 - dt; }
    const eff = clamp(Math.abs(this.speed) / this.maxV * 1.1 + 0.12, 0, 1) * Math.sign(this.speed || 1);
    this.heading = wrapA(this.heading + spec.turn * DEG * this.rudder * eff * dt);
    this.speed *= 1 - Math.abs(this.rudder) * 0.07 * dt;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    this.vx = s * this.speed; this.vz = c * this.speed;
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const probe = Math.sign(this.speed || 1) * spec.L * 0.46;
    const gh = terrainH(nx + s * probe, nz + c * probe);
    if (gh > -5 && this.alive) {
      this.groundT = w.time;
      if (Math.abs(this.speed) > this.maxV * 0.25 && w.time - this.lastRam > 2) {
        this.lastRam = w.time;
        const dmg = this.damage(this.maxHp * 0.02 * Math.abs(this.speed) / this.maxV, null, 'ground');
        w.emit('ground', { id: this.id, dmg });
      }
      this.speed = -this.speed * 0.15;
    } else { this.x = nx; this.z = nz; }
    const r = Math.hypot(this.x, this.z);
    if (r > MAP_R && this.alive) {
      const k = MAP_R / r; this.x *= k; this.z *= k;
      if (this.isPlayer && w.time - (this.edgeT || -9) > 1.6) { this.edgeT = w.time; w.emit('edge', { id: this.id }); }
    }
    // fires & damage control
    if (this.alive) {
      if (this.dc.cd > 0) this.dc.cd -= dt;
      if (this.dc.active > 0) { this.dc.active -= dt; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.012 * dt); }
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const f = this.fires[i]; f.t -= dt;
        if (f.t <= 0) this.fires.splice(i, 1);
        this.damage(this.maxHp * 0.0016 * dt, f.src, 'fire');
        if (!this.alive) break;
      }
    }
  }
  startFire(lz, src) {
    if (this.dc.active > 0 || this.fires.length >= 3 || !this.alive) return false;
    this.fires.push({ lx: rand(-0.3, 0.3) * this.spec.B, lz: clamp(lz, -this.spec.L * 0.4, this.spec.L * 0.4), t: rand(14, 20), src });
    return true;
  }
  useDC() {
    if (!this.alive || this.dc.cd > 0 || this.dc.charges <= 0) return false;
    this.dc.charges--; this.dc.cd = 50; this.dc.active = 10; this.fires.length = 0; return true;
  }
  damage(amount, src, kind) {
    if (!this.alive || amount <= 0) return 0;
    amount = Math.min(amount, this.hp); this.hp -= amount;
    if (src) { this.dmgBy.set(src, (this.dmgBy.get(src) || 0) + amount); this.lastHitBy = src; src.stats.dealt += amount; }
    this.stats.taken += amount;
    if (this.hp <= 0.5) this.die(src || this.lastHitBy);
    return amount;
  }
  die(killer) {
    this.alive = false; this.hp = 0; this.sinkT = 0; this.fires.length = 0; this.throttle = 2;
    const big = Math.random() < (this.spec.cls === 'DD' ? 0.45 : 0.3);
    this.w.emit('sunk', { id: this.id, killer: killer ? killer.id : 0, big: big ? 1 : 0 });
  }
  remove() { this.removed = true; }
}

// ---------------------------------------------------------------- weapons
// the muzzle of barrel k: the gun house turns on its pivot, the barrels elevate on trunnions half the house's height up
// (pitch and roll of the hull are left out: a metre here or there at the muzzle is lost in the dispersion)
function muzzleWorld(s, t, k) {
  const ts = t.ts, ox = (k - (ts.n - 1) / 2) * ts.w * 0.28, ly = ts.h * 0.5 + ts.bl * Math.sin(t.elev), lz = ts.len * 0.18 + ts.bl * Math.cos(t.elev);
  const cr = Math.cos(t.rel), sr = Math.sin(t.rel), [wx, wz] = s.toWorld(t.x + ox * cr + lz * sr, t.z - ox * sr + lz * cr);
  return [wx, s.bob + t.y + ly, wz];
}
function turretWorld(s, t) { return s.toWorld(t.x, t.z); }
function updateTurrets(s, dt) {
  for (const t of s.turrets) {
    t.reload -= dt;
    let ax, az;
    if (t.sec) { if (!s.secT) { ax = null; } else { ax = s.secAimX; az = s.secAimZ; } }
    else { ax = s.aimX; az = s.aimZ; }
    let want = 0, dist = 0;
    const [wx, wz] = turretWorld(s, t);
    if (ax != null) {
      const b = Math.atan2(ax - wx, az - wz), rel = wrapA(b - s.heading), off0 = angDiff(t.home, rel);
      t.inArc = Math.abs(off0) <= t.arc; want = clamp(off0, -t.arc, t.arc); dist = Math.hypot(ax - wx, az - wz);
    } else { t.inArc = false; }
    const off = angDiff(t.home, t.rel), step = t.trav * dt, noff = off + clamp(want - off, -step, step);
    t.rel = t.home + noff;
    t.onTarget = t.inArc && Math.abs(want - noff) < 0.035;
    const T = Math.min(dist, t.gun.range) / t.gun.vh; const el = ax != null ? Math.atan2(0.5 * t.gun.g * T, t.gun.vh) : 0.02;
    t.elev += (el - t.elev) * Math.min(1, dt * 3);
  }
}
function fireShell(w, owner, gun, mx, my, mz, tx, tz, err) {
  let dx = tx - mx, dz = tz - mz, d = Math.hypot(dx, dz) || 1; const ux = dx / d, uz = dz / d;
  if (d > gun.range) { d = gun.range; tx = mx + ux * d; tz = mz + uz * d; }
  const k = d / gun.range, sl = gun.disp * 0.5 * (0.3 + 0.7 * k), st = sl * 0.42;
  const e1 = randn() * sl + randn() * err, e2 = randn() * st + randn() * err * 0.5;
  tx += ux * e1 - uz * e2; tz += uz * e1 + ux * e2;
  const D2 = Math.hypot(tx - mx, tz - mz), T = Math.max(0.2, D2 / gun.vh);
  const vy = (-my + 0.5 * gun.g * T * T) / T;
  const sh = { id: ++w.sseq, x: mx, y: my, z: mz, x0: mx, y0: my, z0: mz, vx: (tx - mx) / T, vz: (tz - mz) / T, vy0: vy, g: gun.g, t: 0, T, owner, team: owner.team, gun, alive: true, px: mx, py: my, pz: mz };
  w.shells.push(sh);
  return sh;
}
function fireTurret(w, s, t, tx, tz, err) {
  const gun = t.gun; t.reload = gun.reload * rand(0.97, 1.05);
  let mx = 0, my = 0, mz = 0; const sh = [];
  for (let k = 0; k < t.ts.n; k++) { const m = muzzleWorld(s, t, k); mx += m[0]; my += m[1]; mz += m[2]; sh.push(fireShell(w, s, gun, m[0], m[1], m[2], tx, tz, err)); }
  mx /= t.ts.n; my /= t.ts.n; mz /= t.ts.n;
  s.stats.shots += t.ts.n;
  w.emit('gun', { id: s.id, sec: t.sec ? 1 : 0, cal: gun.cal, n: t.ts.n, x: mx, y: my, z: mz, b: s.heading + t.rel, tx, tz,
    sh: sh.map(b => [b.id, b.x0, b.y0, b.z0, b.vx, b.vy0, b.vz, b.g, b.T]) });
}
function segHitShip(sh, a, b) {
  const spec = sh.spec, c = Math.cos(sh.heading), s = Math.sin(sh.heading);
  const ax = a[0] - sh.x, az = a[2] - sh.z, bx = b[0] - sh.x, bz = b[2] - sh.z;
  const lax = ax * c - az * s, laz = ax * s + az * c, lbx = bx * c - bz * s, lbz = bx * s + bz * c;
  const lay = a[1] - sh.bob, lby = b[1] - sh.bob;
  const mn = [-spec.B / 2, -1.5, -spec.L / 2], mx = [spec.B / 2, spec.F + spec.top * 0.55, spec.L / 2];
  const o = [lax, lay, laz], d = [lbx - lax, lby - lay, lbz - laz];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return -1; continue; }
    let ta = (mn[i] - o[i]) / d[i], tb = (mx[i] - o[i]) / d[i]; if (ta > tb) { const q = ta; ta = tb; tb = q; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return -1;
  }
  const hz = laz + d[2] * t0, hx = lax + d[0] * t0, sN = hz / spec.L + 0.5;
  if (Math.abs(hx) > spec.B / 2 * halfW(clamp(sN, 0, 1)) + 1.5) return -1;
  return t0;
}
// a shell's height over time is fixed at the muzzle: it reaches the sea (y = 0) exactly at T
function updateShells(w, dt) {
  for (const s of w.shells) {
    if (!s.alive) continue;
    s.px = s.x; s.py = s.y; s.pz = s.z; s.t += dt;
    s.x = s.x0 + s.vx * s.t; s.z = s.z0 + s.vz * s.t; s.y = s.y0 + s.vy0 * s.t - 0.5 * s.g * s.t * s.t;
    const A = [s.px, s.py, s.pz], Bp = [s.x, s.y, s.z];
    let hit = null, ht = 2;
    if (s.y < 70) for (const sh of w.ships) {
      if (!sh.alive || sh.team === s.team) continue;
      const qx = sh.x - s.x, qz = sh.z - s.z, r = sh.spec.L * 0.55 + 60; if (qx * qx + qz * qz > r * r) continue;
      const t = segHitShip(sh, A, Bp); if (t >= 0 && t < ht) { ht = t; hit = sh; }
    }
    if (hit) {
      const hx = lerp(s.px, s.x, ht), hy = lerp(s.py, s.y, ht), hz = lerp(s.pz, s.z, ht);
      s.alive = false; shellHit(w, hit, s, hx, hy, hz); continue;
    }
    if (s.y < 1100) { const th = terrainH(s.x, s.z); if (s.y < th && th > 0) { s.alive = false; continue; } }
    if (s.y <= 0 && s.t > 0.05) { s.alive = false; continue; }
    if (s.t > 30) { s.alive = false; continue; }
  }
  w.shells = w.shells.filter(s => s.alive);
}
function shellHit(w, ship, sh, x, y, z) {
  const gun = sh.gun, spec = ship.spec, [, lz] = ship.toLocal(x, z);
  let dmg = gun.dmg * rand(0.75, 1.15), crit = false, fire = false;
  if (gun.cal >= 300 && spec.cls === 'DD') dmg *= 0.35; else if (gun.cal >= 300 && spec.cls === 'CL') dmg *= 0.65; else if (gun.cal >= 200 && spec.cls === 'DD') dmg *= 0.6;
  if (gun.cal >= 200 && spec.cls !== 'DD' && Math.abs(lz) < spec.L * 0.22 && Math.random() < (gun.cal >= 300 ? 0.22 : 0.12)) { dmg *= 2.6; crit = true; }
  dmg *= w.dmgMul(ship, sh.team);
  if (Math.random() < gun.fire) fire = ship.startFire(lz, sh.owner);
  const dealt = ship.damage(dmg, sh.owner, 'shell');
  sh.owner.stats.hits++;
  w.emit('hit', { s: sh.id, id: ship.id, o: sh.owner.id, x, y, z, cal: gun.cal, crit: crit ? 1 : 0, fire: fire ? 1 : 0, dmg: dealt });
}
function launchFan(w, ship, heading) {
  const tp = ship.torp, n = ship.torpSalvo;
  const side = angDiff(ship.heading, heading) > 0 ? 1 : -1;
  const [x, z] = ship.toWorld(side * ship.spec.B * 0.5, 0);
  for (let k = 0; k < n; k++) {
    const h = heading + (k - (n - 1) / 2) * tp.spread * DEG;
    w.torps.push({ id: ++w.tseq, x, z, h, dx: Math.sin(h), dz: Math.cos(h), speed: tp.speed, range: tp.range, trav: 0, owner: ship, team: ship.team, spec: tp, alive: true, seen: { US: 0, JP: 0 }, evaded: new Set() });
  }
  ship.stats.torps += n;
  w.emit('launch', { id: ship.id, x, z, n });
}
// The 93 runs on oxygen and leaves almost no wake: a side only sees an enemy torpedo once it is within visR of one of its ships.
function torpVisible(t, team) { return !team || t.team === team || t.seen[team] > 0; }
function updateTorps(w, dt) {
  for (const t of w.torps) {
    if (!t.alive) continue;
    const step = t.speed * dt; t.x += t.dx * step; t.z += t.dz * step; t.trav += step;
    if (t.trav > t.range) { t.alive = false; continue; }
    for (const team in t.seen) {
      if (team === t.team) continue;
      t.seen[team] -= dt;
      for (const f of w.ships) { if (!f.alive || f.team !== team) continue; const qx = f.x - t.x, qz = f.z - t.z; if (qx * qx + qz * qz < t.spec.visR * t.spec.visR) { t.seen[team] = 3; break; } }
    }
    if (terrainH(t.x, t.z) > -3) { t.alive = false; w.emit('torpLand', { x: t.x, z: t.z }); continue; }
    if (t.trav < 120) continue;
    for (const sh of w.ships) {
      if (!sh.alive || sh.team === t.team) continue;
      const qx = sh.x - t.x, qz = sh.z - t.z, r = sh.spec.L * 0.55; if (qx * qx + qz * qz > r * r) continue;
      const [lx, lz] = sh.toLocal(t.x, t.z);
      if (Math.abs(lz) < sh.spec.L / 2 && Math.abs(lx) < sh.spec.B / 2 * halfW(clamp(lz / sh.spec.L + 0.5, 0, 1)) + 1.5) {
        t.alive = false;
        const dmg = t.spec.dmg * rand(0.9, 1.1) * (sh.spec.cls === 'BB' ? 0.75 : 1) * w.dmgMul(sh, t.team);
        const dealt = sh.damage(dmg, t.owner, 'torp');
        t.owner.stats.torpHits++;
        w.emit('torpHit', { id: sh.id, o: t.owner.id, x: t.x, z: t.z, dmg: dealt });
        break;
      }
    }
  }
  w.torps = w.torps.filter(t => t.alive);
}
function intercept(sx, sz, tx, tz, tvx, tvz, v) {
  const dx = tx - sx, dz = tz - sz, a = tvx * tvx + tvz * tvz - v * v, b = 2 * (dx * tvx + dz * tvz), c = dx * dx + dz * dz;
  let t;
  if (Math.abs(a) < 1e-6) t = -c / b;
  else { const disc = b * b - 4 * a * c; if (disc < 0) return null; const r = Math.sqrt(disc), t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a); t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2); }
  if (!(t > 0)) return null;
  return { h: Math.atan2(dx + tvx * t, dz + tvz * t), t, x: tx + tvx * t, z: tz + tvz * t };
}
function leadPoint(fromX, fromZ, tgt, gun) {
  let px = tgt.x, pz = tgt.z;
  for (let i = 0; i < 3; i++) { const T = Math.hypot(px - fromX, pz - fromZ) / gun.vh; px = tgt.x + tgt.vx * T; pz = tgt.z + tgt.vz * T; }
  return [px, pz];
}

// ---------------------------------------------------------------- human captains
// what a captain's ship does on its own each tick: the secondaries pick their targets, the tubes reload
function humanUpdate(w, s, dt) {
  if (s.secGun) secondaryLogic(w, s);
  for (let i = 0; i < s.torpReady.length; i++) s.torpReady[i] -= dt;
}
// the fire key: a salvo from every ready turret that bears on (ax, az), or a torpedo fan toward it
function playerFire(w, P, weapon, ax, az) {
  if (!P.alive) return;
  const say = msg => w.emit('hint', { id: P.id, msg });
  if (weapon === 'guns') {
    const ready = P.mainTurrets.filter(t => t.reload <= 0), aimed = ready.filter(t => t.onTarget);
    if (!aimed.length) { say(!ready.length ? '主炮装填中' : P.mainTurrets.some(t => t.inArc) ? '炮塔转向中' : '炮塔无法指向该方位'); return; }
    for (const t of aimed) fireTurret(w, P, t, ax, az, 0);
    if (Math.hypot(ax - P.x, az - P.z) > P.gun.range) say('超出射程，炮弹落在最大射程处');
  } else {
    if (!P.torp) return;
    const yaw = Math.atan2(ax - P.x, az - P.z), rel = Math.abs(angDiff(P.heading, yaw));
    if (rel < 25 * DEG || rel > 155 * DEG) { say('鱼雷需向舷侧发射，转向或调整方位'); return; }
    const m = P.torpReady.findIndex(v => v <= 0);
    if (m < 0) { say('鱼雷装填中'); return; }
    launchFan(w, P, yaw); P.torpReady[m] = P.torp.reload;
  }
}
function cmdDC(w, P) {
  const ok = P.useDC();
  w.emit('dc', { id: P.id, ok: ok ? 1 : 0, none: P.dc.charges <= 0 ? 1 : 0 });
}

// ---------------------------------------------------------------- AI
class AI {
  constructor(s) {
    this.s = s; this.w = s.w; this.target = null; this.retarget = 0; this.side = Math.random() < 0.5 ? 1 : -1; this.sideT = rand(20, 40);
    this.torpCd = rand(10, 22); this.disengage = 0; this.seed = Math.random() * 100; this.salvos = 0; this.lastTarget = null;
    this.dcDelay = rand(3, 8); this.slot = 0; this.leader = null;
  }
  pick() {
    const s = this.s; let best = null, bs = 1e18;
    for (const o of this.w.ships) {
      if (!o.alive || o.team === s.team) continue;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      const big = s.spec.cls === 'CA' || s.spec.cls === 'BB', sc = d + (o.isPlayer ? -450 : 0) - (o.hp / o.maxHp < 0.3 ? 500 : 0) - (big && o.spec.cls === 'BB' ? 900 : 0) + rand(0, 600);
      if (sc < bs) { bs = sc; best = o; }
    }
    this.target = best;
  }
  avoid(desired) {
    const s = this.s, L = s.spec.L;
    for (const o of this.w.ships) {
      if (o === s || !o.alive) continue;
      const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz), lim = (L + o.spec.L) * 1.3;
      if (d < lim) { const rel = angDiff(s.heading, Math.atan2(dx, dz)); if (Math.abs(rel) < 1.1) desired = s.heading - Math.sign(rel || 1) * 0.9; }
    }
    const clear = h => { for (const d of [L * 1.2, L * 2.6, L * 4.5]) if (terrainH(s.x + Math.sin(h) * d, s.z + Math.cos(h) * d) > -12) return false; return true; };
    if (!clear(desired)) {
      for (let k = 1; k <= 7; k++) {
        for (const sg of [1, -1]) { const h = desired + sg * k * 25 * DEG; if (clear(h)) return h; }
      }
    }
    const r = Math.hypot(s.x, s.z);
    if (r > MAP_R * 0.86) { const toC = Math.atan2(-s.x, -s.z); const w = clamp((r - MAP_R * 0.86) / (MAP_R * 0.12), 0, 1); desired = desired + angDiff(desired, toC) * w; }
    return desired;
  }
  update(dt) {
    const s = this.s, w = this.w; if (!s.alive) return;
    this.retarget -= dt; this.torpCd -= dt;
    if (this.retarget <= 0 || !this.target || !this.target.alive) { this.pick(); this.retarget = rand(3, 5); }
    const T = this.target;
    let desired = s.heading, throttle = 6;
    if (T) {
      const dx = T.x - s.x, dz = T.z - s.z, d = Math.hypot(dx, dz), b = Math.atan2(dx, dz), pref = s.spec.prefRange;
      this.sideT -= dt; if (this.sideT <= 0) { this.side *= -1; this.sideT = rand(25, 45); }
      if (this.disengage > 0) { this.disengage -= dt; desired = b + Math.PI - this.side * 0.7; }
      else if (d > pref * 1.2) desired = b + this.side * 0.32;
      else if (d < pref * 0.7) desired = b + this.side * 2.0;
      else desired = b + this.side * Math.PI * 0.45;
      desired += Math.sin(w.time * 0.21 + this.seed) * 0.22;
      // guns
      const [lx, lz] = leadPoint(s.x, s.z, T, s.gun); s.aimX = lx; s.aimZ = lz;
      if (this.lastTarget !== T) { this.lastTarget = T; this.salvos = 0; }
      if (d < s.gun.range * 1.02) {
        const evasive = (1 + Math.abs(T.rudder) * clamp(Math.abs(T.speed) / T.maxV, 0, 1) * 1.3) * SIZE_ERR[T.spec.cls];
        const rf = Math.max(0.8, 2.0 - 0.15 * this.salvos), err = s.aiErr * w.aiErr(s.team) * rf * evasive * (0.25 + d / s.gun.range);
        let fired = false;
        for (const t of s.mainTurrets) if (t.reload <= 0 && t.onTarget) { fireTurret(w, s, t, lx, lz, err); fired = true; }
        if (fired) this.salvos++;
      }
      // torpedoes
      if (s.torp && this.torpCd <= 0 && d < s.torp.range * (s.team === 'JP' ? 0.6 : 0.8)) {
        const mount = s.torpReady.findIndex(v => v <= 0);
        if (mount >= 0 && T.spec.cls === 'DD' && Math.random() < 0.4) this.torpCd = rand(8, 14);
        else if (mount >= 0) {
          const ic = intercept(s.x, s.z, T.x, T.z, T.vx, T.vz, s.torp.speed);
          if (ic) {
            const rel = Math.abs(angDiff(s.heading, ic.h));
            if (rel > 35 * DEG && rel < 145 * DEG) {
              launchFan(w, s, ic.h + randn() * 3 * DEG); s.torpReady[mount] = s.torp.reload * rand(0.9, 1.2); this.torpCd = rand(18, 30);
              if (s.spec.cls === 'DD') this.disengage = rand(8, 14);
            } else if (s.spec.cls === 'DD' && this.disengage <= 0) {
              const h1 = ic.h - Math.PI / 2, h2 = ic.h + Math.PI / 2;
              desired = Math.abs(angDiff(s.heading, h1)) < Math.abs(angDiff(s.heading, h2)) ? h1 : h2;
            }
          }
        }
      }
    } else if (this.leader && this.leader.alive) {
      // no enemy afloat: keep station on the flagship
      const P = this.leader, off = [[-420, -520], [420, -520], [0, -900]][this.slot % 3];
      const [fx, fz] = P.toWorld(off[0], off[1]); const d = Math.hypot(fx - s.x, fz - s.z);
      desired = d > 150 ? Math.atan2(fx - s.x, fz - s.z) : P.heading;
      throttle = d > 600 ? 6 : clamp(P.throttle + (d > 250 ? 1 : 0), 2, 6);
      s.aimX = s.x + Math.sin(s.heading) * 2000; s.aimZ = s.z + Math.cos(s.heading) * 2000;
    } else { desired = Math.atan2(-s.x, -s.z); }
    // secondaries
    if (s.secGun) secondaryLogic(w, s);
    // torpedo evasion
    for (const t of w.torps) {
      if (t.team === s.team || t.evaded.has(s.id)) continue;
      const qx = s.x - t.x, qz = s.z - t.z; if (qx * qx + qz * qz > 1300 * 1300) continue;
      t.evaded.add(s.id);
      if (Math.random() > (s.team === 'JP' ? 0.55 : 0.7)) continue;
      const dvx = s.vx - t.dx * t.speed, dvz = s.vz - t.dz * t.speed, dv2 = dvx * dvx + dvz * dvz;
      const tc = clamp(-(-qx * dvx + -qz * dvz) / (dv2 || 1), 0, 20);
      const cx = -qx + dvx * tc, cz = -qz + dvz * tc;
      if (Math.hypot(cx, cz) < s.spec.L * 0.7) { this.evadeH = Math.abs(angDiff(s.heading, t.h)) < Math.PI / 2 ? t.h : t.h + Math.PI; this.evadeT = 6; }
    }
    if (this.evadeT > 0) { this.evadeT -= dt; desired = this.evadeH; }
    // damage control
    if (s.fires.length >= 2 || (s.fires.length && s.hp < s.maxHp * 0.4)) { this.dcDelay -= dt; if (this.dcDelay <= 0) { s.useDC(); this.dcDelay = rand(3, 8); } }
    desired = this.avoid(desired);
    s.rudderCmd = clamp(angDiff(s.heading, desired) * 2.2, -1, 1);
    s.throttle = throttle;
    // grounded or wedged against a coast: back off, swinging the bow toward open water
    const L = s.spec.L, hs = Math.sin(s.heading), hc = Math.cos(s.heading);
    this.slowT = Math.abs(s.speed) < s.maxV * 0.12 && throttle > 3 ? (this.slowT || 0) + dt : 0;
    if (!(this.reverseT > 0) && (w.time - (s.groundT || -99) < 0.3 || this.slowT > 3 || terrainH(s.x + hs * L * 0.75, s.z + hc * L * 0.75) > -6)) {
      const hl = terrainH(s.x + Math.sin(s.heading + 1) * L * 1.6, s.z + Math.cos(s.heading + 1) * L * 1.6), hr = terrainH(s.x + Math.sin(s.heading - 1) * L * 1.6, s.z + Math.cos(s.heading - 1) * L * 1.6);
      this.reverseT = rand(4, 6); this.revRudder = hl < hr ? -1 : 1; this.slowT = 0;
    }
    if (this.reverseT > 0) { this.reverseT -= dt; s.throttle = 0; s.rudderCmd = this.revRudder; }
    for (let i = 0; i < s.torpReady.length; i++) s.torpReady[i] -= dt;
  }
}
function secondaryLogic(w, s) {
  let best = null, bd = s.secGun.range;
  for (const o of w.ships) { if (!o.alive || o.team === s.team) continue; const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < bd) { bd = d; best = o; } }
  s.secT = best;
  if (!best) return;
  const [lx, lz] = leadPoint(s.x, s.z, best, s.secGun); s.secAimX = lx; s.secAimZ = lz;
  const err = s.aiErr * 1.1 * w.aiErr(s.team) * (0.3 + bd / s.secGun.range);
  for (const t of s.turrets) if (t.sec && t.reload <= 0 && t.onTarget) fireTurret(w, s, t, lx, lz, err);
}

// ---------------------------------------------------------------- collisions between ships
function segClosest(p1x, p1z, q1x, q1z, p2x, p2z, q2x, q2z) {
  const d1x = q1x - p1x, d1z = q1z - p1z, d2x = q2x - p2x, d2z = q2z - p2z, rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz, c = d1x * rx + d1z * rz, b = d1x * d2x + d1z * d2z, den = a * e - b * b;
  let s = den > 1e-6 ? clamp((b * f - c * e) / den, 0, 1) : 0, t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  return [p1x + d1x * s, p1z + d1z * s, p2x + d2x * t, p2z + d2z * t];
}
function shipCollisions(w) {
  const ships = w.ships;
  for (let i = 0; i < ships.length; i++) {
    const A = ships[i]; if (!A.alive) continue;
    for (let j = i + 1; j < ships.length; j++) {
      const B = ships[j]; if (!B.alive) continue;
      const dx = B.x - A.x, dz = B.z - A.z, rr = (A.spec.L + B.spec.L) / 2; if (dx * dx + dz * dz > rr * rr) continue;
      const ha = A.spec.L / 2 - A.spec.B / 2, hb = B.spec.L / 2 - B.spec.B / 2, sa = Math.sin(A.heading), ca = Math.cos(A.heading), sb = Math.sin(B.heading), cb = Math.cos(B.heading);
      const [x1, z1, x2, z2] = segClosest(A.x - sa * ha, A.z - ca * ha, A.x + sa * ha, A.z + ca * ha, B.x - sb * hb, B.z - cb * hb, B.x + sb * hb, B.z + cb * hb);
      const nx = x2 - x1, nz = z2 - z1, d = Math.hypot(nx, nz) || 0.01, min = (A.spec.B + B.spec.B) / 2;
      if (d < min) {
        const push = (min - d) / 2, ux = nx / d, uz = nz / d;
        A.x -= ux * push; A.z -= uz * push; B.x += ux * push; B.z += uz * push;
        const rel = Math.hypot(A.vx - B.vx, A.vz - B.vz);
        if (rel > 8 && w.time - A.lastRam > 1.5) {
          A.lastRam = B.lastRam = w.time; const dmg = rel * 45;
          const da = A.damage(dmg * Math.sqrt(B.spec.tons / A.spec.tons) * 0.5, B.team !== A.team ? B : null, 'ram');
          const db = B.damage(dmg * Math.sqrt(A.spec.tons / B.spec.tons) * 0.5, A.team !== B.team ? A : null, 'ram');
          w.emit('ram', { a: A.id, b: B.id, da, db });
        }
        A.speed *= 0.6; B.speed *= 0.6;
      }
    }
  }
}

// ---------------------------------------------------------------- world
// One battle. mode 'campaign' is the single-player defence of the sound (difficulty scales the Japanese fire), 'duel' the
// two-captain game, where both navies fight on level terms. onEvent gets every sight and sound as it happens.
class World {
  constructor(o = {}) {
    this.mode = o.mode || 'campaign'; this.diff = o.diff || 'captain'; this.onEvent = o.onEvent || null;
    this.ships = []; this.shells = []; this.torps = [];
    this.time = 0; this.seq = 0; this.sseq = 0; this.tseq = 0;
  }
  emit(k, d) { if (this.onEvent) { d.k = k; d.t = this.time; this.onEvent(d); } }
  add(s) { this.ships.push(s); return s; }
  byId(id) { for (const s of this.ships) if (s.id === id) return s; return null; }
  aiErr(team) { return this.mode === 'campaign' && team === 'JP' ? DIFF[this.diff].aiErr : 1; }
  dmgMul(target, srcTeam) { return this.mode === 'campaign' && target.team === 'US' && srcTeam === 'JP' ? DIFF[this.diff].dmgTaken : 1; }
  // play: captains and the AI act (off in the menu and on the results screen, where the ships just steam on)
  step(dt, play) {
    this.time += dt;
    if (play) for (const s of this.ships) { if (!s.alive) continue; if (s.ai) s.ai.update(dt); else if (s.isPlayer) humanUpdate(this, s, dt); }
    for (const s of this.ships) s.physics(dt);
    shipCollisions(this);
    for (const s of this.ships) {
      if (!s.removed) updateTurrets(s, dt);
      if (!s.alive && !s.removed) { s.sinkT += dt; if (s.sinkT > 16) s.remove(); }
    }
    updateShells(this, dt);
    updateTorps(this, dt);
    this.ships = this.ships.filter(s => !s.removed || s.isPlayer);
  }
}

// ---------------------------------------------------------------- duel
// Two captains, one ship each, of the same class (the host picks it), each with two destroyers in company. Both navies are
// levelled per class here (hit points, gun reload and damage, torpedo reload); speed, layout and range keep their character.
const DUEL = {
  limit: 600,
  classes: { DD: '驱逐舰', CL: '轻巡洋舰', CA: '重巡洋舰', BB: '战列舰' },
  ships: {
    US: {
      DD: [['fletcher', '弗莱彻号', 'DD-445']],
      CL: [['brooklyn', '海伦娜号', 'CL-50']],
      CA: [['neworleans', '旧金山号', 'CA-38']],
      BB: [['nc', '华盛顿号', 'BB-56']],
    },
    JP: {
      DD: [['fubuki', '吹雪', ''], ['shiratsuyu', '夕立', '']],
      CL: [['sendai', '川内', ''], ['nagara', '长良', '']],
      CA: [['aoba', '青叶', ''], ['takao', '高雄', '']],
      BB: [['kongo', '雾岛', '']],
    },
  },
  escorts: { US: [['fletcher', '奥班农号', 'DD-450'], ['fletcher', '尼古拉斯号', 'DD-449']], JP: [['shiratsuyu', '五月雨', ''], ['fubuki', '天雾', '']] },
  // per class, every barrel hits as hard as its opposite number's (reload scaled by barrel count, same spread and range)
  tune: {
    fletcher: { hp: 15000 },
    fubuki: { hp: 15500, aiErr: 70, gun: { dmg: 430, reload: 3.84, disp: 95, range: 5600 }, torp: { reload: 45 } },
    shiratsuyu: { hp: 16000, aiErr: 70, gun: { dmg: 430, reload: 3.2, disp: 95, range: 5600 }, torp: { reload: 45 } },
    brooklyn: { hp: 30000, gun: { reload: 6.5 } },
    sendai: { hp: 29000, aiErr: 80, gun: { dmg: 640, reload: 3.03, disp: 115, range: 7200 }, torp: { reload: 45 } },
    nagara: { hp: 29000, aiErr: 80, gun: { dmg: 640, reload: 3.03, disp: 115, range: 7200 }, torp: { reload: 45 } },
    neworleans: { hp: 26000 },
    aoba: { hp: 26000, aiErr: 85, gun: { dmg: 1350, reload: 8.6, disp: 140, range: 8200 }, torp: { reload: 45 } },
    takao: { hp: 26000, aiErr: 85, gun: { dmg: 1350, reload: 12.2, disp: 140, range: 8200 }, torp: { reload: 45 } },
    nc: { hp: 68000, aiErr: 95 },
    kongo: { hp: 72000, aiErr: 95, gun: { dmg: 4400, reload: 21.3, disp: 165, range: 9800 } },
  },
  // the two forces open some nine kilometres apart on either side of the channel south of Savo
  start: { US: [4500, 2300, -Math.PI / 2], JP: [-5000, 2300, Math.PI / 2] },
};
function duelRoster(team, cls) { return DUEL.ships[team][cls] || []; }
// picks: { cls, US: key, JP: key, escorts: 0 | 2 }; returns the two flagships
function setupDuel(w, picks) {
  const out = {};
  for (const team of ['US', 'JP']) {
    const list = duelRoster(team, picks.cls), pick = list.find(p => p[0] === picks[team]) || list[0];
    const [x, z, hd] = DUEL.start[team];
    const P = w.add(new Ship(w, pick[0], team, pick[1], { player: true, no: pick[2], x, z, heading: hd, speedFrac: 0.7, tune: DUEL.tune[pick[0]] }));
    out[team] = P;
    DUEL.escorts[team].slice(0, picks.escorts).forEach(([k, n, no], i) => {
      const [ex, ez] = P.toWorld(i ? 480 : -480, -520);
      const e = w.add(new Ship(w, k, team, n, { no, x: ex, z: ez, heading: hd, speedFrac: 0.7, tune: DUEL.tune[k] }));
      e.ai = new AI(e); e.ai.slot = i; e.ai.leader = P;
    });
  }
  return out;
}
// share of the enemy force's tonnage destroyed (a damaged ship counts by the hit points it has lost)
function duelScore(w, team) {
  let lost = 0, all = 0;
  for (const s of w.ships) if (s.team !== team) { all += s.spec.tons; lost += s.spec.tons * (1 - Math.max(0, s.hp) / s.maxHp); }
  return all ? lost / all : 0;
}
// 'US' | 'JP' | 'draw' once the duel is decided: one side has nothing afloat, both captains are sunk, or time is up
function duelResult(w) {
  const afloat = team => w.ships.some(s => s.team === team && s.alive), us = afloat('US'), jp = afloat('JP');
  if (!us && !jp) return 'draw';
  if (!us) return 'JP';
  if (!jp) return 'US';
  const capsDown = !w.ships.some(s => s.isPlayer && s.alive);
  if (capsDown || w.time >= DUEL.limit) {
    const a = duelScore(w, 'US'), b = duelScore(w, 'JP');
    return Math.abs(a - b) < 0.02 ? 'draw' : a > b ? 'US' : 'JP';
  }
  return null;
}

const api = {
  TAU, DEG, clamp, lerp, rand, randn, wrapA, angDiff, KN, MAP_R, hash2, vnoise, fbm,
  GUNS, TORPS, TS, SPECS, SIZE_ERR, THROTTLE, DIFF, WAVE_DEF, ISL, islH, terrainH, interpSheer, deckY, halfW,
  Ship, World, AI, muzzleWorld, fireShell, fireTurret, launchFan, torpVisible, intercept, leadPoint, secondaryLogic,
  humanUpdate, playerFire, cmdDC, DUEL, duelRoster, setupDuel, duelScore, duelResult,
};
if (typeof module === 'object' && module.exports) module.exports = api; else root.IBSim = api;
})(typeof self !== 'undefined' ? self : this);
