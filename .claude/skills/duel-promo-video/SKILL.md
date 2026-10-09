---
name: duel-promo-video
description: 给铁底湾1942做宣传视频（B站横版 3–5 分钟 + 小红书竖版 1 分钟内 + 封面 + 旁白稿），尤其是联机对决：用真实服务器代码跑出对局，再逐帧回放成双方视角的游戏画面。用户说「做个视频 / 宣传片 / promo / B站 / 小红书 / 封面 / 旁白稿」时使用。
---

# 铁底湾1942 宣传视频

产出：画面加游戏音效和音乐的成片（**不含旁白**，作者自己录），带时间码的旁白稿、SRT、跟成片对齐的 AI 试读参考音轨、封面和发布文案。上一版成品放在 `~/Movies/铁底湾1942_联机宣传/`，可以拿来参考结构和节奏。

## 原理（先读懂再动手）

1. **对局在 Node 里跑**：`node dev/record/duel-stream.js <BB|DD|CA> <seed> out.json` 用真实的 `server/room.js` 和 `sim.js` 把一整个房间跑完，包括建房、加入、选舰、准备、倒计时和对局。双方舰长交给游戏 AI，`Math.random` 用种子固定。每一方收到的每条服务器消息都按时间记下来，`xme` 里另存舰长的锁定目标、车钟、舵和鱼雷发射，页面要用这些来模拟玩家的手。
   - 扫种子：`node dev/record/duel-stream.js BB scan 30`。看谁赢、命中、击沉、鱼雷，挑剧情好的那局。
   - 房间流程的时间点写在 `SCENARIOS.<场景>.lobby` 里（`create`、`join`、`cls`、`esc`、`pickJP`、`readyUS`、`readyJP`），**单位是会话秒**。录制时页面要在同一时刻点同一个按钮，所以改其中一个，另一个也要跟着改（BB 场景对应 `prod.py` 的 `lobby()`）。改房间流程的时间不影响对局结果，同一种子打出来的仗完全一样。
2. **页面逐帧回放**：`python3 dev/record/record-duel.py job.json` 打开真游戏（先在仓库根目录跑 `npm start`，端口 8080），注入两个脚本：
   - `dev/record/record-duel-boot.js`：虚拟时钟（performance.now、Date.now、定时器和 rAF 只跟着 `__vc.advance` 走，CSS 动画逐帧步进），再加一个假 WebSocket，按时间把那一方的消息喂给页面。游戏代码一行不改，大厅、HUD、插值、结算全是真的。
   - `dev/record/record-duel.js`：导演。plan 里的动作有 `cursor`、`move`、`click`、`type`、`zoom`（望远镜）、`cine`（隐藏 HUD 和界面）、`cam`。机位有 `orbit`、`chase`、`target`（站在被打的那艘船旁边）、`shell`（跟拍炮弹）、`wide`、`deck`；镜头里的舰船用 `me`、`foe`、`US`、`JP` 或舰名来指。声音先记录，take 结束后用 OfflineAudioContext 重放，输出对齐画面的 `audio.wav`。
   - job 里的 `takes` 只截取需要的时间段，其余时间快进（每秒 100 帧以上）。`every: 60` 用来出预览缩略图。
3. **剪辑和混音**在 `dev/promo/` 里，见下文。每一部片子单独一个文件夹 `dev/promo/productions/<日期-主题>/`，放这部片子会变的东西：录制任务、剪辑表、台词、封面选帧。

## 流程

所有命令都在仓库根目录跑。先设两个环境变量：

```sh
export PROMO_WORK=<scratchpad>/promo                          # 中间文件：对局流、录制任务、帧、配音、输出
export PROMO_PROD=dev/promo/productions/<日期-主题>             # 这部片子；新片子从上一部复制一份再改
```

