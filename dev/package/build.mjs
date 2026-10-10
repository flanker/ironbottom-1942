#!/usr/bin/env node
// Packages the single-player game as an upload zip for an in-app platform:
//   node dev/package/build.mjs minitool   → dist/ironbottom-1942-minitool.zip   Xiaohongshu mini tool (小红书小工具)
//   node dev/package/build.mjs toy        → dist/ironbottom-1942-toy.zip        bilibili Toy (B站 Toy)
// The XHS container is the strict one: no network, no inline scripts, no fetch, no .mp3 files, Chrome/WebView 61. So
// both targets get the same rewrite: duel (WebSocket) cut, script moved to app.js, sound clips carried as base64 in
// sfx.js, three.js and the Latin fonts bundled from ios/vendor, the CSS given Chrome 61 fallbacks. They differ in the
// container hooks: the XHS Storage API, or the Toy SDK's cloud storage plus landscape/immersive mode and its safe area.
// Every patch must match exactly once, so a change to index.html that breaks one fails the build instead of shipping a
// half-converted page. Rules: .claude/skills/minitool-zip-builder (XHS); bilibili's Toy developer FAQ and SDK docs (Toy).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET = process.argv[2];
if (TARGET !== 'minitool' && TARGET !== 'toy') { console.error('usage: node dev/package/build.mjs minitool|toy'); process.exit(2); }
const OUT = path.join(ROOT, 'dist', TARGET);
const ZIP = path.join(ROOT, `dist/ironbottom-1942-${TARGET}.zip`);
// the Toy SDK has to come from bilibili's CDN (window.toy)
const TOY_SDK = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function once(s, from, to, what) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`patch "${what}": expected 1 match, found ${n}`);
  return s.replace(from, () => to);
}
function between(s, a, b, what) {
  const i = s.indexOf(a), j = s.indexOf(b, i + a.length);
  if (i < 0 || j < 0 || s.indexOf(a, i + 1) >= 0) throw new Error(`cut "${what}": markers not found exactly once`);
  return [s.slice(0, i), s.slice(i + a.length, j), s.slice(j + b.length)];
}

// ---------------------------------------------------------------- page
let html = read('index.html');
let [head, css, rest] = between(html, '<style>\n', '</style>\n', 'style');
let [body, app, tail] = between(rest, '<script>\n', '</script>\n', 'app script');

