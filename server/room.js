// A duel room: two seats, the US and the Japanese side. In the lobby each captain picks a ship of the class the host chose;
// when both are ready the battle runs here (sim.js at 30 Hz) and each side gets a snapshot of it 15 times a second.
const crypto = require('node:crypto');
const S = require('../sim.js');

const TICK = 1 / 30;
const SNAP_EVERY = 2;              // ticks per snapshot
const RECONNECT_GRACE = 60;        // seconds a captain may be gone mid-battle before the battle is forfeit
const LOBBY_GRACE = 90;            // seconds a disconnected captain keeps the seat in the lobby
const AFTERMATH = 7;               // seconds the battle keeps running after it is decided, so the last ship can go down
const SIDES = ['US', 'JP'];
const QUICK_CHAT = 8;

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const roundAll = (k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v;

class Room {
  constructor(code, log) {
    this.code = code; this.log = log;
    this.seats = { US: null, JP: null };
    this.host = null;               // token of the captain who chooses the class
    this.cls = 'CA'; this.escorts = 2;
    this.phase = 'lobby';           // lobby | countdown | playing
    this.world = null; this.timer = null; this.countdown = 0; this.games = 0;
    this.lastActive = Date.now();
  }
  get empty() { return !this.seats.US && !this.seats.JP; }
  get online() { return SIDES.some(t => this.seats[t] && this.seats[t].online); }
  sideOf(token) { return SIDES.find(t => this.seats[t] && this.seats[t].token === token) || null; }
  defaultPick(side) { return S.duelRoster(side, this.cls)[0][0]; }

  join(ws) {
    const side = SIDES.find(t => !this.seats[t]);
    if (!side) return null;
    const seat = this.seats[side] = { token: crypto.randomBytes(12).toString('hex'), ws: null, key: this.defaultPick(side), ready: false, online: true, offSince: 0, lastChat: 0, input: null, fireQ: [], shipId: 0 };
    if (!this.host) this.host = seat.token;
    this.attach(side, ws);
    this.log(`room ${this.code}: ${side} joined`);
    return side;
  }
  rejoin(ws, token) {
    const side = this.sideOf(token);
    if (!side) return null;
    const s = this.seats[side];
    if (s.ws && s.ws !== ws) { s.ws.seatRef = null; try { s.ws.close(4000, 'replaced'); } catch (e) { /* gone */ } }
    s.online = true; s.offSince = 0;
    this.attach(side, ws);
    if (this.phase === 'playing') send(ws, this.startMsg(side));
    this.log(`room ${this.code}: ${side} rejoined`);
    return side;
  }
  attach(side, ws) {
    const s = this.seats[side];
    s.ws = ws; ws.seatRef = { room: this, token: s.token };
    send(ws, { t: 'room', code: this.code, side, token: s.token });
    this.broadcastLobby();
  }
  leave(side, reason = 'leave') {
    const s = this.seats[side];
    if (!s) return;
    if (s.ws) s.ws.seatRef = null;
    this.seats[side] = null;
    if (this.phase === 'playing' && !this.result) this.decide(side === 'US' ? 'JP' : 'US', reason);
    if (this.phase === 'countdown') this.phase = 'lobby';
    if (this.host === s.token) { const o = SIDES.map(t => this.seats[t]).find(Boolean); this.host = o ? o.token : null; }
    for (const t of SIDES) if (this.seats[t]) this.seats[t].ready = false;
    this.log(`room ${this.code}: ${side} left (${reason})`);
    this.broadcastLobby();
  }
  disconnected(side) {
    const s = this.seats[side];
    if (!s) return;
    s.online = false; s.offSince = Date.now(); s.ws = null;
    if (this.phase === 'countdown') { this.phase = 'lobby'; s.ready = false; }
    this.broadcastLobby();
  }
  // seats whose captain has been away too long give up their place (lobby) or the battle (playing)
  sweep() {
    const now = Date.now();
    for (const side of SIDES) {
      const s = this.seats[side];
      if (!s || s.online) continue;
      if (this.phase === 'playing') { if (!this.result && now - s.offSince > RECONNECT_GRACE * 1000) this.decide(side === 'US' ? 'JP' : 'US', 'disconnect'); }
      else if (now - s.offSince > LOBBY_GRACE * 1000) this.leave(side, 'timeout');
    }
  }

  lobbyMsg() {
    const seat = t => { const s = this.seats[t]; return s ? { key: s.key, ready: s.ready, online: s.online, host: s.token === this.host } : null; };
    return { t: 'lobby', code: this.code, phase: this.phase, cd: this.countdown, cls: this.cls, escorts: this.escorts, seats: { US: seat('US'), JP: seat('JP') } };
  }
  broadcastLobby() {
    this.lastActive = Date.now();
    const m = JSON.stringify(this.lobbyMsg());
    for (const t of SIDES) if (this.seats[t]) send(this.seats[t].ws, m);
  }
  startMsg(side) {
    return { t: 'start', side, picks: this.picks, me: this.seats[side] ? this.seats[side].shipId : 0, time: r2(this.world.time) };
  }

  onMessage(token, m) {
    const side = this.sideOf(token); if (!side) return;
    const s = this.seats[side], isHost = token === this.host, lobby = this.phase === 'lobby';
    this.lastActive = Date.now();
    switch (m.t) {
      case 'cls':
        if (!lobby || !isHost || !S.DUEL.classes[m.v]) return;
        this.cls = m.v;
        for (const t of SIDES) if (this.seats[t]) { this.seats[t].key = this.defaultPick(t); this.seats[t].ready = false; }
        this.broadcastLobby(); break;
      case 'esc':
        if (!lobby || !isHost) return;
        this.escorts = m.v ? 2 : 0;
        for (const t of SIDES) if (this.seats[t]) this.seats[t].ready = false;
        this.broadcastLobby(); break;
      case 'pick':
        if (!lobby || !S.duelRoster(side, this.cls).some(p => p[0] === m.key)) return;
        s.key = m.key; this.broadcastLobby(); break;
      case 'side': {
        const other = side === 'US' ? 'JP' : 'US';
        if (!lobby || this.seats[other]) return;
        this.seats[other] = s; this.seats[side] = null;
        s.key = this.defaultPick(other); s.ready = false;
        send(s.ws, { t: 'room', code: this.code, side: other, token: s.token });
        this.broadcastLobby(); break;
      }
      case 'ready':
        if (this.phase === 'playing') return;
        s.ready = !!m.v;
        if (!s.ready && this.phase === 'countdown') this.phase = 'lobby';
        this.broadcastLobby();
        if (this.phase === 'lobby' && SIDES.every(t => this.seats[t] && this.seats[t].ready && this.seats[t].online)) this.startCountdown();
        break;
      case 'chat': {
        const now = Date.now();
        if (now - s.lastChat < 1000 || !(m.id >= 0 && m.id < QUICK_CHAT)) return;
        s.lastChat = now;
        const msg = JSON.stringify({ t: 'chat', side, id: m.id | 0 });
        for (const t of SIDES) if (this.seats[t]) send(this.seats[t].ws, msg);
        break;
      }
      case 'in':
        if (this.phase === 'playing') s.input = { th: m.th | 0, rc: +m.rc || 0, ax: +m.ax || 0, az: +m.az || 0 };
        break;
      case 'fire':
        if (this.phase === 'playing' && s.fireQ.length < 4) s.fireQ.push({ w: m.w === 'torps' ? 'torps' : 'guns', ax: +m.ax || 0, az: +m.az || 0 });
        break;
      case 'dc':
        if (this.phase === 'playing') s.fireQ.push({ dc: true });
        break;
      case 'surrender':
        if (this.phase === 'playing' && !this.result) this.decide(side === 'US' ? 'JP' : 'US', 'surrender');
        break;
      default:
    }
  }

  startCountdown() {
    this.phase = 'countdown'; this.countdown = 3;
    this.broadcastLobby();
    const tick = () => {
      if (this.phase !== 'countdown') return;
      this.countdown--;
      if (this.countdown <= 0) this.startGame();
      else { this.broadcastLobby(); setTimeout(tick, 1000); }
    };
    setTimeout(tick, 1000);
  }
  startGame() {
    this.phase = 'playing'; this.games++; this.result = null; this.events = []; this.ticks = 0; this.credits = { US: [], JP: [] };
    this.picks = { cls: this.cls, US: this.seats.US.key, JP: this.seats.JP.key, escorts: this.escorts };
    const w = this.world = new S.World({ mode: 'duel', onEvent: e => this.onEvent(e) });
    this.caps = S.setupDuel(w, this.picks);
    for (const t of SIDES) { const s = this.seats[t]; s.shipId = this.caps[t].id; s.input = null; s.fireQ = []; s.ready = false; }
    this.log(`room ${this.code}: game ${this.games} start (${this.cls}: ${this.picks.US} vs ${this.picks.JP}, escorts ${this.escorts})`);
    for (const t of SIDES) send(this.seats[t].ws, this.startMsg(t));
    this.broadcastLobby();
    this.last = performance.now(); this.acc = 0;
    this.timer = setInterval(() => this.loop(), 1000 / 60);
  }
  onEvent(e) {
    this.events.push(e);
    if (e.k === 'sunk') {
      // a sinking counts for a captain who fired the last shot or did a quarter of the damage
      const w = this.world, s = w.byId(e.id), killer = w.byId(e.killer);
      for (const t of SIDES) {
        const P = this.caps[t]; if (!s || s.team === t) continue;
        if (killer === P || (s.dmgBy.get(P) || 0) >= s.maxHp * 0.25) this.credits[t].push({ name: s.name, type: s.typeLabel, tons: s.spec.tons });
      }
    }
  }
  // fixed 30 Hz steps, however the timer jitters
  loop() {
    const now = performance.now();
    this.acc += Math.min(0.25, (now - this.last) / 1000); this.last = now;
    while (this.acc >= TICK && this.world) { this.acc -= TICK; this.tick(); }
  }
  tick() {
    const w = this.world;
    for (const t of SIDES) {
      const s = this.seats[t], P = this.caps[t];
      if (!s || !P.alive) continue;
      if (s.input) { P.throttle = Math.max(0, Math.min(6, s.input.th)); P.rudderCmd = Math.max(-1, Math.min(1, s.input.rc)); P.aimX = s.input.ax; P.aimZ = s.input.az; }
      for (const f of s.fireQ.splice(0)) { if (f.dc) S.cmdDC(w, P); else S.playerFire(w, P, f.w, f.ax, f.az); }
    }
    w.step(TICK, true);
    this.sweep();
    if (!this.result) { const r = S.duelResult(w); if (r) this.decide(r, 'battle'); }
    if (++this.ticks % SNAP_EVERY === 0) this.snapshot();
    if (this.result && w.time - this.result.at > AFTERMATH) this.stopGame();
  }
  decide(winner, why) {
    if (this.result) return;
    const w = this.world;
    this.result = { winner, why, at: w.time };
    const stats = {};
    for (const t of SIDES) { const P = this.caps[t]; stats[t] = Object.assign({ name: P.name, type: P.typeLabel, hp: Math.round(P.hp), maxHp: Math.round(P.maxHp), score: r3(S.duelScore(w, t)) }, P.stats); }
    for (const t of SIDES) for (const k in stats[t]) if (typeof stats[t][k] === 'number') stats[t][k] = Math.round(stats[t][k] * 1000) / 1000;
    this.log(`room ${this.code}: game ${this.games} over, ${winner} (${why}) at ${Math.round(w.time)} s`);
    const msg = JSON.stringify({ t: 'over', winner, why, time: r1(w.time), stats, kills: this.credits });
    for (const t of SIDES) if (this.seats[t]) send(this.seats[t].ws, msg);
  }
  snapshot() {
    const w = this.world, ev = this.events; this.events = [];
    const ships = w.ships.map(s => {
      const fl = (s.alive ? 1 : 0) | (s.removed ? 2 : 0) | (s.dc.active > 0 ? 4 : 0);
      const fires = []; for (const f of s.fires) fires.push(r1(f.lx), r1(f.lz));
      const tur = []; for (const t of s.turrets) tur.push(r3(t.rel), r3(t.elev));
      return [s.id, r1(s.x), r1(s.z), r3(s.heading), r2(s.speed), r2(s.rudder), s.throttle, Math.ceil(s.hp), fl, r2(s.sinkT), fires, tur];
    });
    const evs = JSON.stringify(ev, roundAll);
    for (const side of SIDES) {
      const seat = this.seats[side]; if (!seat || !seat.online) continue;
      const P = this.caps[side];
      const tp = w.torps.filter(t => S.torpVisible(t, side)).map(t => [t.id, r1(t.x), r1(t.z), r3(t.h), r1(t.trav), t.team === "US" ? 0 : 1, r1(t.speed), r1(t.range)]);
      const me = { tr: P.torpReady.map(r2), rl: P.turrets.map(t => r2(t.reload)), ot: P.turrets.map(t => (t.onTarget ? 1 : 0) | (t.inArc ? 2 : 0)), dc: [P.dc.charges, r2(P.dc.cd), r2(P.dc.active)], st: [P.stats.shots, P.stats.hits, P.stats.torps, P.stats.torpHits, Math.round(P.stats.dealt), Math.round(P.stats.taken)] };
      const other = this.seats[side === 'US' ? 'JP' : 'US'];
      const away = other && !other.online ? Math.max(0, Math.ceil(RECONNECT_GRACE - (Date.now() - other.offSince) / 1000)) : -1;
      send(seat.ws, `{"t":"snap","time":${r3(w.time)},"s":${JSON.stringify(ships)},"tp":${JSON.stringify(tp)},"me":${JSON.stringify(me)},"away":${away},"ev":${evs}}`);
    }
  }
  stopGame() {
    clearInterval(this.timer); this.timer = null;
    this.world = null; this.caps = null; this.phase = 'lobby';
    for (const t of SIDES) if (this.seats[t]) this.seats[t].ready = false;
    this.broadcastLobby();
  }
  dispose() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = { Room };
