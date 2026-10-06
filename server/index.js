// Ironbottom Sound duel server: serves the game's static files and runs the 1v1 rooms over a WebSocket (/ws).
//   npm start                → http://localhost:8080
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { Room } = require('./room.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const ROOM_IDLE_MS = 10 * 60 * 1000;   // a room nobody has been online in for 10 minutes is closed
const MAX_ROOMS = 2000;
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const ALLOWED = [/^\/index\.html$/, /^\/sim\.js$/, /^\/sfx\/[\w.-]+\.mp3$/, /^\/favicon(-32)?\.(svg|png)$/, /^\/apple-touch-icon\.png$/];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (p === '/api/stats') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ rooms: rooms.size, playing: [...rooms.values()].filter(r => r.phase === 'playing').length, clients: wss.clients.size }));
    return;
  }
  if (p === '/') p = '/index.html';
  if (!ALLOWED.some(re => re.test(p))) { res.writeHead(404); res.end('not found'); return; }
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' || p === '/sim.js' ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(data);
  });
});

// ---------- rooms
const rooms = new Map();
function newCode() {
  for (let k = 0; k < 200; k++) {
    const c = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (!rooms.has(c)) return c;
  }
  return null;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024, perMessageDeflate: { threshold: 512 } });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.msgCount = 0; ws.msgWindow = Date.now();
  const err = (msg, extra) => ws.send(JSON.stringify(Object.assign({ t: 'err', msg }, extra)));
  ws.on('message', raw => {
    // a little flood control: at most 60 messages a second
    const now = Date.now();
    if (now - ws.msgWindow > 1000) { ws.msgWindow = now; ws.msgCount = 0; }
    if (++ws.msgCount > 60) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const ref = ws.seatRef;
    switch (m.t) {
      case 'ping': ws.send(JSON.stringify({ t: 'pong', c: m.c })); return;
      case 'create': {
        if (ref) ref.room.leave(ref.room.sideOf(ref.token));
        if (rooms.size >= MAX_ROOMS) { err('服务器房间已满，请稍后再试'); return; }
        const code = newCode();
        if (!code) { err('暂时无法创建房间，请重试'); return; }
        const room = new Room(code, log);
        rooms.set(code, room);
        room.join(ws);
        log(`room ${code} created (${rooms.size} rooms)`);
        return;
      }
      case 'join': {
        const room = rooms.get(String(m.code || ''));
        if (!room) { err('房间不存在，检查一下房间号', { gone: true }); return; }
        if (ref && ref.room === room) return;
        if (ref) ref.room.leave(ref.room.sideOf(ref.token));
        if (!room.join(ws)) err('房间已满');
        return;
      }
      case 'rejoin': {
        const room = rooms.get(String(m.code || ''));
        if (!room || !room.rejoin(ws, String(m.token || ''))) err('房间已关闭', { gone: true });
        return;
      }
      case 'leave':
        if (ref) { const side = ref.room.sideOf(ref.token); if (side) ref.room.leave(side); ws.seatRef = null; }
        return;
      default:
        if (ref) ref.room.onMessage(ref.token, m);
    }
  });
  ws.on('close', () => {
    const ref = ws.seatRef;
    if (!ref) return;
    const side = ref.room.sideOf(ref.token);
    if (side && ref.room.seats[side].ws === ws) ref.room.disconnected(side);
  });
});

// heartbeats; sweep empty and idle rooms
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* closing */ }
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.phase !== 'playing') room.sweep();
    if (room.empty || (!room.online && now - room.lastActive > ROOM_IDLE_MS)) { room.dispose(); rooms.delete(code); log(`room ${code} closed (${rooms.size} rooms)`); }
  }
}, 10000);

server.listen(PORT, () => log(`ironbottom duel server on :${PORT}`));
