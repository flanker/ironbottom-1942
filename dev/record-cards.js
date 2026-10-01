// Caption cards and the making-of animation for the promo videos, drawn with the game's own webfonts.
// Loaded after record.js: await __rec.cards(); await __rec.making('h'); await __rec.making('v')
(function () {
  const R = window.__rec, I = window.__ibs;
  const F = {
    serif: w => `${w} %spx "Noto Serif SC",serif`, sans: w => `${w} %spx "Noto Sans SC",sans-serif`,
    stencil: w => `${w} %spx "Big Shoulders Stencil Display",sans-serif`, mono: w => `${w} %spx "IBM Plex Mono",monospace`,
  };
  const font = (kind, w, px) => F[kind](w).replace('%s', px);
  const AMBER = '#f0b54a', PAPER = '#ebe3cd', DIM = '#a39d8a', INK = 'rgba(6,9,12,.92)';
  async function preload(list) { for (const [f, t] of list) await document.fonts.load(f, t); }
  // text with a soft dark halo and a hard outline, so it reads over bright sunset and dark sea alike
  function say(g, text, x, y, f, fill = '#fff', { align = 'center', stroke = 0.12, glow = 24 } = {}) {
    g.save(); g.font = f; g.textAlign = align; g.textBaseline = 'alphabetic';
    const px = parseFloat(f.match(/(\d+)px/)[1]);
    g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = glow; g.lineJoin = 'round';
    g.lineWidth = px * stroke; g.strokeStyle = INK; g.strokeText(text, x, y);
    g.shadowBlur = 0; g.fillStyle = fill; g.fillText(text, x, y); g.restore();
  }
  // a line made of styled runs: [[text, fontSpec, fill], …], centred on x
  function runs(g, parts, x, y, opts) {
    g.save(); let w = 0; for (const [t, f] of parts) { g.font = f; w += g.measureText(t).width; } g.restore();
    let cx = x - w / 2;
    for (const [t, f, fill] of parts) { g.save(); g.font = f; const tw = g.measureText(t).width; g.restore(); say(g, t, cx, y, f, fill, { align: 'left', ...(opts || {}) }); cx += tw; }
  }
  const H = { w: 1920, h: 1080 }, VV = { w: 1080, h: 1920 };
  const sans = (px, w = 700) => font('sans', w, px), serif = (px, w = 900) => font('serif', w, px), sten = (px, w = 900) => font('stencil', w, px), mono = (px, w = 600) => font('mono', w, px);
  // two-line lower third for the landscape cut
  const low = (a, b, bFill = AMBER) => g => { say(g, a, H.w / 2, b ? 900 : 950, sans(66)); if (b) say(g, b, H.w / 2, 985, sans(44, 500), bFill); };
  // bottom band for the portrait cut
  const vlow = (a, b, bFill = AMBER) => g => { say(g, a, VV.w / 2, b ? 1420 : 1460, sans(74)); if (b) say(g, b, VV.w / 2, 1520, sans(52, 500), bFill); };
  const tag = text => g => { g.save(); g.fillStyle = 'rgba(6,9,12,.62)'; g.font = sans(30, 500); const w = g.measureText(text).width; g.fillRect(64, 60, w + 56, 58); g.fillStyle = AMBER; g.fillRect(64, 60, 6, 58); g.restore(); say(g, text, 98, 100, sans(30, 500), PAPER, { align: 'left', glow: 0, stroke: 0 }); };

  const CARDS = {
    // landscape
    'h/hook': g => { say(g, '逆天了', H.w / 2, 560, serif(230), AMBER, { glow: 40 }); runs(g, [['Claude Code ', sten(84), '#fff'], ['一晚上做出一个「战舰世界」', sans(72), '#fff']], H.w / 2, 700); },
    'h/title': g => { runs(g, [['铁底湾', serif(150), PAPER], ['1942', sten(96), AMBER]], H.w / 2, 560, { glow: 36 }); say(g, '1942 · 瓜达尔卡纳尔 · 萨沃岛海峡', H.w / 2, 650, sans(40, 500), PAPER); say(g, '纯网页 3D 海战 · 浏览器打开就能玩', H.w / 2, 720, sans(44, 700), AMBER); },
    'h/lineup': low('三艘美舰可选', '驱逐舰 · 轻巡洋舰 · 战列舰，大小一目了然'),
    'h/details': low('每一艘船都是代码“画”出来的', '舰桥、三脚桅、鱼雷管、水上飞机……没有一个外部 3D 模型文件'),
    'h/tag_takao': tag('高雄型重巡 · 舰桥'), 'h/tag_kongo': tag('金刚型战列舰 · 塔式桅楼'), 'h/tag_brooklyn': tag('海伦娜号 · 弹射器与水上飞机'), 'h/tag_fletcher': tag('弗莱彻级驱逐舰 · 鱼雷管'),
    'h/ba': g => { low('我只说了一句：“优化一下建模，更精细一些”')(g); },
    'h/ba_old': tag('之前'), 'h/ba_new': tag('之后'),
    'h/duel': low('炮弹有真实弹道', '飞行要好几秒，得自己算提前量'),
    'h/impact': low('命中！起火！'),
    'h/sink': g => say(g, '击沉！', H.w / 2, 960, serif(150), AMBER, { glow: 36 }),
    'h/torp1': low('驱逐舰鱼雷齐射'),
    'h/long': low('远距离对轰', '九公里外的战列舰，炮弹要飞六秒'),
    'h/shellcam': low('跟着一发 16 英寸炮弹飞过去'),
    'h/melee': low('近距离混战', '巡洋舰、驱逐舰排成战列对射'),
    'h/melee_close': low('六英寸速射炮，五秒一轮'),
    'h/evade': low('急转规避鱼雷', '转到与雷迹平行，鱼雷从两舷擦过'),
    'h/torp2': low('中雷！'),
    'h/outro': g => { say(g, 'ironbottom1942.com', H.w / 2, 520, mono(96, 600), AMBER, { glow: 36 }); say(g, '打开浏览器就能玩', H.w / 2, 620, sans(56), '#fff'); say(g, '你想让 AI 做什么游戏？评论区见', H.w / 2, 700, sans(40, 500), PAPER); },
    // portrait: persistent title band on top, captions in the bottom band
    'v/top': g => {
      say(g, '逆天了！', VV.w / 2, 330, serif(170), AMBER, { glow: 40 });
      runs(g, [['Claude Code ', sten(92), '#fff'], ['一晚上', sans(80), '#fff']], VV.w / 2, 450);
      say(g, '做出一个「战舰世界」', VV.w / 2, 556, sans(80), '#fff');
    },
    'v/hook': vlow('纯网页 3D 海战游戏', '一个 HTML 文件 · 打开就能玩'),
    'v/lineup': vlow('三艘美舰可选', '驱逐舰 · 轻巡洋舰 · 战列舰'),
    'v/details': vlow('每艘船都是代码“画”的', '没有一个外部 3D 模型文件'),
    'v/ba': vlow('我只说了一句', '“优化一下建模，更精细一些”'),
    'v/ba_old': g => say(g, '之前', 60, 720, sans(46), PAPER, { align: 'left' }),
    'v/ba_new': g => say(g, '之后', 60, 720, sans(46), AMBER, { align: 'left' }),
    'v/duel': vlow('炮弹有真实弹道', '得自己算提前量'),
    'v/impact': vlow('命中！起火！'),
    'v/sink': g => say(g, '击沉！', VV.w / 2, 1500, serif(150), AMBER, { glow: 36 }),
    'v/torp2': vlow('鱼雷命中！'),
    'v/long': vlow('远距离对轰', '炮弹要飞六秒'),
    'v/shellcam': vlow('跟着炮弹飞过去'),
    'v/melee': vlow('近距离混战', '巡洋舰、驱逐舰对射'),
    'v/melee_close': vlow('六英寸速射炮', '五秒一轮'),
    'v/evade': vlow('急转规避鱼雷', '鱼雷从两舷擦过'),
    'v/outro': vlow('你想让 AI 做什么游戏？', '评论区告诉我'),
  };
  // every glyph the cards and the making-of use, so the subsetted webfonts are in before drawing
  const ALL = '逆天了！Claude Code一晚上做出一个「战舰世界」铁底湾1942·瓜达尔卡纳尔萨沃岛海峡纯网页3D海战浏览器打开就能玩三艘美舰可选驱逐轻巡洋列，大小目然每艘船都是代码“画”的桥脚桅鱼雷管水上飞机……没有外部模型文件高雄型重金刚塔式楼伦娜号弹射器与弗莱彻级之前后我只说了句：优化下建更精细些炮弹真实道行要好几秒得自己算提量命中起火击沉齐中ironbottom1942.com你想让AI什么游戏？评论区见告诉HTML我这样跟话不同口径应该一样看网是否有音效可用的方近失声都果首选择时拖动360度检视买配置改好已提交部署第二初版线按膛主界面重做与打光行美国赞美诗背景乐0123456789个段录音CC0公共领域约字年月日时分秒→✓:．.~+远距离对轰九公里外要飞六秒跟着发英寸近混排成射速一轮急转规避与平行从两舷擦过让';
  async function fonts() {
    const specs = [serif(100), serif(100, 700), sans(60), sans(60, 500), sans(60, 400), sten(80), mono(60), mono(60, 500)];
    await preload(specs.map(f => [f, ALL]));
  }
  R.cards = async () => {
    await fonts();
    for (const [id, draw] of Object.entries(CARDS)) {
      const [fmt] = id.split('/'), d = fmt === 'h' ? H : VV;
      await R.card(`cards/${id}.png`, d.w, d.h, draw);
    }
    return Object.keys(CARDS).length + ' cards';
  };

  // ---- making-of: what was asked, when it landed, what it adds up to
  const ASKS = ['优化一下建模，更精细一些', '不同口径的应该不一样，你看网上是否有音效可以用的', '近失弹的水声也没有效果，你优化一下', '首页选择舰船时，可以拖动舰船 360 度检视', '我买了 ironbottom1942.com，你帮我配置'];
  const TIMELINE = [['第一晚', '08:42', '第一版上线：3D 海战、三波日舰'], ['第二晚', '22:48', '舰模精细化：舰桥、桅杆、鱼雷管、水上飞机'], ['', '01:02', '按口径区分的真实炮声'], ['', '01:29', '中弹、鱼雷、近失弹音效重做'], ['', '07:51', '主界面重做 + 军舰打光'], ['', '08:11', '上线 ironbottom1942.com']];
  const STATS = [['1', '个 HTML 文件'], ['约 3000', '行代码'], ['0', '个 3D 模型文件'], ['17', '段录音 · CC0 / 公共领域']];
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3);
  let bg = null;
  async function background() {
    // a darkened, blurred frame of the game behind the text
    const h2 = R.h2; h2.scene(); const s = h2.ship('nc', 'US', 'x', 2000, 2400, h2.SUN + 0.2, 0.5, 4);
    for (let i = 0; i < 120; i++) I.step(1 / 60, true);
    h2.look(h2.W(s, 0, 0, 0).add(h2.dirXZ(s.heading + Math.PI + 0.4).multiplyScalar(320)).add(h2.V(0, 40, 0)), h2.W(s, 0, 10, 0), 42);
    I.renderView(); bg = document.createElement('canvas'); bg.width = 1920; bg.height = 1080; bg.getContext('2d').drawImage(I.glCanvas, 0, 0, 1920, 1080);
  }
  const bgCache = {};
  function drawBg(g, w, h) {
    const key = w + 'x' + h;
    if (!bgCache[key]) {
      const c = bgCache[key] = document.createElement('canvas'); c.width = w; c.height = h; const b = c.getContext('2d');
      b.filter = 'blur(18px) brightness(.32) saturate(.8)';
      const s = Math.max(w / bg.width, h / bg.height) * 1.08; b.drawImage(bg, (w - bg.width * s) / 2, (h - bg.height * s) / 2, bg.width * s, bg.height * s);
    }
    g.drawImage(bgCache[key], 0, 0);
  }
  function bubble(g, text, x, y, maxW, a, px) {
    g.save(); g.globalAlpha = a; g.font = sans(px, 500); const w = Math.min(maxW, g.measureText(text).width) + px * 1.4, h = px * 1.9;
    g.fillStyle = 'rgba(240,181,74,.16)'; g.strokeStyle = 'rgba(240,181,74,.6)'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - w, y - h / 2, w, h, h / 2); g.fill(); g.stroke();
    g.fillStyle = PAPER; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(text, x - px * 0.7, y + 1); g.restore();
  }
  function making(g, t, w, h, fmt) {
    const v = fmt === 'v', S = v ? 1 : 1, cx = w / 2;
    drawBg(g, w, h);
    // phase A: the asks
    const A0 = 0, A1 = v ? 5 : 6.2, B1 = v ? 9 : 12.4, total = v ? 11.5 : 16;
    if (t < A1 + 0.4) {
      const fa = Math.min(1, (A1 + 0.4 - t) / 0.4);
      g.save(); g.globalAlpha = fa;
      say(g, '我只是这样跟 Claude Code 说话', cx, v ? 420 : 170, sans(v ? 62 : 58), '#fff');
      ASKS.forEach((q, i) => {
        const ti = 0.5 + i * (v ? 0.8 : 1.0), a = ease((t - ti) / 0.35); if (a <= 0) return;
        const px = v ? 38 : 40, y = (v ? 600 : 290) + i * (v ? 150 : 128) + (1 - a) * 20;
        bubble(g, q, v ? w - 70 : w / 2 + 560, y, v ? w - 160 : 1100, a, px);
        g.globalAlpha = fa * a; say(g, '✓ 改好了，已提交部署', v ? w - 90 : w / 2 + 540, y + px * 1.6, mono(v ? 24 : 24, 500), AMBER, { align: 'right', glow: 0, stroke: 0 }); g.globalAlpha = fa;
      });
      g.restore();
    }
    // phase B: the timeline
    if (t > A1 && t < B1 + 0.4) {
      const fb = Math.min(ease((t - A1) / 0.4), Math.min(1, (B1 + 0.4 - t) / 0.4));
      g.save(); g.globalAlpha = fb;
      say(g, '两个晚上，发生了什么', cx, v ? 420 : 170, sans(v ? 62 : 58), '#fff');
      const x0 = v ? 120 : 520, y0 = v ? 600 : 290, dy = v ? 150 : 112;
      g.strokeStyle = 'rgba(240,181,74,.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + (v ? 150 : 160), y0 - 30); g.lineTo(x0 + (v ? 150 : 160), y0 + dy * (TIMELINE.length - 1) + 30); g.stroke();
      TIMELINE.forEach(([night, tm, what], i) => {
        const a = ease((t - A1 - 0.3 - i * (v ? 0.45 : 0.75)) / 0.35); if (a <= 0) return;
        const y = y0 + i * dy, xo = (1 - a) * 30;
        g.globalAlpha = fb * a;
        if (night) say(g, night, x0 + xo, y + 12, sans(v ? 30 : 30, 500), DIM, { align: 'left', glow: 0, stroke: 0 });
        g.fillStyle = AMBER; g.beginPath(); g.arc(x0 + (v ? 150 : 160), y, 8, 0, Math.PI * 2); g.fill();
        say(g, tm, x0 + (v ? 180 : 195) + xo, y + 14, mono(v ? 40 : 42, 600), AMBER, { align: 'left', glow: 0, stroke: 0 });
        if (v) say(g, what, x0 + 180 + xo, y + 66, sans(34, 500), PAPER, { align: 'left', glow: 0, stroke: 0 });
        else say(g, what, x0 + 360 + xo, y + 14, sans(40, 500), PAPER, { align: 'left', glow: 0, stroke: 0 });
      });
      g.restore();
    }
    // phase C: the totals
    if (t > B1) {
      const fc = ease((t - B1) / 0.4);
      g.save(); g.globalAlpha = fc;
      STATS.forEach(([n, label], i) => {
        const a = ease((t - B1 - 0.2 - i * 0.35) / 0.35); if (a <= 0) return;
        g.globalAlpha = fc * a;
        if (v) { const y = 560 + i * 250; say(g, n, cx, y, sten(150), AMBER, { glow: 0, stroke: 0 }); say(g, label, cx, y + 70, sans(44, 500), PAPER, { glow: 0, stroke: 0 }); }
        else { const x = 300 + i * 440; say(g, n, x, 520, sten(n.length > 3 ? 120 : 170), AMBER, { glow: 0, stroke: 0 }); say(g, label, x, 600, sans(36, 500), PAPER, { glow: 0, stroke: 0 }); }
      });
      g.globalAlpha = fc * ease((t - B1 - 1.8) / 0.5);
      say(g, '一晚上做出来，再一晚上打磨上线', cx, v ? 1640 : 800, sans(v ? 50 : 52), '#fff');
      g.restore();
    }
    return total;
  }
  R.making = async fmt => {
    await fonts(); if (!bg) await background();
    const v = fmt === 'v', w = v ? 1080 : 1920, h = v ? 1920 : 1080, total = v ? 11.5 : 16;
    return R.anim('making_' + fmt, total, (g, t) => making(g, t, w, h, fmt), w, h);
  };
})();
