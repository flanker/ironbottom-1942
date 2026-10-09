// Promo footage of the online duel, step 1: play a whole room through the real server code (server/room.js) in Node and
// keep every message each captain's page is sent, with its time. dev/record/record-duel.js later replays a side's messages into
// the unmodified page through a fake WebSocket, frame by frame.
//   node dev/record/duel-stream.js <scenario> <seed> [out.json]     one run, written out
//   node dev/record/duel-stream.js <scenario> scan <n>               n seeds, one summary line each, to pick a good battle
// Both captains are flown by the game's own AI; a scenario may nudge them (closer ranges for a knife fight).
const S = require('../../sim.js');
const { Room } = require('../../server/room.js');
const fs = require('node:fs');

const TICK = 1 / 30, LAT = 0.04;   // the server's step; one-way latency the pages see
const CODE = '1942';

// Lobby choreography in session seconds; the recorder clicks the same buttons at the same moments.
// host: the US captain creates the room; guest: the Japanese captain joins it.
const SCENARIOS = {
  BB: { cls: 'BB', US: 'nc', JP: 'kongo', escorts: 0, lobby: { create: 16.4, join: 26.7, cls: 34.1, esc: 53.6, readyUS: 57.1, readyJP: 58.1 } },
  DD: { cls: 'DD', US: 'fletcher', JP: 'shiratsuyu', escorts: 0, pref: { fletcher: 1900, shiratsuyu: 1900 }, lobby: { create: 0.3, join: 0.6, cls: 1.5, esc: 2.3, pickJP: 3.2, readyUS: 4.0, readyJP: 4.6 } },
  CA: { cls: 'CA', US: 'neworleans', JP: 'aoba', escorts: 2, pref: { neworleans: 4200, aoba: 4000 }, lobby: { create: 0.3, join: 0.6, cls: 1.5, readyUS: 3.0, readyJP: 3.6 } },
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function run(name, seed, { keep = true, maxBattle = 600 } = {}) {
  const sc = SCENARIOS[name], L = sc.lobby;
  const realRandom = Math.random; Math.random = mulberry(seed);
  const prefs = {};
  for (const [k, v] of Object.entries(sc.pref || {})) { prefs[k] = S.SPECS[k].prefRange; S.SPECS[k].prefRange = v; }
  let now = 0;
  const out = { US: [], JP: [] }, xme = { US: [], JP: [] }, events = [];
  const ws = side => ({ readyState: 1, send: m => { if (keep || /"t":"(over|start)"/.test(m)) out[side].push([+(now + LAT).toFixed(4), m]); } });
  const room = new Room(CODE, () => {});
  room.startCountdown = function () { this.phase = 'countdown'; this.countdown = 3; this.broadcastLobby(); cd = now; };
  let cd = -1;
  const tok = {};
  // the lobby, step by step
  const acts = [
    [L.create, () => { room.join(ws('US')); tok.US = room.seats.US.token; }],
    [L.join, () => { room.join(ws('JP')); tok.JP = room.seats.JP.token; }],
    [L.cls, () => room.onMessage(tok.US, { t: 'cls', v: sc.cls })],
    L.esc != null && [L.esc, () => room.onMessage(tok.US, { t: 'esc', v: sc.escorts })],
    L.pickJP != null && [L.pickJP, () => room.onMessage(tok.JP, { t: 'pick', key: sc.JP })],
    [L.readyUS, () => room.onMessage(tok.US, { t: 'ready', v: true })],
    [L.readyJP, () => room.onMessage(tok.JP, { t: 'ready', v: true })],
  ].filter(Boolean).sort((a, b) => a[0] - b[0]);
  for (const [t, f] of acts) { now = t; f(); }
  if (sc.escorts !== room.escorts) throw new Error('escorts');
  // the countdown, then the battle at 30 Hz
  for (let k = 1; k <= 2; k++) { now = cd + k; room.countdown--; room.broadcastLobby(); }
  now = cd + 3;
  const si = global.setInterval; global.setInterval = () => 0; room.startGame(); global.setInterval = si;
  const t0 = now, W = room.world, caps = room.caps;
  for (const t of ['US', 'JP']) { caps[t].ai = new S.AI(caps[t]); }
  const onEv = room.onEvent.bind(room);
  room.onEvent = e => { onEv(e); if (['hit', 'torpHit', 'sunk', 'launch', 'dc'].includes(e.k)) events.push(Object.assign({ bt: +W.time.toFixed(2), st: +(t0 + W.time).toFixed(2) }, e)); };
  W.onEvent = room.onEvent;
  let launchT = { US: -9, JP: -9 };
  for (let i = 0; room.world && i < maxBattle * 30 + 400; i++) {
    room.tick();
    now = t0 + (W.time);
    for (const e of events.slice(-6)) if (e.k === 'launch') for (const t of ['US', 'JP']) if (e.id === caps[t].id) launchT[t] = e.bt;
    if (keep && room.ticks % 2 === 0) for (const t of ['US', 'JP']) {
      const P = caps[t], T = P.ai && P.ai.target;
      xme[t].push([+(now + LAT).toFixed(4), { lock: T && T.alive ? T.id : 0, th: P.throttle, rc: +P.rudderCmd.toFixed(2), torp: W.time - launchT[t] < 1.2 ? 1 : 0, ax: Math.round(P.aimX), az: Math.round(P.aimZ) }]);
    }
  }
  const res = room.result || {};
  Math.random = realRandom;
  for (const [k, v] of Object.entries(prefs)) S.SPECS[k].prefRange = v;
  const id2 = id => { for (const t of ['US', 'JP']) if (caps[t].id === id) return t; return id; };
  return { scenario: name, seed, code: CODE, picks: room.picks, start: t0, end: now, result: res, caps: { US: caps.US.id, JP: caps.JP.id }, events: events.map(e => Object.assign(e, { who: id2(e.id), by: e.o != null ? id2(e.o) : e.killer != null ? id2(e.killer) : undefined })), US: out.US, JP: out.JP, xme };
}

function summary(r) {
  const ev = r.events, cap = r.caps;
  const hits = side => ev.filter(e => e.k === 'hit' && e.o === cap[side] && e.id === cap[side === 'US' ? 'JP' : 'US']).length;
  const sunk = ev.filter(e => e.k === 'sunk').map(e => `${e.who}@${e.bt.toFixed(0)}`).join(',');
  const th = ev.filter(e => e.k === 'torpHit').map(e => `${e.who}@${e.bt.toFixed(0)}`).join(',');
  return `seed ${r.seed}: ${r.result.winner} (${r.result.why}) ${(r.end - r.start).toFixed(0)} s · cap hits US→JP ${hits('US')} JP→US ${hits('JP')} · sunk ${sunk || '-'} · torp hits ${th || '-'}`;
}

if (require.main === module) {
  const [name, a, b] = process.argv.slice(2);
  if (a === 'scan') { for (let s = 1; s <= +(b || 20); s++) console.log(summary(run(name, s, { keep: false }))); }
  else {
    const r = run(name, +a);
    console.log(summary(r));
    if (b) fs.writeFileSync(b, JSON.stringify(r));
  }
}
module.exports = { run, summary, SCENARIOS };