1. **先写台词再排镜头**。把台词写进 `$PROMO_PROD/lines.json`（`b` 是 B站，`x` 是小红书，一句一个 key），然后跑 `python3 dev/promo/tts.py` 生成 AI 试读，拿到每句时长。真人通常读得比 edge-tts 慢一点，镜头按「试读时长加 0.3–0.8 秒」留空。
2. **出对局流**：`node dev/record/duel-stream.js BB 12 $PROMO_WORK/BB.json`，DD、CA 同理。
3. **预览选镜头**：每一方先跑一遍 `every: 60` 的预览，再用 `dev/promo/sheet.py` 或 `tsheet.py` 拼成缩略图，把命中、起火、中雷、击沉落在会话的哪一秒找出来。事件时间也可以直接查 stream JSON 的 `events`（`bt` 是对局时间）。**对局时间换算会话时间**：会话时间 = `start` + 0.04 + 0.15 + bt（`jobs.BASE`）。
4. **写录制任务**：在 `$PROMO_PROD/prod.py` 里用 `dev/promo/jobs.py` 的 `job()`、`take()`、`cine()` 写，竖版用视口 864×1536（×1.25 得到 1080×1920），镜头视场乘 1.75。跑 `python3 $PROMO_PROD/prod.py > $PROMO_WORK/runs/list.txt`，再跑 `python3 dev/promo/runall.py $PROMO_WORK/runs/list.txt 4` 并行录制（别用 xargs，路径太长会报错）。
5. **字卡**：`dev/promo/cards/cards.html` 用游戏自己的字体画片头、分屏底板、章节标签、技术说明卡、片尾、竖版顶栏和底部字幕，`python3 dev/promo/cards/render.py` 输出透明 PNG 到 `$PROMO_WORK/cards/`。
6. **剪辑**：`$PROMO_PROD/edit.py` 里的 `edit_b()` 和 `edit_x()` 就是剪辑表，同一个文件里还有音乐铺在哪（`music()`）、按钮声在哪（`clicks()`）、每句旁白对应的画面说明（`PIC`）。每段写时长 `d`、画面 `v`（`F` 全屏，可带 `z` 放大裁切；`SPL` 左右分屏；`STK` 上下分屏；`P` 竖版原生）、字卡 `ov`、旁白 `n`（key 和段内延迟）。`G` 是跨段的标签。先跑 `python3 dev/promo/compose.py b timeline` 检查旁白有没有重叠，再跑 `python3 dev/promo/compose.py b` 出画面和游戏声。
7. **混音**：`python3 dev/promo/mix.py b`。游戏声放一层，游戏自带的赞美诗（`sfx/music_hymn.mp3`）垫在片头、房间、结算和片尾，全程有一层海浪底噪，大厅点按钮有咔嗒声。旁白位置把游戏声压到 50%、音乐压到 40%，最后 loudnorm 到 -14 LUFS。同时输出 `guide.wav`（AI 试读单独一轨）和 `preview_with_guide.mp4`。
8. **检查**：每秒抽一帧拼成缩略图，再挑几帧看原图，确认字卡没有挡住画面、看得清。用 RMS 每 5 秒看一次音量，找出过安静的段落（比如结算页）。
9. **封面和交付**：用 `tsheet.py` 选帧，把文件名写进 `$PROMO_PROD/cover.html`，跑 `python3 dev/promo/cards/cover.py`；再跑 `python3 dev/promo/export.py b <目标目录>/B站横版`，以及 `x` 对应的小红书目录。最后写 `发布文案.md`。

## 踩过的坑

