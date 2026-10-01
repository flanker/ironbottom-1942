// Gameplay footage with the real HUD. The HUD is HTML, so each frame it is repainted onto the capture canvas from the
// live DOM: backgrounds, borders, text runs (in their computed fonts) and embedded canvases (minimap, telegraph), at
// their laid-out positions. CSS animations are paused and stepped with sim time so banners play at the right speed.
// A scripted pilot flies the player: holds the target off the beam, leads it, fires when turrets bear.
(function () {
  const R = window.__rec, I = window.__ibs, G = I.G;
  const clear = c => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);

  function text(g, node, cs, a) {
    const t = node.textContent.replace(/\s+/g, ' ').trim(); if (!t) return;
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(r => r.width > 0); if (!rects.length) return;
    g.save(); g.globalAlpha = a;
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    g.fillStyle = cs.color; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const sh = cs.textShadow !== 'none' && cs.textShadow.match(/(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
    if (sh) { g.shadowColor = sh[1]; g.shadowOffsetX = +sh[2]; g.shadowOffsetY = +sh[3]; g.shadowBlur = +sh[4]; }
    const m = g.measureText('国Ag'), asc = m.fontBoundingBoxAscent, des = m.fontBoundingBoxDescent;
    if (rects.length === 1) { const r = rects[0]; g.fillText(t, r.left, r.top + (r.height - asc - des) / 2 + asc); }
    else {
      // wrapped: hand each line box the characters that fit it
      let rest = t;
      for (const r of rects) {
        let n = rest.length; while (n > 1 && g.measureText(rest.slice(0, n)).width > r.width + 2) n--;
        g.fillText(rest.slice(0, n), r.left, r.top + (r.height - asc - des) / 2 + asc); rest = rest.slice(n).trimStart(); if (!rest) break;
      }
    }
    g.restore();
  }
  function box(g, el, cs, r, a) {
    g.save(); g.globalAlpha = a;
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    if (!clear(cs.backgroundColor)) { g.fillStyle = cs.backgroundColor; g.beginPath(); g.roundRect(r.left, r.top, r.width, r.height, Math.min(rad, r.height / 2)); g.fill(); }
    for (const [side, x, y, w, h] of [['Top', r.left, r.top, r.width, 0], ['Bottom', r.left, r.bottom, r.width, 0], ['Left', r.left, r.top, 0, r.height], ['Right', r.right, r.top, 0, r.height]]) {
      const bw = parseFloat(cs['border' + side + 'Width']); if (!bw || cs['border' + side + 'Style'] === 'none' || clear(cs['border' + side + 'Color'])) continue;
      g.fillStyle = cs['border' + side + 'Color'];
      g.fillRect(side === 'Right' ? x - bw : x, side === 'Bottom' ? y - bw : y, w || bw, h || bw);
    }
    const ol = parseFloat(cs.outlineWidth); if (ol && cs.outlineStyle !== 'none' && !clear(cs.outlineColor)) { g.strokeStyle = cs.outlineColor; g.lineWidth = ol; g.strokeRect(r.left - ol / 2, r.top - ol / 2, r.width + ol, r.height + ol); }
    if (el.tagName === 'CANVAS' && r.width && r.height) g.drawImage(el, r.left, r.top, r.width, r.height);
    g.restore();
  }
  R.paintDOM = (g, root) => {
    const walk = (el, alpha) => {
      if (el.hidden) return;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const a = alpha * parseFloat(cs.opacity); if (a < 0.01) return;
      const r = el.getBoundingClientRect();
      if (r.width || r.height) box(g, el, cs, r, a);
      for (const n of el.childNodes) { if (n.nodeType === 3) text(g, n, cs, a); else if (n.nodeType === 1) walk(n, a); }
    };
    walk(root, 1);
  };
  // CSS animations follow sim time, not the wall clock
  R.stepAnims = dt => { for (const an of document.getAnimations()) { if (an.playState !== 'paused') an.pause(); an.currentTime = (an.currentTime || 0) + dt * 1000; } };
  R.hudPaint = (g, dt) => {
    R.stepAnims(dt);
    I.drawOverlay(); g.drawImage(I.ov, 0, 0, R.w, R.h);
    I.drawMini();
    R.paintDOM(g, document.getElementById('hud'));
  };

  // ---- the pilot
  const K = I.keys, aim = I.aim;
  const foes = () => I.ships.filter(s => s.team === 'JP' && s.alive);
  const nearest = P => foes().reduce((a, b) => !a || Math.hypot(b.x - P.x, b.z - P.z) < Math.hypot(a.x - P.x, a.z - P.z) ? b : a, null);
  const wrap = a => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
  R.pilot = (o = {}) => {
    // pointer-lock prompts mean nothing on video
    const h = document.getElementById('hint'); if (h.textContent.includes('鼠标')) h.classList.remove('on');
    document.getElementById('lockHint').hidden = true;
    const P = G.player; if (!P || !P.alive) return;
    const T = o.target && o.target.alive ? o.target : nearest(P); if (!T) return;
    const brg = Math.atan2(T.x - P.x, T.z - P.z), side = o.side || 1;
    // steer so the target sits ~70° off the bow on the chosen side
    const want = wrap(brg - side * (o.off || 1.2)), err = wrap(want - P.heading);
    K.KeyA = err > 0.06; K.KeyD = err < -0.06;   // A raises the heading
    if (G.weapon === 'torps' && P.torp) {
      const ic = I.intercept(P.x, P.z, T.x, T.z, T.vx, T.vz, P.torp.speed);
      if (ic) { aim.yaw = ic.h; aim.range = Math.hypot(ic.x - P.x, ic.z - P.z); }
      if (o.launch && P.torpReady.some(v => v <= 0)) G.fireReq = true;
    } else {
      const [lx, lz] = I.leadPoint(P.x, P.z, T, P.gun);
      const yaw = Math.atan2(lx - P.x, lz - P.z), rng = Math.hypot(lx - P.x, lz - P.z);
      aim.yaw += wrap(yaw - aim.yaw) * (o.smooth || 0.15); aim.range += (rng - aim.range) * 0.15;
      if (o.fire !== false && P.mainTurrets.some(t => t.reload <= 0 && t.onTarget)) G.fireReq = true;
    }
  };
  // run the sim without capturing, sounds swallowed, until done(t) or max seconds
  R.ff = (max, done, tick) => {
    const S = I.Sfx, keep = {}; for (const k of ['gun', 'hit', 'splash', 'incoming', 'flyby', 'torpHit', 'boom', 'launch', 'alarm']) { keep[k] = S[k]; S[k] = () => {}; }
    let t = 0; const dt = 1 / R.fps;
    for (; t < max; t += dt) { tick && tick(t); I.step(dt, true); I.updateCamera(dt); if (done && done(t)) break; }
    Object.assign(S, keep); return t;
  };
  function newGame(key, wave) {
    I.clearWorld(); G.shipKey = key; G.diff = 'captain'; I.startGame();
    document.getElementById('lockHint').hidden = true;
    I.forceSize(R.w, R.h); R.setup && (I.camera.fov = 55, I.camera.updateProjectionMatrix());
    G.wave = wave; G.nextWaveT = 0.05; G.lead = true; G.camZoom = 0.8;
  }

  R.GAMES = {
    // Washington against the third wave: the opening banner, a gun duel with lead markers, a spell on the binoculars
    nc: async () => {
      newGame('nc', 2);
      const out = [];
      // the wave arrives: banner over the fleet
      out.push(await R.shot('g_start', 4, { hud: true, tick: () => R.pilot({ fire: false, side: -1 }), cam: (t, dt) => I.updateCamera(dt) }));
      R.ff(120, () => { const P = G.player, T = nearest(P); return T && Math.hypot(T.x - P.x, T.z - P.z) < 6800; }, () => R.pilot({ fire: false, side: -1 }));
      G.camZoom = 0.72;
      out.push(await R.shot('g_nc', 26, {
        hud: true,
        tick: t => { G.zoomToggle = t > 8 && t < 15; R.pilot({ side: -1, smooth: G.zoomToggle ? 0.08 : 0.15 }); },
        cam: (t, dt) => I.updateCamera(dt),
      }));
      return out;
    },
    // Fletcher against the first wave: torpedoes out, then the guns
    dd: async () => {
      newGame('fletcher', 0);
      R.ff(120, () => { const P = G.player, T = nearest(P); return T && Math.hypot(T.x - P.x, T.z - P.z) < 4300; }, () => R.pilot({ fire: false, side: 1 }));
      I.setWeapon('torps');
      let n = 0;
      return [await R.shot('g_dd', 26, {
        hud: true,
        tick: t => {
          if (G.weapon === 'torps' && t > 1 && G.player.torpReady.every(v => v > 0) && ++n > 30) I.setWeapon('guns');
          R.pilot({ side: 1, launch: t > 1.2 });
        },
        cam: (t, dt) => I.updateCamera(dt),
      })];
    },
  };
  R.game = async name => { const t0 = performance.now(); const r = await R.GAMES[name](); return { r, sec: Math.round((performance.now() - t0) / 1000) }; };
})();
