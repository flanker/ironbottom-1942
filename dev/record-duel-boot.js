// Promo footage of the online duel, step 2a (runs before the page's own scripts): a virtual clock and a fake WebSocket.
// performance.now, Date.now, timers and requestAnimationFrame only move when __vc.advance(ms) is called, so every frame
// is rendered at exactly 1/fps of game time however slow the capture is. The WebSocket hands the page the messages a
// real server sent its side in dev/duel-stream.js, each at its time; what the page sends is noted and answered only
// with pongs (the lobby and the battle are already scripted).
(function () {
  const realSetTimeout = window.setTimeout.bind(window), T0 = Date.now();
  let vt = 0;
  const VC = window.__vc = { get t() { return vt; }, realSetTimeout, hooks: [] };
  performance.now = () => vt;
  Date.now = () => T0 + vt;
  let rafQ = [], rafId = 0, timers = [], tid = 1;
  window.requestAnimationFrame = cb => { rafQ.push(cb); return ++rafId; };
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (fn, ms, ...a) => { const id = tid++; timers.push({ id, at: vt + Math.max(0, +ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms, ...a) => { const id = tid++, every = Math.max(1, +ms || 0); timers.push({ id, at: vt + every, fn, a, every }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers = timers.filter(t => t.id !== id); };
  function runTimers(until) {
    for (let guard = 0; guard < 5000; guard++) {
      let best = null;
      for (const t of timers) if (t.at <= until && (!best || t.at < best.at)) best = t;
      if (!best) return;
      vt = Math.max(vt, best.at);
      if (best.every) best.at += best.every; else timers = timers.filter(t => t !== best);
      try { typeof best.fn === 'function' ? best.fn(...best.a) : (0, eval)(best.fn); } catch (e) { console.error('timer', e); }
    }
  }

  // ---- the fake server connection
  const F = window.__fake = { stream: [], i: 0, ws: null, sent: [], rtt: 38, onX: null };
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; F.ws = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 60); }
    send(s) {
      let m; try { m = JSON.parse(s); } catch (e) { return; }
      F.sent.push([vt, m]);
      if (m.t === 'ping') setTimeout(() => this.deliver(JSON.stringify({ t: 'pong', c: m.c })), F.rtt);
    }
    deliver(data) { if (this.readyState === 1 && this.onmessage) this.onmessage({ data }); }
    close() { this.readyState = 3; }
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
  function pump() {
    while (F.i < F.stream.length && F.stream[F.i][0] * 1000 <= vt) {
      const m = F.stream[F.i][1];
      if (typeof m === 'string') { if (!(F.ws && F.ws.readyState === 1)) return; F.ws.deliver(m); }
      else if (F.onX) F.onX(m);
      F.i++;
    }
  }
  // one frame: timers, due messages, the page's animation frame, then CSS animations stepped by the same amount
  VC.advance = ms => {
    const end = vt + ms;
    runTimers(end); vt = end; pump();
    for (const h of VC.hooks) try { h(vt / 1000, ms / 1000); } catch (e) { console.error('hook', e); }
    const q = rafQ; rafQ = [];
    for (const cb of q) try { cb(vt); } catch (e) { console.error('raf', e); }
    for (const h of VC.after || []) try { h(vt / 1000, ms / 1000); } catch (e) { console.error('after', e); }
    for (const an of document.getAnimations()) {
      if (an.playState === 'running') an.pause();
      if (an.playState === 'paused') an.currentTime = (an.currentTime || 0) + ms;
    }
  };
})();
