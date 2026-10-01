// Promo-footage recorder. Takes over the game loop (G.hold), steps the simulation at a fixed rate, and posts each
// rendered frame as a JPEG to the receiver (dev/recserver.py on :8766). Sounds raised during a shot are logged with
// their sim time and camera, then replayed through an OfflineAudioContext so the mix lines up with the picture.
// Usage from the console: await __rec.setup(); await __rec.run('hook') … see SHOTS below.
(function () {
  const I = window.__ibs, G = I.G, cam = I.camera, SR = 48000, RX = 'http://127.0.0.1:8766/save?path=';
  const R = window.__rec = { w: 1920, h: 1080, fps: 60, q: 0.92 };
  const comp = document.createElement('canvas'), cx = comp.getContext('2d');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let inflight = [];
  async function post(path, body) {
    inflight.push(fetch(RX + encodeURIComponent(path), { method: 'POST', body }).then(r => { if (!r.ok) throw new Error('post ' + path); }));
    if (inflight.length > 8) await inflight.shift();
  }
  async function flush() { await Promise.all(inflight); inflight = []; }
  R.post = post; R.flush = flush;

  R.setup = async (w = 1920, h = 1080) => {
    R.w = w; R.h = h; G.hold = true; G.mode = 'viewer'; I.showScreen(null);
    document.querySelectorAll('.screen,#hud,#touch').forEach(e => { e.hidden = true; });
    I.forceSize(w, h); comp.width = w; comp.height = h;
    if (document.fonts) await document.fonts.ready;
    return 'ready ' + w + 'x' + h;
  };

  // ---- audio: log during the shot, replay offline afterwards
  const SFX = ['gun', 'hit', 'splash', 'incoming', 'flyby', 'torpHit', 'boom', 'launch'], orig = {};
  for (const k of SFX) orig[k] = I.Sfx[k];
  let log = null, simT = 0;
  function hook(on) {
    for (const k of SFX) I.Sfx[k] = on ? (...a) => {
      log.push({ t: simT, k, a, cp: cam.position.toArray(), cq: cam.quaternion.toArray(), P: G.player ? [G.player.x, G.player.z] : null, mode: G.mode });
    } : orig[k];
  }
  function wav(buf) {
    const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2)), ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const d = [...Array(ch)].map((_, c) => buf.getChannelData(c));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, d[c][i])) * 32767, true);
    return new Blob([out], { type: 'audio/wav' });
  }
  async function renderAudio(name, dur, events) {
    const S = I.Sfx, c = new OfflineAudioContext(2, Math.ceil(SR * dur), SR), Real = window.AudioContext;
    window.AudioContext = function () { return c; }; S.ctx = null; S.muted = false; S.wantMusic = false; S.init(); window.AudioContext = Real;
    for (let i = 0; i < 200 && Object.keys(S.buf).length < 17; i++) await new Promise(r => setTimeout(r, 25));
    S.out.gain.value = 0.5;   // headroom: salvos and incoming shells stack up; the edit normalises later
    const q = 128 / SR, groups = new Map();
    for (const e of events) { const k = Math.max(2, Math.round(e.t / q)); if (k * q < dur - 0.05) (groups.get(k) || groups.set(k, []).get(k)).push(e); }
    const keep = { p: cam.position.clone(), q: cam.quaternion.clone(), mode: G.mode, P: G.player && [G.player.x, G.player.z] };
    for (const [k, list] of [...groups].sort((a, b) => a[0] - b[0])) {
      c.suspend(k * q).then(() => {
        for (const e of list) {
          cam.position.fromArray(e.cp); cam.quaternion.fromArray(e.cq); cam.updateMatrixWorld(true);
          G.mode = e.mode; if (G.player && e.P) { G.player.x = e.P[0]; G.player.z = e.P[1]; }
          S.last = -1; S.inFlight = 0;
          try { orig[e.k].apply(S, e.a); } catch (err) { console.warn('sfx', e.k, err); }
        }
        c.resume();
      });
    }
    const buf = await c.startRendering();
    cam.position.copy(keep.p); cam.quaternion.copy(keep.q); G.mode = keep.mode; if (G.player && keep.P) { G.player.x = keep.P[0]; G.player.z = keep.P[1]; }
    await post(`shots/${name}/audio.wav`, wav(buf));
  }

  // ---- shot runner: f = { warm, tick(t, dt), cam(t, dt), paint(ctx, t), overlay }
  R.shot = async (name, dur, f = {}) => {
    const dt = 1 / R.fps, n = Math.round(dur * R.fps);
    for (let i = 0, m = Math.round((f.warm || 0) * R.fps); i < m; i++) { f.warmTick && f.warmTick(i * dt, dt); I.step(dt, true); }
    log = []; hook(true);
    for (let i = 0; i < n; i++) {
      const t = i * dt; simT = t;
      f.tick && f.tick(t, dt);
      I.step(dt, true);
      f.cam ? f.cam(t + dt, dt) : I.updateCamera(dt);
      I.renderView();
      cx.drawImage(I.glCanvas, 0, 0, R.w, R.h);
      if (f.overlay) { I.drawOverlay(); cx.drawImage(I.ov, 0, 0, R.w, R.h); }
      f.paint && f.paint(cx, t + dt);
      const blob = await new Promise(r => comp.toBlob(r, 'image/jpeg', R.q));
      await post(`shots/${name}/f${String(i).padStart(5, '0')}.jpg`, blob);
    }
    await flush(); hook(false);
    const events = log; log = null;
    await renderAudio(name, dur, events);
    return { name, frames: n, events: events.length };
  };
  // a still / 2D animation rendered without the 3D scene
  R.anim = async (name, dur, draw, w = R.w, h = R.h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), n = Math.round(dur * R.fps);
    for (let i = 0; i < n; i++) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); draw(g, i / R.fps, w, h);
      await post(`shots/${name}/f${String(i).padStart(5, '0')}.jpg`, await new Promise(r => c.toBlob(r, 'image/jpeg', R.q)));
    }
    await flush(); return { name, frames: n };
  };
  // transparent caption card
  R.card = async (path, w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
    await post(path, await new Promise(r => c.toBlob(r, 'image/png'))); await flush();
  };
  R.still = async path => { I.renderView(); cx.drawImage(I.glCanvas, 0, 0, R.w, R.h); await post(path, await new Promise(r => comp.toBlob(r, 'image/jpeg', 0.95))); await flush(); };

  // ---- scene helpers
  const KN = 0.5144 * 2.6;
  function scene() { I.clearWorld(); G.mode = 'viewer'; G.player = null; G.stats = null; cam.clearViewOffset(); }
  function ship(key, team, name, x, z, hd, frac = 0.7, thr = 5) { const s = new I.Ship(key, team, name, { x, z, heading: hd, speedFrac: frac }); s.throttle = thr; I.ships.push(s); return s; }
  function look(p, t, fov = 45) { cam.position.copy(p); cam.lookAt(t); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); } }
  function aimAt(s, x, z) { s.aimX = x; s.aimZ = z; }
  function salvo(s, x, z, err = 10, sec = false) { for (const t of s.turrets) if (!!t.sec === sec && t.inArc) I.fireTurret(s, t, x, z, err); }
  function lead(from, tgt) { return I.leadPoint(from.x, from.z, tgt, from.gun); }
  const W = (s, lx, ly, lz) => { const [x, z] = s.toWorld(lx, lz); return V(x, s.bob + ly, z); };
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const lerpV = (a, b, t) => a.clone().lerp(b, t);
  const SUN = I.SUN_AZ, dirXZ = a => V(Math.sin(a), 0, Math.cos(a));
  R.h2 = { scene, ship, look, aimAt, salvo, lead, W, ease, lerpV, dirXZ, V, SUN };

  // ---- the shots (all at the same spot of open water west of the start; the sunset lies toward -x)
  const BX = 2000, BZ = 2400;
  const SHOTS = R.SHOTS = {
    // a battleship's broadside into the sunset, camera low on the water
    hook: () => {
      scene(); const nc = ship('nc', 'US', '华盛顿号', BX, BZ, 0.25, 0.35, 3);
      const tx = BX - 9000, tz = BZ + 1800; aimAt(nc, tx, tz); nc.secT = {}; nc.secAimX = BX - 4000; nc.secAimZ = BZ + 900;
      let shake = 0;
      return R.shot('hook', 4.5, {
        warm: 4,
        tick: t => {
          if (Math.abs(t - 0.9) < 1e-6) { salvo(nc, tx, tz, 30); shake = 1; }
          if (Math.abs(t - 2.2) < 1e-6 || Math.abs(t - 3.2) < 1e-6) salvo(nc, BX - 4000, BZ + 900, 30, true);
        },
        cam: (t, dt) => {
          shake *= Math.exp(-dt * 4);
          const base = W(nc, 0, 0, 0), side = dirXZ(nc.heading + Math.PI / 2 + 0.55), k = ease(t / 4.5);
          const p = base.clone().add(side.multiplyScalar(lerp(175, 140, k))).add(V(0, lerp(7, 11, k), 0)).add(V((Math.random() - .5) * shake * 2.5, (Math.random() - .5) * shake * 2, 0));
          look(p, W(nc, 0, 13, 6), 40);
        },
      });
    },
    // drone pass over a column of three ships at speed
    title: () => {
      scene(); const hd = Math.atan2(-0.62, -0.78), f = dirXZ(hd);
      const a = ship('fletcher', 'US', '弗莱彻号', BX, BZ, hd, 0.9, 6), b = ship('brooklyn', 'US', '海伦娜号', BX - f.x * 420, BZ - f.z * 420, hd, 0.9, 6), c = ship('nc', 'US', '华盛顿号', BX - f.x * 900, BZ - f.z * 900, hd, 0.9, 6);
      const v = 26 * KN; for (const s of [a, b, c]) { s.maxV = v; s.speed = v; }
      return R.shot('title', 5, {
        warm: 6,
        cam: t => {
          const k = ease(t / 5), tail = W(c, 0, 0, 0), right = dirXZ(hd + Math.PI / 2);
          const p = tail.clone().add(f.clone().multiplyScalar(lerp(-330, -150, k))).add(right.multiplyScalar(lerp(90, 55, k))).add(V(0, lerp(85, 42, k), 0));
          look(p, W(b, 0, 0, 0).add(f.clone().multiplyScalar(80)), 40);
        },
      });
    },
    // destroyer, light cruiser, battleship sailing in column, filmed broadside: sizes at a glance
    lineup: () => {
      scene(); const hd = SUN + Math.PI / 2, f = dirXZ(hd), v = 20 * KN;
      const offs = [0, -210, -474];
      const ships3 = [['fletcher', '弗莱彻号'], ['brooklyn', '海伦娜号'], ['nc', '华盛顿号']].map(([k, n], i) => { const s = ship(k, 'US', n, BX + f.x * offs[i], BZ + f.z * offs[i], hd, 0.6, 6); s.maxV = v; s.speed = v; return s; });
      const tags = [['驱逐舰', '114 m'], ['轻巡洋舰', '185 m'], ['战列舰', '222 m']];
      R.lineupShips = ships3;
      return R.shot('lineup', 6, {
        warm: 5,
        cam: t => {
          const mid = W(ships3[1], 0, 0, -50), out = dirXZ(hd - Math.PI / 2);
          look(mid.clone().add(out.multiplyScalar(lerp(610, 570, ease(t / 6)))).add(V(0, 30, 0)), mid.clone().add(V(0, 14, 0)), 34);
        },
        paint: (g, t) => {
          const a = Math.min(1, Math.max(0, (t - 0.6) / 0.6)); if (!a) return;
          g.save(); g.globalAlpha = a; g.textAlign = 'center';
          ships3.forEach((s, i) => {
            const p = W(s, 0, s.spec.top + 18, 0).project(cam), x = (p.x + 1) / 2 * R.w, y = (1 - p.y) / 2 * R.h;
            g.font = '700 30px "Noto Sans SC",sans-serif'; g.fillStyle = '#f0b54a'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 10; g.fillText(tags[i][0], x, y - 26);
            g.font = '600 22px "IBM Plex Mono",monospace'; g.fillStyle = '#ebe3cd'; g.fillText(s.name + ' · ' + tags[i][1], x, y + 6);
            g.shadowBlur = 0; g.strokeStyle = 'rgba(240,181,74,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + 18); g.lineTo(x, y + 44); g.stroke();
          });
          g.restore();
        },
      });
    },
    // close orbits on the procedural detail
    detail: (key, name, lx, ly, lz, dist, az0, az1, el = 0.12, fov = 38) => {
      scene(); const s = ship(key, key === 'kongo' || key === 'takao' ? 'JP' : 'US', key, BX, BZ, SUN + Math.PI / 2 + 0.3, 0.15, 3);
      return R.shot(name, 2.6, {
        warm: 2,
        cam: t => {
          const tg = W(s, lx, ly, lz), a = s.heading + lerp(az0, az1, ease(t / 2.6));
          look(tg.clone().add(dirXZ(a).multiplyScalar(dist * Math.cos(el))).add(V(0, dist * Math.sin(el), 0)), tg, fov);
        },
      });
    },
    // the gun duel: Washington vs Kirishima, chase camera behind Washington looking at the enemy
    duel: async () => {
      scene();
      const nc = ship('nc', 'US', '华盛顿号', BX, BZ, 0.05, 0.6, 5), ki = ship('kongo', 'JP', '雾岛', BX - 6200, BZ + 900, 0.1, 0.6, 5);
      G.player = nc; nc.isPlayer = false; R.duel = { nc, ki };
      aimAt(nc, ki.x, ki.z); aimAt(ki, nc.x, nc.z);
      const label = (g, s) => {
        const p = W(s, 0, s.spec.top + 30, 0).project(cam); if (p.z > 1) return;
        const x = (p.x + 1) / 2 * R.w, y = (1 - p.y) / 2 * R.h, d = Math.hypot(s.x - nc.x, s.z - nc.z);
        g.textAlign = 'center'; g.font = '700 22px "Noto Sans SC",sans-serif'; g.fillStyle = s.alive ? '#ef5a40' : '#8a8578'; g.fillText(s.name, x, y - 18);
        g.font = '600 17px "IBM Plex Mono",monospace'; g.fillStyle = 'rgba(235,227,205,.8)'; g.fillText('战列 · ' + (d / 1000).toFixed(1) + ' km', x, y + 22);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x - 50, y - 9, 100, 8); g.fillStyle = '#ef5a40'; g.fillRect(x - 50, y - 9, 100 * s.hp / s.maxHp, 8);
        if (s.fires.length) { g.fillStyle = '#ffb04a'; g.font = '700 20px "Noto Sans SC",sans-serif'; g.fillText('火'.repeat(s.fires.length), x + 72, y); }
      };
      const chase = (t, dt) => {
        const to = Math.atan2(ki.x - nc.x, ki.z - nc.z), f = dirXZ(to), d = Math.hypot(ki.x - nc.x, ki.z - nc.z);
        look(W(nc, 0, 0, 0).add(f.clone().multiplyScalar(-430)).add(V(0, 120, 0)), V(nc.x + f.x * d * 0.62, 0, nc.z + f.z * d * 0.62), 40);
      };
      const fire = t => {
        aimAt(nc, ...lead(nc, ki)); aimAt(ki, ...lead(ki, nc));
        for (const at of [0.7, 2.9, 5.1]) if (Math.abs(t - at) < 1e-6) { const [x, z] = lead(nc, ki); salvo(nc, x, z, 6); }
        for (const at of [1.6, 4.3]) if (Math.abs(t - at) < 1e-6) { const [x, z] = lead(ki, nc); salvo(ki, x, z, 25); }
      };
      const r1 = await R.shot('duel', 6.2, { warm: 5, tick: fire, cam: chase, paint: g => label(g, ki) });
      // keep the same battle going, now from beside Kirishima as the shells arrive
      const r2 = await R.shot('impact', 5.5, {
        tick: t => fire(t + 6.2),
        cam: t => { const tg = W(ki, 0, 10, 0), a = SUN + 0.25 + Math.PI + lerp(-0.12, 0.12, ease(t / 5.5)); look(tg.clone().add(dirXZ(a).multiplyScalar(-520)).add(V(0, 40, 0)), tg, 36); },
      });
      return [r1, r2];
    },
    // Kirishima, battered, goes down
    sink: () => {
      const { nc, ki } = R.duel;
      return R.shot('sink', 6, {
        tick: t => { if (Math.abs(t - 0.6) < 1e-6) { ki.damage(ki.hp + 10, nc, 'shell'); const [bx, bz] = ki.toWorld(0, -40); I.FX.explosion(bx, ki.spec.F + 6, bz, 1.5); I.Sfx.boom(2.4, bx, bz); } },
        cam: t => { const tg = V(ki.x, 4, ki.z), a = SUN + Math.PI + 0.6 + t * 0.03; look(tg.clone().add(dirXZ(a).multiplyScalar(-lerp(300, 340, ease(t / 6)))).add(V(0, lerp(22, 40, ease(t / 6)), 0)), tg.clone().add(V(0, lerp(10, 3, t / 6), 0)), 36); },
      });
    },
    // a destroyer's torpedo spread, then the hit
    torp: async () => {
      scene();
      const fl = ship('fletcher', 'US', '弗莱彻号', BX, BZ, SUN + Math.PI / 2, 0.7, 5), ao = ship('aoba', 'JP', '青叶', BX - 1500, BZ + 260, SUN + Math.PI / 2 + 0.2, 0.55, 4);
      G.player = fl;
      let fired = false;
      const r1 = await R.shot('torp1', 2.8, {
        warm: 3,
        tick: t => { if (!fired && t >= 0.5) { fired = true; const ic = I.intercept(fl.x, fl.z, ao.x, ao.z, ao.vx, ao.vz, fl.torp.speed); fl.torpReady = fl.torpReady.map(() => 0); I.launchFan(fl, ic ? ic.h : Math.atan2(ao.x - fl.x, ao.z - fl.z)); } },
        cam: t => { const tg = W(fl, 0, 4, -8), a = fl.heading - Math.PI / 2 - 0.55; look(tg.clone().add(dirXZ(a).multiplyScalar(lerp(62, 80, ease(t / 2.8)))).add(V(0, 16, 0)), W(fl, 0, 2, -10), 42); },
      });
      // fast-forward until the lead fish is ~180 m out
      const tq = () => I.torps.filter(t => t.alive);
      for (let i = 0; i < 60 * 40 && tq().length && Math.min(...tq().map(t => Math.hypot(t.x - ao.x, t.z - ao.z))) > 150; i++) I.step(1 / 60, true);
      const r2 = await R.shot('torp2', 5, {
        cam: t => { const tg = V(ao.x, 4, ao.z), back = Math.atan2(fl.x - ao.x, fl.z - ao.z) + 0.55; look(tg.clone().add(dirXZ(back).multiplyScalar(340)).add(V(0, 9, 0)), tg.clone().add(V(0, 6, 0)), 40); },
      });
      return [r1, r2];
    },
    // sailing off into the sunset
    outro: () => {
      scene(); const s = ship('nc', 'US', '华盛顿号', BX, BZ, SUN + 0.15, 0.6, 5);
      return R.shot('outro', 7, {
        warm: 5,
        cam: t => { const k = ease(t / 7), tg = W(s, 0, 8, 30); look(W(s, 0, 0, 0).add(dirXZ(s.heading + Math.PI + 0.35).multiplyScalar(lerp(260, 620, k))).add(V(0, lerp(20, 140, k), 0)), tg.clone().add(dirXZ(s.heading).multiplyScalar(lerp(0, 600, k))), 42); },
      });
    },
  };
  function lerp(a, b, t) { return a + (b - a) * t; }
  R.run = async name => {
    const t0 = performance.now();
    const r = name === 'details' ? [
      await SHOTS.detail('takao', 'd_takao', 0, 14, 30, 78, 1.2, 0.75),
      await SHOTS.detail('kongo', 'd_kongo', 0, 20, 38, 95, 1.3, 0.85, 0.16),
      await SHOTS.detail('brooklyn', 'd_brooklyn', 0, 3, -80, 52, 2.45, 2.05, 0.5),
      await SHOTS.detail('fletcher', 'd_fletcher', 0, 4, 2, 52, 1.0, 1.45, 0.3),
    ] : await SHOTS[name]();
    return { r, sec: Math.round((performance.now() - t0) / 1000) };
  };
})();
