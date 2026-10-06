window.__err = []; window.addEventListener('error', e => window.__err.push(e.message + ' @' + e.lineno));
(function () {
  const I = window.__ibs, G = I.G, aim = I.aim;
  function bot(skill) {
    let cd = 0;
    return () => {
      const P = G.player; if (!P || !P.alive) return;
      const foes = I.ships.filter(s => s.team === 'JP' && s.alive);
      let desired = P.heading + Math.sin(G.time * 0.08) * 0.5;
      if (foes.length) {
        foes.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
        const T = foes[0], d = Math.hypot(T.x - P.x, T.z - P.z), b = Math.atan2(T.x - P.x, T.z - P.z);
        desired = d > P.spec.prefRange ? b + 0.5 : b + 1.4;
        if (P.torp && P.torpReady.some(v => v <= 0) && d < P.torp.range * 0.7) {
          const ic = I.intercept(P.x, P.z, T.x, T.z, T.vx, T.vz, P.torp.speed);
          if (ic) { const rel = Math.abs(I.angDiff(P.heading, ic.h)); if (rel > 0.5 && rel < 2.6) { aim.yaw = ic.h; G.weapon = 'torps'; G.fireReq = true; I.advance(1 / 30, null); } }
        }
        G.weapon = 'guns';
        const [lx, lz] = I.leadPoint(P.x, P.z, T, P.gun);
        const e = skill === 'good' ? 0.01 : 0.03;
        aim.yaw = Math.atan2(lx - P.x, lz - P.z) + (Math.random() - 0.5) * e;
        aim.range = Math.hypot(lx - P.x, lz - P.z) * (1 + (Math.random() - 0.5) * e * 4);
        cd -= 1 / 30; if (cd <= 0 && d < P.gun.range) { G.fireReq = true; cd = 0.5; }
      }
      for (const t of I.torps) {
        if (t.team === P.team || !I.torpVisible(t)) continue;
        if (Math.hypot(P.x - t.x, P.z - t.z) < 1400) { desired = Math.abs(I.angDiff(P.heading, t.h)) < Math.PI / 2 ? t.h : t.h + Math.PI; break; }
      }
      if (Math.hypot(P.x, P.z) > 5500) desired = Math.atan2(-P.x, -P.z);
      if (I.terrainH) { const clear = h => [300, 600, 900].every(d => I.terrainH(P.x + Math.sin(h) * d, P.z + Math.cos(h) * d) < -12); if (!clear(desired)) { for (let k = 1; k < 8; k++) { if (clear(desired + k * 0.4)) { desired += k * 0.4; break; } if (clear(desired - k * 0.4)) { desired -= k * 0.4; break; } } } }
      P.rudderCmd = Math.max(-1, Math.min(1, I.angDiff(P.heading, desired) * 2));
      if (P.fires.length >= 2 || (P.fires.length && P.hp < P.maxHp * 0.4)) P.useDC();
    };
  }
  window.__botFn = bot;
  window.__run = (key, diff, skill = 'good', maxT = 900) => {
    G.shipKey = key; G.diff = diff; I.startGame();
    const P0 = G.player, byKind = {}, orig = P0.damage.bind(P0);
    P0.damage = (a, src, kind) => { const r = orig(a, src, kind); byKind[kind] = (byKind[kind] || 0) + r; return r; };
    const b = bot(skill), log = [];
    for (let k = 0; k < maxT / 20; k++) {
      I.advance(20, b);
      log.push([Math.round(G.time), G.wave, Math.round(G.player.hp / G.player.maxHp * 100), I.ships.filter(s => s.team === 'JP' && s.alive).length, I.ships.filter(s => s.team === 'US' && s.alive).length]);
      if (G.mode !== 'play' || G.endT > 0) break;
    }
    return { key, diff, result: G.result, log: log.map(l => l.join('/')).join(' '), byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, Math.round(v)])), kills: G.stats.kills.map(k => k.name).join(','), hits: G.stats.ship.hits + '/' + G.stats.ship.shots, th: G.stats.ship.torpHits + '/' + G.stats.ship.torps, lost: G.stats.lost.join(',') };
  };
})();
