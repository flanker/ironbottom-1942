(function () {
  const I = window.__ibs, G = I.G, q = new URLSearchParams(location.search);
  const keys = Object.keys(I.SPECS);
  const V = { k: q.get('ship') || 'fletcher', a: +(q.get('a') || 40), e: +(q.get('e') || 12), d: +(q.get('d') || 1.3), lz: +(q.get('lz') || 0), s: null };
  function spawn() {
    I.clearWorld();
    V.s = new I.Ship(V.k, I.SPECS[V.k].nation === 'US' ? 'US' : 'JP', V.k, { x: 0, z: 0, heading: 0, speedFrac: 0 });
    V.s.throttle = 2; I.ships.push(V.s);
  }
  function cam() {
    const s = V.s, L = s.spec.L, a = V.a * Math.PI / 180, e = V.e * Math.PI / 180, R = L * V.d;
    s.x = 0; s.z = 0; s.speed = 0; s.heading = 0;
    const lz = V.lz * L / 2;
    I.camera.position.set(Math.sin(a) * Math.cos(e) * R, Math.sin(e) * R + 4, lz + Math.cos(a) * Math.cos(e) * R);
    I.camera.lookAt(0, s.spec.F + s.spec.top * 0.3, lz);
    requestAnimationFrame(cam);
  }
  window.__view = (o) => { if (o.ship && o.ship !== V.k) { V.k = o.ship; spawn(); } Object.assign(V, o); };
  setTimeout(() => {
    G.mode = 'viewer'; I.showScreen(null);
    spawn(); cam();
    addEventListener('keydown', ev => {
      if (ev.key === 'ArrowLeft') V.a -= 10; if (ev.key === 'ArrowRight') V.a += 10;
      if (ev.key === 'ArrowUp') V.e = Math.min(85, V.e + 5); if (ev.key === 'ArrowDown') V.e = Math.max(-2, V.e - 5);
      if (ev.key === '+' || ev.key === '=') V.d *= 0.85; if (ev.key === '-') V.d /= 0.85;
      if (ev.key === ']' || ev.key === '[') { V.k = keys[(keys.indexOf(V.k) + (ev.key === ']' ? 1 : keys.length - 1)) % keys.length]; spawn(); }
    });
  }, 300);
})();
