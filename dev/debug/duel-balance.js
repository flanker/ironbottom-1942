// Duel balance in Node: both flagships are handed to the AI and every pairing of a class is fought out headless.
//   node dev/debug/duel-balance.js [runs per pairing] [class] [escorts]
//   node dev/debug/duel-balance.js 40 CA 2
// Prints the US win rate per pairing, with draws, average length and how much of each flagship was left.
const S = require('../../sim.js');
const runs = +(process.argv[2] || 30), only = process.argv[3], escorts = process.argv[4] != null ? +process.argv[4] : 2;

function duel(cls, us, jp) {
  const w = new S.World({ mode: 'duel' });
  const caps = S.setupDuel(w, { cls, US: us, JP: jp, escorts });
  for (const t of ['US', 'JP']) { const P = caps[t]; P.ai = new S.AI(P); }
  let res = null;
  while (!res) { w.step(1 / 30, true); res = S.duelResult(w); }
  return { res, t: w.time, us: caps.US.hp / caps.US.maxHp, jp: caps.JP.hp / caps.JP.maxHp };
}

for (const cls of Object.keys(S.DUEL.classes)) {
  if (only && cls !== only) continue;
  for (const [us] of S.duelRoster('US', cls)) for (const [jp] of S.duelRoster('JP', cls)) {
    let usWin = 0, draw = 0, T = 0, hu = 0, hj = 0;
    for (let i = 0; i < runs; i++) {
      const r = duel(cls, us, jp);
      if (r.res === 'US') usWin++; else if (r.res === 'draw') draw++;
      T += r.t; hu += r.us; hj += r.jp;
    }
    console.log(`${cls} ${us} vs ${jp}: US ${(usWin / runs * 100).toFixed(0)}%  draw ${draw}  avg ${(T / runs).toFixed(0)} s  hp left US ${(hu / runs * 100).toFixed(0)}% JP ${(hj / runs * 100).toFixed(0)}%`);
  }
}