head = head.replace(/<link rel="preconnect"[^>]*>\n/g, '').replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\n/g, '');
head = once(head, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">/, '<link rel="stylesheet" href="./fonts/fonts.css">\n<link rel="stylesheet" href="./style.css">', 'fonts');
body = once(body, '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>\n<script src="sim.js"></script>\n',
  (TARGET === 'toy' ? `<script src="${TOY_SDK}"></script>\n` : '') + '<script src="./three.min.js"></script>\n<script src="./sim.js"></script>\n<script src="./sfx.js"></script>\n', 'scripts');
body = once(body, '<button type="button" class="mode duel" id="modeDuel">', '<button type="button" class="mode duel" id="modeDuel" hidden>', 'hide duel');
// with the duel gone the home screen offers a single choice, so the game opens on the ship pick and comes back to it
body = once(body, '<button class="back" id="menuBack" type="button">', '<button class="back" id="menuBack" type="button" hidden>', 'hide home link');
html = head + body + '<script src="./app.js"></script>\n' + tail;

// ---------------------------------------------------------------- app.js
const MARK = name => `// ---------------------------------------------------------------- ${name}\n`;

// no WebGL at all: say so instead of a blank screen
app = once(app, "'use strict';\n", `'use strict';
if (!(function () { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })()) {
  document.getElementById('app').innerHTML = '<p style="position:absolute;top:40%;left:0;right:0;text-align:center;color:#ebe3cd;font-size:15px;line-height:1.8;padding:0 24px">这台设备暂时显示不了 3D 画面</p>';
  return;
}
// Chrome 61 baseline: no env(), no flex gap. Safe-area insets come in as --safe-area-inset-* (the PC simulator sets them);
// where env() is missing, pin them to 0 so the var() fallback chain never lands on an unparsable env().
(function () {
  const root = document.documentElement, cs = getComputedStyle(root);
  if (!(window.CSS && CSS.supports && CSS.supports('top', 'env(safe-area-inset-top)')))
    ['top', 'right', 'bottom', 'left'].forEach(k => { if (!cs.getPropertyValue('--safe-area-inset-' + k).trim()) root.style.setProperty('--safe-area-inset-' + k, '0px'); });
  const f = document.createElement('div');
  f.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  f.appendChild(document.createElement('div')); f.appendChild(document.createElement('div'));
  document.body.appendChild(f); if (f.scrollHeight !== 1) root.classList.add('no-flexgap'); f.remove();
})();
`, 'webgl + css probes');

// storage: localStorage always, plus the platform's own storage when it is there: read once before boot, written back
// in batches (a few seconds after a change, and right away when the page is hidden), so a click never becomes a request
const CLOUD = {
  // the XHS Storage API, on clients 9.46+
  minitool: `const XT = window.xhs && window.xhs.miniTool;
const cloud = {
  load(keys) {
    const ver = o => Math.floor((Number(o && o.miniToolEnv && o.miniToolEnv.buildVersion) || 0) / 1000);
    const opts = window.xhs && window.xhs.launchOptions ? Promise.resolve(window.xhs.launchOptions)
      : XT && typeof XT.getLaunchOptions === 'function' ? XT.getLaunchOptions().catch(() => null) : Promise.resolve(null);
    return opts.then(o => {
      if (!(ver(o) >= 9460 && XT && typeof XT.getStorage === 'function' && typeof XT.setStorage === 'function')) return null;
      const d = {};
      return Promise.all(keys.map(k => XT.getStorage({ key: 'ibs.' + k }).then(r => { if (r && r.data != null) d[k] = r.data; }).catch(() => {}))).then(() => d);
    });
  },
  save(items) { return Promise.all(Object.keys(items).map(k => XT.setStorage({ key: 'ibs.' + k, data: items[k] }))); },
  limited() { return false; }
};`,
  // Toy cloud storage: follows the viewer's bilibili account across devices; fails (and we stay local) when logged out.
  // Keys must match [a-zA-Z0-9_-]; all of a Toy's players share one request budget, over it the SDK rejects with 307044.
  toy: `const TOY = window.toy;
const cloud = {
  load(keys) {
    if (!TOY || typeof TOY.isSupport !== 'function') return Promise.resolve(null);
    return Promise.all([TOY.isSupport('getCloudStorage'), TOY.isSupport('setCloudStorage')]).then(s => s.every(Boolean) ? TOY.getCloudStorage(keys.map(k => 'ibs_' + k)) : null)
      .then(r => { if (!r) return null; const d = {}; keys.forEach(k => { const v = r['ibs_' + k]; if (v != null && v !== '') d[k] = v; }); return d; });
  },
  save(items) { const o = {}; for (const k in items) o['ibs_' + k] = items[k]; return TOY.setCloudStorage(o); },
  limited(e) { return !!e && e.code === 307044; }
};`,
}[TARGET];
app = once(app, `const store = {
  get(k, d) { try { const v = localStorage.getItem('ibs.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ibs.' + k, JSON.stringify(v)); } catch (e) {} }
};`, CLOUD + `
const store = {
  mem: {}, synced: false, saved: {}, dirty: {}, timer: 0, busy: false, backoff: 0,
  get(k, d) { if (k in this.mem) return this.mem[k]; try { const v = localStorage.getItem('ibs.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) {
    this.mem[k] = v; const data = JSON.stringify(v);
    try { localStorage.setItem('ibs.' + k, data); } catch (e) {}
    if (!this.synced) return;
    if (this.saved[k] === data) delete this.dirty[k]; else { this.dirty[k] = data; this.later(3000); }
  },
  later(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), ms); },
  // one batched write at a time; rate-limited (307044) → keep the keys and retry with a doubling delay; any other
  // failure (logged out, rejected) → leave it to localStorage
  flush() {
    clearTimeout(this.timer);
    const items = this.dirty;
    if (!this.synced || this.busy || !Object.keys(items).length) return;
    this.dirty = {}; this.busy = true;
    Promise.resolve().then(() => cloud.save(items)).then(() => { Object.assign(this.saved, items); this.backoff = 0; }, e => {
      if (!cloud.limited(e)) return;
      for (const k in items) if (!(k in this.dirty)) this.dirty[k] = items[k];
      this.backoff = Math.min(60000, this.backoff ? this.backoff * 2 : 2000);
    }).then(() => { this.busy = false; if (Object.keys(this.dirty).length) this.later(this.backoff || 3000); });
  },
  // read the platform's copies before the game boots; gives up after 1.5 s rather than hold the menu, and a late
  // answer never overwrites something set meanwhile
  restore(keys) {
    const load = Promise.resolve().then(() => cloud.load(keys)).then(d => {
      if (!d) return;
      this.synced = true;
      for (const k in d) { this.saved[k] = d[k]; if (!(k in this.mem)) try { this.mem[k] = JSON.parse(d[k]); } catch (e) {} }
    }).catch(() => {});
    return Promise.race([load, new Promise(res => setTimeout(res, 1500))]);
  }
};`, 'store');

// sound clips: sfx.js carries them as base64 (no fetch, no .mp3 in the package)
app = once(app, `for (const n in SFX_CLIPS) fetch((window.__IBS_BASE || '') + 'sfx/' + n + '.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))`,
  `for (const n in SFX_CLIPS) new Promise((res, rej) => { const s = window.__IBS_SFX && window.__IBS_SFX[n]; if (!s) return rej(n); const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); res(a.buffer); })`, 'sfx');

// WebGL budget: DPR ≤ 1.5 and about 2 M drawing-buffer pixels (the adaptive drop to 1 still applies)
app = once(app, 'renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));', 'renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));', 'dpr');
app = once(app, `  const w = window.innerWidth, h = window.innerHeight; VW = w; VH = h;
  renderer.setSize(`, `  const w = window.innerWidth, h = window.innerHeight; VW = w; VH = h;
  renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), Math.sqrt(2e6 / Math.max(1, w * h))));
  renderer.setSize(`, 'pixel budget');

// one way to play: open on the ship pick, and every "back to the home screen" lands there too
app = once(app, "  showScreen('home'); setupPreview(); measureStage();\n", "  showScreen('menu'); setupPreview(); drawMenuArt(); measureStage();\n", 'open on ship pick');
app = once(app, "function toHome() { toMenu('home'); }", 'function toHome() { toMenu(); }', 'home is the ship pick');
app = once(app, "(!$('#menu').hidden || !$('#mp').hidden)", "!$('#mp').hidden", 'no Esc to home');

// no iOS-app shell in the container
app = once(app, 'const APP = window.__IBS_APP || null;', 'const APP = null;', 'app shell');

// the duel needs the server: cut it, leave the few names the rest of the page calls
const [pre, , post] = between(app, MARK('duel (online)'), MARK('boot'), 'duel');
app = pre + `// ---------------------------------------------------------------- duel: not in this build (no game server)
const Net = { send() {}, leave() {}, open() {} };
function mpSay() {}
function showDuelEnd() { showEnd(); }
function duelAgain() { startGame(); }
function duelQuit() { G.net = null; G.watch = null; toHome(); }

// ---------------------------------------------------------------- container
// hidden (app switched away, screen locked): pause the battle and the sound; the frame loop's dt clamp covers the return
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (G.mode === 'play') pause(true); store.flush(); try { Sfx.ctx && Sfx.ctx.suspend(); } catch (e) {} }
  else { try { Sfx.ctx && Sfx.ctx.resume(); } catch (e) {} }
});
// a lost GL context stops the loop with a note; no rebuild attempts
glCanvas.addEventListener('webglcontextlost', e => {
  e.preventDefault(); G.hold = true;
  try { Sfx.ctx && Sfx.ctx.suspend(); } catch (err) {}
  const n = document.createElement('p');
  n.style.cssText = 'position:absolute;top:40%;left:0;right:0;z-index:50;text-align:center;color:#ebe3cd;font-size:15px;line-height:1.8;padding:0 24px;margin:0';
  n.textContent = '3D 画面中断了，请关闭后重新打开';
  $('#app').appendChild(n);
}, false);
` + {
  minitool: `function containerInit() {}
`,
  // B站 App 9.9.0+: landscape + immersive (a phone in landscape has to be immersive), and the container's safe area,
  // the top capsule included, fed into the --safe-area-inset-* the CSS already reads. Elsewhere (web, old app) nothing
  // happens and the page lays out as it does in a browser.
  toy: `function containerInit() {
  const T = window.toy;
  if (!T || typeof T.isSupport !== 'function') return;
  const apply = st => {
    if (!st || typeof st !== 'object') return;
    if (st.safeArea && typeof st.safeArea === 'object')
      ['top', 'right', 'bottom', 'left'].forEach(k => document.documentElement.style.setProperty('--safe-area-inset-' + k, Math.max(0, Number(st.safeArea[k]) || 0) + 'px'));
    resize();
  };
  Promise.all(['onContainerChange', 'getContainerState', 'setContainerMode'].map(n => T.isSupport(n))).then(s => {
    if (!s.every(Boolean)) return;
    T.onContainerChange(apply);
    return T.setContainerMode({ orientation: 'landscape', immersive: true }).catch(() => {}).then(() => T.getContainerState()).then(apply);
  }).catch(() => {});
}
`,
}[TARGET] + `
` + MARK('boot') + post;
app = once(app, `  // a duel invite (?room=1234), or a duel this page was in a moment ago (a reload, a dropped connection)
  const room = (new URLSearchParams(location.search).get('room') || '').replace(/\\D/g, ''), ses = store.get('duel', null);
  if (ses && Date.now() - ses.at < 5 * 60 * 1000 && (!room || room === ses.code)) { Net.session = ses; Net.open(); }
  else if (room.length === 4) { store.set('duel', null); showScreen('mp'); $('#mpCode').value = room; mpSay('正在加入房间 ' + room + '…'); Net.open(); Net.send({ t: 'join', code: room }); }
`, '', 'duel boot');
app = once(app, 'if (HOT && HOT.ready) HOT.ready(start); else start((HOT && HOT.data) || {});',
  `store.restore(['ship', 'diff', 'muted', 'best']).then(() => {
  G.shipKey = store.get('ship', G.shipKey); G.diff = store.get('diff', G.diff); Sfx.muted = store.get('muted', Sfx.muted);
  start({});
  containerInit();
});`, 'boot');

// ---------------------------------------------------------------- style.css: Chrome 61 fallbacks
// Chrome 61 drops a declaration it can't parse, so a plain fallback goes first and the modern one after it overrides
// where supported. Handled: env() → var(--safe-area-inset-*) chain, clamp/min/max fallbacks, inset and margin-block
// spelled out, grid-gap beside gap, flex gap as margins under .no-flexgap, :focus-visible split from :hover selectors.
function splitTop(s, sep) {
  const out = []; let d = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') d++; else if (ch === ')') d--;
    if (d === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur.trim() || sep !== ' ') out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// rewrite calls of fn(...) (not -fn( or xfn(, so minmax( stays) via handler(args)
function mapCalls(v, fn, handler) {
  const re = new RegExp(`(^|[^-\\w])${fn}\\(`, 'g'); let m, out = '', last = 0;
  while ((m = re.exec(v))) {
    const start = m.index + m[1].length, open = start + fn.length; let d = 0, j = open;
    for (; j < v.length; j++) { if (v[j] === '(') d++; else if (v[j] === ')' && --d === 0) break; }
    out += v.slice(last, start) + handler(splitTop(v.slice(open + 1, j), ',')); last = j + 1; re.lastIndex = j + 1;
  }
  return out + v.slice(last);
}
const fallbackOf = v => {
  let f = mapCalls(v, 'env', a => a[1] || '0px');
  f = mapCalls(f, 'clamp', a => a[1]); f = mapCalls(f, 'min', a => a[0]); f = mapCalls(f, 'max', a => a[0]);
  return f === v ? null : f;
};
const SIDES = ['top', 'right', 'bottom', 'left'];
function lowerDecl(prop, val) {
  const imp = /\s*!important$/.test(val) ? '!important' : '', v = val.replace(/\s*!important$/, '');
  if (prop === 'inset') { const p = splitTop(v, ' '), q = [p[0], p[1] || p[0], p[2] || p[0], p[3] || p[1] || p[0]]; return SIDES.flatMap((s, i) => lowerDecl(s, q[i] + imp)); }
  if (prop === 'margin-block') { const p = splitTop(v, ' '); return [...lowerDecl('margin-top', p[0] + imp), ...lowerDecl('margin-bottom', (p[1] || p[0]) + imp)]; }
  const out = [], modern = mapCalls(v, 'env', a => /^safe-area-inset-/.test(a[0]) ? `var(--${a[0]},env(${a.join(',')}))` : `env(${a.join(',')})`);
  const fb = fallbackOf(v);
  if (fb) out.push([prop, fb + imp]);
  if (prop === 'gap') out.push(['grid-gap', v + imp]);
  out.push([prop, modern + imp]);
  return out;
}
function parseCss(s) {
  const nodes = []; let i = 0;
  while (i < s.length) {
    const b = s.indexOf('{', i); if (b < 0) break;
    const sel = s.slice(i, b).trim(); let d = 1, j = b + 1;
    for (; j < s.length && d; j++) { if (s[j] === '{') d++; else if (s[j] === '}') d--; }
    const inner = s.slice(b + 1, j - 1);
    if (/^@(media|supports)/.test(sel)) nodes.push({ at: sel, kids: parseCss(inner) });
    else if (sel.startsWith('@')) nodes.push({ at: sel, raw: inner });
    else nodes.push({ sel, decls: splitTop(inner, ';').filter(Boolean).map(x => { const k = x.indexOf(':'); return [x.slice(0, k).trim(), x.slice(k + 1).trim()]; }) });
    i = j;
  }
  return nodes;
}
const FLEX = {};
function lowerRules(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.kids) { out.push({ at: n.at.replace('(pointer:coarse) and (not (pointer:fine))', '(pointer:coarse)'), kids: lowerRules(n.kids) }); continue; }
    if (n.raw != null) { out.push(n); continue; }
    const decls = n.decls.flatMap(([p, v]) => lowerDecl(p, v));
    const sels = splitTop(n.sel, ','), fv = sels.filter(x => x.includes(':focus-visible')), plain = sels.filter(x => !x.includes(':focus-visible'));
    if (plain.length) out.push({ sel: plain.join(','), decls });
    if (fv.length) out.push({ sel: fv.join(','), decls });
    // flex gap → margins when the probe found no flex gap
    const get = p => { const d = n.decls.filter(x => x[0] === p).pop(); return d && d[1]; };
    for (const s of sels) {
      const f = FLEX[s] = FLEX[s] || {};
      if (get('display')) f.flex = /flex/.test(get('display'));
      if (get('flex-direction')) f.col = /column/.test(get('flex-direction'));
      if (get('flex-wrap')) f.wrap = get('flex-wrap') === 'wrap';
    }
    const gap = get('gap');
    if (gap && sels.every(s => FLEX[s].flex)) {
      const [r, c = r] = splitTop(gap, ' ').map(x => fallbackOf(x) || x), f = FLEX[sels[0]];
      const pre = x => `html.no-flexgap ${x}`;
      if (f.wrap) out.push({ sel: sels.map(x => pre(x) + '>*').join(','), decls: [['margin-right', c], ['margin-bottom', r]] });
      else out.push({ sel: sels.map(x => pre(x) + '>*+*').join(','), decls: [[f.col ? 'margin-top' : 'margin-left', f.col ? r : c]] });
    }
  }
  return out;
}
const printCss = nodes => nodes.map(n => n.kids ? `${n.at}{\n${printCss(n.kids)}}\n` : n.raw != null ? `${n.at}{${n.raw}}\n` : `${n.sel}{${n.decls.map(([p, v]) => p + ':' + v).join(';')}}\n`).join('');
let style = printCss(lowerRules(parseCss(css.replace(/\/\*[\s\S]*?\*\//g, ''))));
// one way to play here: the solo card takes the row the duel card shared
style += '#home .modes{grid-template-columns:minmax(0,1fr)}\n';
// the XHS container lays its own bar (back button on the left, profile and share on the right, 44 px) over the page just
// under the status bar, and env(safe-area-inset-top) covers only the status bar
if (TARGET === 'minitool') style += ':root{--chrome-top:44px}\n';
// the Toy container floats its ··· / ✕ capsule in the top-right corner (about 84 px in from the right edge, 47 px down),
// and its safe area doesn't report it: the score and clock sit left of it, the chart below it
if (TARGET === 'toy') style += '@media (pointer:coarse) and (orientation:landscape) and (max-height:540px){.hud-tr{right:96px}.hud-br{top:56px}}\n';

// ---------------------------------------------------------------- files
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, 'style.css'), style);
fs.writeFileSync(path.join(OUT, 'app.js'), app);
fs.copyFileSync(path.join(ROOT, 'sim.js'), path.join(OUT, 'sim.js'));
// three r160 has two object spreads (ES2018); Object.assign keeps it inside ES2017
let three = read('ios/vendor/three.min.js');
three = three.replace(/^console\.warn\('Scripts "build\/three\.js"[^\n]*\),\n/, 'void 0,\n');   // the r150 deprecation notice, minus its URL
three = three.split('(t=>({...t}))').join('(t=>Object.assign({},t))');
if (three.includes('{...')) throw new Error('three.min.js: object spread left after patch');
fs.writeFileSync(path.join(OUT, 'three.min.js'), three);
for (const f of fs.readdirSync(path.join(ROOT, 'ios/vendor/fonts'))) fs.copyFileSync(path.join(ROOT, 'ios/vendor/fonts', f), path.join(OUT, 'fonts', f));
const clips = [.../const SFX_CLIPS = \{([\s\S]*?)\};/.exec(app)[1].matchAll(/(\w+):/g)].map(m => m[1]);
fs.writeFileSync(path.join(OUT, 'sfx.js'), '// sound clips (MP3 as base64): the container takes no .mp3 files and no fetch, so they ride in a script\nwindow.__IBS_SFX = {\n' +
  clips.map(n => `${n}: '${fs.readFileSync(path.join(ROOT, 'sfx', n + '.mp3')).toString('base64')}'`).join(',\n') + '\n};\n');

// ---------------------------------------------------------------- checks (device-capabilities.md §6, zip-artifact-spec.md §3–4)
const BANNED = [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /RTCPeerConnection/, /geolocation/, /clipboard/, /execCommand/, /new (Shared)?Worker\(/,
  /serviceWorker/, /\beval\(/, /new Function\(/, /WebAssembly/, /window\.open\(/, /\bprompt\(/, /requestFullscreen/, /devicemotion|deviceorientation/i, /getBattery/,
  /navigator\.(connection|credentials|locks|bluetooth|usb|hid|serial)/, /\blocation\.(href|assign|replace|search)/, /type="module"/, /^\s*(import|export)\s/m];
const OURS = ['index.html', 'style.css', 'app.js', 'sim.js', 'sfx.js'];
const problems = [];
for (const f of OURS) {
  const s = fs.readFileSync(path.join(OUT, f), 'utf8');
  for (const re of BANNED) if (re.test(s)) problems.push(`${f}: ${re}`);
  if (f !== 'sfx.js' && /https?:\/\//.test(s.split(TOY_SDK).join('').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))) problems.push(`${f}: external URL`);
}
if (/<script>(?!<\/script>)|<script(?![^>]*\bsrc=)[^>]*>|\son[a-z]+="|<iframe|<object|<base\s|target="_blank"|\sdownload[\s>=]|Content-Security-Policy/i.test(html)) problems.push('index.html: inline script / handler / iframe / base / CSP');
for (const ref of html.match(/(?:src|href)="([^"]+)"/g).map(x => x.replace(/^(src|href)="|"$/g, ''))) {
  if (TARGET === 'toy' && ref === TOY_SDK) continue;
  if (!ref.startsWith('./')) problems.push(`index.html: non-relative reference ${ref}`);
  else if (!fs.existsSync(path.join(OUT, ref))) problems.push(`index.html: missing ${ref}`);
}
const ALLOWED = /\.(html|css|js|png|jpe?g|gif|webp|svg|woff2?|json)$/;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(OUT)) if (!ALLOWED.test(f)) problems.push(`file type not allowed: ${path.relative(OUT, f)}`);
if (problems.length) { console.error('minitool build: checks failed\n  ' + problems.join('\n  ')); process.exit(1); }

// content hashes in the file names: an update re-downloads only what changed (sfx.js and three.js rarely do)
for (const f of ['style.css', 'app.js', 'sim.js', 'sfx.js', 'three.min.js']) {
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, f))).digest('hex').slice(0, 8);
  const named = f.replace(/(\.min)?\.(js|css)$/, (m, min, ext) => `.${h}${min || ''}.${ext}`);
  fs.renameSync(path.join(OUT, f), path.join(OUT, named));
  html = once(html, `"./${f}"`, `"./${named}"`, `hash ${f}`);
}
fs.writeFileSync(path.join(OUT, 'index.html'), html);

fs.rmSync(ZIP, { force: true });
execFileSync('zip', ['-r', '-X', '-9', '-q', ZIP, '.', '-x', '*.DS_Store'], { cwd: OUT });
const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
for (const f of walk(OUT).sort()) console.log(`  ${path.relative(OUT, f).padEnd(44)} ${kb(f).padStart(8)}`);
console.log(`${path.relative(ROOT, ZIP)}  ${kb(ZIP)}`);
