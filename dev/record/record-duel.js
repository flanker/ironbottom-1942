// Promo footage of the online duel, step 2b (runs after the page's own scripts): the director. dev/record/record-duel.py loads
// one captain's message stream (dev/record/duel-stream.js), hands over a plan of timed actions (cursor moves, clicks, typing,
// binoculars, cameras) and then calls __vc.advance once per frame and screenshots the page. The battle itself is the
// real duel client replaying the server's snapshots; this only plays the captain's hands and the film crew.
(function () {
  const I = window.__ibs, G = I.G, F = window.__fake, VC = window.__vc, S = window.IBSim, cam = I.camera;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const D = window.__dr = { plan: [], pi: 0, cam: null, X: null, side: null, log: null, err: [] };
  window.addEventListener('error', e => D.err.push(String(e.message)));

  // ---- look: no pointer-lock prompts or mouse hints on video; a cinema mode without the HUD
  const css = document.createElement('style');
  css.textContent = `
    #lockHint{display:none!important}
    body.cine #hud, body.cine #overlay, body.cine #vignette, body.cine .screen{visibility:hidden!important}
    #cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:34px;transform:translate(-3px,-2px);display:none}
    #cursor.on{display:block}
    #ripple{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #f0b54a;opacity:0}
    *{caret-color:transparent}`;
  document.head.appendChild(css);
  const cur = document.createElement('div'); cur.id = 'cursor';
  cur.innerHTML = '<svg viewBox="0 0 26 34" width="26" height="34"><path d="M2 2 L2 27 L8.5 21 L13 31.5 L17.5 29.5 L13 19.5 L22 19.5 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
  const rip = document.createElement('div'); rip.id = 'ripple';
  document.body.append(cur, rip);
  let cx = 0, cy = 0, mv = null, ripT = -1;
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function center(sel) { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  function placeCursor() { cur.style.left = cx + 'px'; cur.style.top = cy + 'px'; }

  // ---- plan actions: [t, name, ...args]
  const A = {
    cursor(on, x, y) { cur.classList.toggle('on', !!on); if (x != null) { cx = x; cy = y; } else if (on && !cx) { cx = innerWidth * 0.62; cy = innerHeight * 0.55; } placeCursor(); },
    move(sel, dur = 0.6, dx = 0, dy = 0) { const p = Array.isArray(sel) ? sel : center(sel); if (!p) { D.err.push('move: no ' + sel); return; } mv = { t0: VC.t / 1000, dur, x0: cx, y0: cy, x1: p[0] + dx, y1: p[1] + dy }; },
    click(sel) {
      const el = document.querySelector(sel); if (!el) { D.err.push('click: no ' + sel); return; }
      const p = center(el); rip.style.left = p[0] + 'px'; rip.style.top = p[1] + 'px'; ripT = VC.t / 1000;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.click();
    },
    type(sel, text, cps = 7) { const el = document.querySelector(sel); el.focus(); const t0 = VC.t / 1000; typing = { el, text, t0, cps, n: 0 }; },
    zoom(on) { G.zoomToggle = !!on; },
    camZoom(z) { G.camZoom = z; },
    cine(on) { document.body.classList.toggle('cine', !!on); },
    cam(name, o) { D.cam = name ? CAMS[name](o || {}) : null; if (!name) cam.clearViewOffset(); },
    screen(name) { I.showScreen(name); },
    eval(code) { (0, eval)(code); },
  };
  let typing = null;
  D.run = (t, dt) => {
    while (D.pi < D.plan.length && D.plan[D.pi][0] <= t + 1e-6) { const [, n, ...a] = D.plan[D.pi++]; try { A[n](...a); } catch (e) { D.err.push(n + ': ' + e.message); } }
    if (mv) { const k = ease((t - mv.t0) / mv.dur); cx = lerp(mv.x0, mv.x1, k); cy = lerp(mv.y0, mv.y1, k); placeCursor(); if (k >= 1) mv = null; }
    if (ripT >= 0) { const k = (t - ripT) / 0.45; rip.style.opacity = k < 1 ? (1 - k).toFixed(2) : 0; rip.style.transform = `scale(${0.4 + k * 0.9})`; if (k >= 1) ripT = -1; }
    if (typing) {
      const n = Math.min(typing.text.length, Math.floor((t - typing.t0) * typing.cps) + 1);
      if (n > typing.n) { typing.n = n; typing.el.value = typing.text.slice(0, n); typing.el.dispatchEvent(new Event('input', { bubbles: true })); }
      if (n >= typing.text.length) typing = null;
    }
    // the captain's hands, from what the AI captain did on the server: target lock, telegraph, helm, weapon
    const g = G.net, X = D.X;
    if (g && X && g.me.alive && G.mode === 'play') {
      const T = X.lock && I.world.byId(X.lock);
      G.lock = T && T.alive && T.team !== g.me.team ? T : null;
      if (!G.lock) { const yaw = Math.atan2(X.ax - g.me.x, X.az - g.me.z); I.aim.yaw = yaw; I.aim.range = Math.hypot(X.ax - g.me.x, X.az - g.me.z); }
      g.me.throttle = X.th;
      I.keys.KeyA = X.rc > 0.3; I.keys.KeyD = X.rc < -0.3;
      if (X.torp && G.weapon !== 'torps') I.setWeapon('torps'); else if (!X.torp && G.weapon === 'torps') I.setWeapon('guns');
    }
    // mouse hints mean nothing on video
    const h = document.getElementById('hint'); if (h && /鼠标|点击画面/.test(h.textContent)) h.classList.remove('on');
  };
  VC.hooks.push(D.run);
  window.__camHook = dt => { if (D.cam) D.cam(VC.t / 1000, dt); };

  // ---- loading a side
  D.load = (stream, side, plan) => {
    D.side = side;
    const xs = stream.xme[side].map(([t, m]) => [t, Object.assign({ x: 1 }, m)]);
    F.stream = stream[side].concat(xs).sort((a, b) => a[0] - b[0]); F.i = 0;
    F.onX = m => { D.X = m; };
    D.plan = plan.slice().sort((a, b) => a[0] - b[0]); D.pi = 0;
    return F.stream.length;
  };

  // ---- cameras (o.ship: 'me' | 'foe' | 'US' | 'JP' | ship name)
  const W = (s, lx, ly, lz) => { const [x, z] = s.toWorld(lx, lz); return V(x, s.bob + ly, z); };
  const dirXZ = a => V(Math.sin(a), 0, Math.cos(a));
  function ship(ref) {
    const g = G.net; if (!g) return null;
    if (ref === 'me') return g.me; if (ref === 'foe') return g.foe;
    if (ref === 'US' || ref === 'JP') return g.side === ref ? g.me : g.foe;
    return I.world.ships.find(s => s.name === ref) || null;
  }
  function look(p, t, fov) { cam.position.copy(p); cam.lookAt(t); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); } }
  const span = (o, t) => ease((t - o.t0) / (o.dur || 6));
  const CAMS = {
    // circle a ship: az measured from its bow, el above the water, dist in metres
    orbit: o => { o.t0 = VC.t / 1000; return t => { const s = ship(o.ship); if (!s) return; const k = span(o, t), tg = W(s, 0, o.ly ?? 10, o.lz ?? 0), a = s.heading + lerp(o.az0 ?? 1.2, o.az1 ?? 0.8, k), d = lerp(o.d0 ?? 300, o.d1 ?? o.d0 ?? 300, k), el = o.el ?? 0.12; look(tg.clone().add(dirXZ(a).multiplyScalar(d * Math.cos(el))).add(V(0, d * Math.sin(el), 0)), tg, o.fov ?? 38); }; },
    // behind one ship, looking down the line at the other (a long lens squeezes the distance)
    chase: o => { o.t0 = VC.t / 1000; return t => { const a = ship(o.ship), b = ship(o.at); if (!a || !b) return; const k = span(o, t), to = Math.atan2(b.x - a.x, b.z - a.z), f = dirXZ(to), side = dirXZ(to + Math.PI / 2), d = Math.hypot(b.x - a.x, b.z - a.z); look(W(a, 0, 0, 0).add(f.clone().multiplyScalar(-(o.back ?? 450))).add(side.multiplyScalar(o.off ?? 60)).add(V(0, o.h ?? 110, 0)), V(a.x + f.x * d * (o.aim ?? 0.6), 0, a.z + f.z * d * (o.aim ?? 0.6)), lerp(o.fov0 ?? 32, o.fov1 ?? o.fov0 ?? 32, k)); }; },
    // beside a ship, on the side away from the enemy, low on the water: the target of the incoming fire
    target: o => { o.t0 = VC.t / 1000; return t => { const s = ship(o.ship), b = ship(o.from); if (!s || !b) return; const k = span(o, t), to = Math.atan2(b.x - s.x, b.z - s.z), a = to + Math.PI + lerp(o.sw0 ?? -0.5, o.sw1 ?? -0.35, k), tg = W(s, 0, o.ly ?? 8, 0); look(tg.clone().add(dirXZ(a).multiplyScalar(lerp(o.d0 ?? 420, o.d1 ?? o.d0 ?? 420, k))).add(V(0, o.h ?? 30, 0)), tg.clone().add(dirXZ(to).multiplyScalar(o.lookOut ?? 0)), o.fov ?? 36); }; },
    // ride the next big shell fired by a ship, then hold where it lands
    shell: o => {
      o.t0 = VC.t / 1000; let rider = null, hold = null, n0 = I.vshells.length;
      return t => {
        const s = ship(o.ship), b = ship(o.at);
        if (!rider) { const c = I.vshells.slice(n0).filter(q => q.alive && Math.hypot(q.x0 - s.x, q.z0 - s.z) < s.spec.L); if (c.length) rider = c[Math.min(c.length - 1, o.pick ?? 2)]; n0 = Math.min(n0, I.vshells.length); }
        if (!rider) { const tg = W(s, 0, 20, 0), to = Math.atan2(b.x - s.x, b.z - s.z); look(tg.clone().add(dirXZ(to + 2.4).multiplyScalar(260)).add(V(0, 40, 0)), V(s.x + Math.sin(to) * 2000, 0, s.z + Math.cos(to) * 2000), 40); return; }
        if (rider.alive && !hold) {
          const tt = G.time - rider.t0, vy = rider.vy0 - rider.g * tt, vel = V(rider.vx, vy, rider.vz).normalize(), sp = V(rider.x, rider.y, rider.z), sideV = V(-vel.z, 0, vel.x).normalize();
          D.lastShell = { p: sp.clone().add(vel.clone().multiplyScalar(-(o.back ?? 24))).add(sideV.multiplyScalar(o.side ?? 22)).add(V(0, 6, 0)), t: sp.clone().add(vel.clone().multiplyScalar(30)) };
        } else if (!hold) hold = D.lastShell;
        const c = hold || D.lastShell; if (c) look(c.p, c.t, o.fov ?? 50);
      };
    },
    // high and wide over everything afloat
    wide: o => { o.t0 = VC.t / 1000; return t => { const live = I.world.ships.filter(s => !s.removed); if (!live.length) return; const k = span(o, t); let mx = 0, mz = 0; for (const s of live) { mx += s.x; mz += s.z; } mx /= live.length; mz /= live.length; const r = Math.max(...live.map(s => Math.hypot(s.x - mx, s.z - mz))); const a = (o.az ?? 2.2) + lerp(0, o.swing ?? 0.15, k), d = Math.max(900, r * (o.k ?? 1.5)); look(V(mx + Math.sin(a) * d, d * (o.el ?? 0.45), mz + Math.cos(a) * d), V(mx, 0, mz), o.fov ?? 45); }; },
    // a fixed point near a ship's bow, looking back along it (or anywhere with lx/lz)
    deck: o => { o.t0 = VC.t / 1000; return t => { const s = ship(o.ship), b = o.at && ship(o.at); if (!s) return; const p = W(s, o.lx ?? 0, o.ly ?? 30, o.lz ?? 0); const tg = b ? V(b.x, o.ty ?? 10, b.z) : W(s, o.tx ?? 0, o.ty ?? 10, o.tz ?? -60); look(p, tg, o.fov ?? 50); }; },
  };
  D.CAMS = CAMS;

  // ---- sound: log what is raised during a take, then replay it through an OfflineAudioContext (as dev/record/legacy/record.js does)
  const SFX = ['gun', 'hit', 'splash', 'incoming', 'flyby', 'torpHit', 'boom', 'launch', 'alarm', 'pick'], orig = {}, Sfx = I.Sfx;
  for (const k of SFX) orig[k] = Sfx[k];
  for (const k of SFX) Sfx[k] = (...a) => { if (D.log) D.log.push({ t: VC.t / 1000, k, a, cp: cam.position.toArray(), cq: cam.quaternion.toArray(), P: G.player ? [G.player.x, G.player.z] : null, mode: G.mode }); };
  Sfx.engine = () => {}; Sfx.music = () => {};
  D.startLog = () => { D.log = []; D.logT0 = VC.t / 1000; };
  D.stopLog = () => { const l = D.log; D.log = null; return l; };
  function wav(buf) {
    const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2)), ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const d = [...Array(ch)].map((_, c) => buf.getChannelData(c));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, d[c][i])) * 32767, true);
    return new Uint8Array(out.buffer);
  }
  const sleep = ms => new Promise(r => VC.realSetTimeout(r, ms));
  // events: the log; t0: the take's first frame; returns the WAV as base64
  D.renderAudio = async (events, t0, dur) => {
    const SR = 48000, c = new OfflineAudioContext(2, Math.ceil(SR * dur), SR), Real = window.AudioContext;
    window.AudioContext = function () { return c; }; Sfx.ctx = null; Sfx.muted = false; Sfx.wantMusic = false; Sfx.init(); window.AudioContext = Real;
    for (let i = 0; i < 400 && Object.keys(Sfx.buf || {}).length < 17; i++) await sleep(25);
    Sfx.out.gain.value = 0.5;
    const q = 128 / SR, groups = new Map();
    for (const e of events) { const k = Math.max(2, Math.round((e.t - t0) / q)); if (k * q < dur - 0.05) (groups.get(k) || groups.set(k, []).get(k)).push(e); }
    const keep = { p: cam.position.clone(), q: cam.quaternion.clone(), mode: G.mode, P: G.player && [G.player.x, G.player.z] };
    for (const [k, list] of [...groups].sort((a, b) => a[0] - b[0])) {
      c.suspend(k * q).then(() => {
        for (const e of list) {
          cam.position.fromArray(e.cp); cam.quaternion.fromArray(e.cq); cam.updateMatrixWorld(true);
          G.mode = e.mode; if (G.player && e.P) { G.player.x = e.P[0]; G.player.z = e.P[1]; }
          Sfx.last = -1; Sfx.inFlight = 0;
          try { orig[e.k].apply(Sfx, e.a); } catch (err) { console.warn('sfx', e.k, err); }
        }
        c.resume();
      });
    }
    const buf = await c.startRendering();
    cam.position.copy(keep.p); cam.quaternion.copy(keep.q); G.mode = keep.mode; if (G.player && keep.P) { G.player.x = keep.P[0]; G.player.z = keep.P[1]; }
    Sfx.ctx = null;
    const bytes = wav(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
})();