- **截图**：必须用 `page.screenshot()`。CDP 的 `Page.captureScreenshot` 不带 clip 时只给 CSS 像素，带 `clip.scale` 又会把 devicePixelRatio 打回 1。视口用 1536×864、dpr 1.25 输出 1920×1080，HUD 字比原生 1080p 大一圈。
- **望远镜别对着夕阳开**：美军朝西打，镜头正对太阳，`zoom` 会整片过曝成白色。远距离对射改用电影机位 `target` 去拍对面挨打。
- **cine 模式**要连 `.screen` 一起隐藏，否则对局一结束，结算页会盖住下沉镜头（已修好）。
- **镜头和岛**：跟拍炮弹的镜头可能穿过岛，DD 那局日军视角在 110–150 秒贴着岛走，HUD 画面会切进地形。先看预览，挑干净的时间段，或者剪掉中间那段。`wide` 机位在舰船分散时只拍到空海面，改用高一点的 `chase`（back 330、h 95）。
- **大厅放大裁切**：重巡阶段日军有两张卡，面板几乎占满整个高度，不能放大；切到战列舰后面板变矮，可以放大 1.32。半宽分屏里的 UI 字太小，所以大厅轮到谁操作就切谁的全屏，只在双方同步的时刻（都在首页、都进了房间、都准备）用分屏。
- **观战**：战列舰那局两边都只有一条船，船一沉对局就结束，没法演示观战。要演示「沉了接着观战」，用带僚舰的 CA 局里日军座舰沉没之后的画面。
- **事件对齐**：数据里事件时间是对局时间，页面显示晚 0.19 秒左右（延迟加插值）。画面上看到命中，要以缩略图为准微调偏移。
- **文案不能编事实**：例如「做了一年」这种没依据的话不能写。旁白里的功能说明（手机能玩、掉线 60 秒重连、每秒 15 次快照）以 README 为准，交付时提醒作者核对。

## 平台规则

- **开头 3–5 秒放精华**，没有旁白：双方同时开火、命中、中雷、击沉，叠一张大字卡。
- **B站**：3–5 分钟，横版，左美军右日军。**小红书**：一分钟以内（上一版 51 秒），竖版上下分屏加竖版电影镜头，底部大字关键词，因为很多人静音看。
- **视频、封面、文案都不放链接**。标题把核心卖点放前面，正文写 4–5 条带 emoji 的列表。这是原创游戏，不加「同人作品」那句声明。
- **旁白和字幕**：旁白不进成片，SRT 单独给，不烧进画面，因为作者口播会和稿子有出入。

## 文件

- `dev/record/duel-stream.js`、`dev/record/record-duel-boot.js`、`dev/record/record-duel.js`、`dev/record/record-duel.py`：出对局流和逐帧录制。
- `dev/promo/`：通用流程。`jobs.py` 是录制任务的辅助函数，`runall.py` 并行录制，`tts.py` 生成 AI 试读，`compose.py` 逐段合成，`mix.py` 混音并导出 mp4，`export.py` 生成 SRT、旁白稿和交付文件，`cards/` 是字卡和封面渲染，`sheet.py` 和 `tsheet.py` 出缩略图。
- `dev/promo/productions/2026-10-duel/`：上一版联机宣传片（BB 种子 12、DD 种子 26、CA 种子 17），做新片子时复制这个文件夹当模板。里面有 `prod.py`（录制任务和 BB 的房间流程）、`edit.py`（剪辑表、音乐、按钮声、画面说明）、`lines.json`（台词）和 `cover.html`（封面）。
- 老的单人战役录制器在 `dev/record/legacy/`：`record.html` 加载 `record.js`、`record-hud.js`、`record-cards.js`，用 `recserver.py` 直接收帧，录单人战役画面可以用它。
- 单人战役宣传片（B站 Toy 版）在 `dev/promo/productions/2026-10-toy/`：`make.py` 自带剪辑表和混音，不走 `compose.py`。录素材时用 Playwright 打开 `record.html`，`__rec.setup(w, h)` 后逐个 `__rec.run(镜头)` 或 `__rec.game('nc'|'dd')`，**每个镜头录完都要 `await __rec.flush()`**，否则最后一段音轨会被截断。竖版设 `__rec.fovK = 1.75` 再 `setup(1080, 1920)`。Chromium 加 `--use-angle=metal` 用真 GPU，一个镜头几秒钟就能录完。带真实 HUD 的段落，字卡要放在画面上方，否则会压住武器栏。
