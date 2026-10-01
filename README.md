# 铁底湾1942

3D 网页二战海战游戏。1942 年 11 月，瓜达尔卡纳尔岛外的萨沃岛海峡，黄昏。你驾驶一艘美军战舰、带两艘驱逐舰僚舰，击退日军分三波发起的突入。

**在线游玩：<https://ironbottom1942.com/>**

## 座舰

| 座舰 | 舰级 | 特点 |
| --- | --- | --- |
| 弗莱彻号 DD-445 | 弗莱彻级驱逐舰 | 36.5 节，5 × 127 mm，10 条 Mk15 鱼雷。最快也最脆，三艘里最难开 |
| 海伦娜号 CL-50 | 布鲁克林级轻巡洋舰 | 15 × 152 mm，5 秒一轮，火力最密 |
| 华盛顿号 BB-56 | 北卡罗来纳级战列舰 | 9 × 406 mm，射程 9.8 km，装填 24 秒，带副炮自动射击 |

## 三波敌舰

1. **前卫驱逐舰**：夕立、春雨、天雾
2. **第六战队**：青叶、衣笠、川内，外加白雪、初雪
3. **挺身攻击队**：雾岛、爱宕、高雄、长良、绫波、五月雨。这一波会有一艘美军战列舰赶来增援

结算页列出你击沉的每艘日舰和它的真实结局。

## 操作

| 按键 | 作用 |
| --- | --- |
| W / S | 车钟加减（全速后退 → 全速前进，七档） |
| A / D | 按住转舵 |
| 鼠标 | 左右定方位，上下定距离（点击画面锁定鼠标） |
| 左键 / 空格 | 齐射 |
| 右键 / Shift / Z | 望远镜 |
| 滚轮 | 镜头远近 |
| 1 / 2 | 主炮 / 鱼雷 |
| R | 损管：灭火并抢修 |
| L | 提前量标记开关 |
| M | 静音 |
| Esc / P | 暂停 |

触屏设备有屏幕按钮，但用键盘鼠标更顺手。浏览器不允许锁定鼠标时，改为按住拖动瞄准、单击开火。

## 几条规则

- 炮弹有飞行时间，打移动目标要算提前量。敌舰旁的菱形是按当前航向航速推算的落点。
- 日军的九三式氧气鱼雷几乎没有航迹，离我方舰船 2.3 km 以内才看得见。鱼雷逼近时屏幕会报警，转到与雷迹平行的方向就能躲开。
- 大口径穿甲弹打驱逐舰会打穿不炸，伤害打折；打中巡洋舰、战列舰的舰体中段有概率击穿要害。
- 敌方火控在你转向时更容易打偏，一直直线航行最容易挨打。
- 每击退一波，耐久恢复 40%，损管次数 +1，鱼雷重新装填。

## 技术

- 单个 `index.html`，没有构建步骤。3D 用 [three.js](https://threejs.org/) 0.160（从 cdnjs 加载），字体来自 Google Fonts。
- 舰船模型按各舰级的舰长、舷宽、舷弧和上层建筑布局在运行时生成，没有外部模型文件：外飘舰艏（日舰为飞剪艏）、艏楼断差、巡洋舰艉，舰桥、三脚桅与塔桅、烟囱帽与蒸汽管、鱼雷发射管、高炮、探照灯、测距仪、指挥仪、舢板、弹射器与水上飞机、栏杆和桅索都有建模。舷侧的水线、防污漆、舷窗、锈迹和驱逐舰舷号，以及甲板的木板、油毡或钢板纹理，都用 canvas 实时绘制。
- 水面、天空、尾迹和粒子都是自写着色器。
- 炮声和炮弹啸声用 `sfx/` 里的真实录音（见下方来源），按口径分四档：5 英寸、6 英寸、8 英寸、14/16 英寸各用一段录音，档内按口径变调。WebAudio 在上面叠加距离滤波、立体声方位、海面混响和远处闷雷；落在身边的炮弹播放对准落点时刻的呼啸，过顶的炮弹带多普勒降调。中弹是钢板撞击声、爆炸录音和破片声的叠加，鱼雷是水下闷响加落下的水柱；近失弹的水声由上千个气泡音粒实时合成。距离按离座舰和镜头中较近的一方计算。录音加载失败时退回实时合成。

## 音效来源

`sfx/` 里的片段都截取自 [Freesound](https://freesound.org) 上以 CC0（公共领域）发布的录音，经过剪切、混音和响度归一化：

| 文件 | 来源 |
| --- | --- |
| `gun_s` `gun_l` `outgoing` | [S20-17 8 inch navel cannon fired with shell whines](https://freesound.org/s/675606/) · craigsmith |
| `gun_m` | [Warship Main Battery Opening Fire](https://freesound.org/s/399853/) · morganpurkis |
| `gun_xl` | 同上 8 英寸炮录音降调，混入 [Deep Boom Heavy Cannon Fire](https://freesound.org/s/853281/) · el_boss |
| `distant` | [S20-12 Distant cannon fire](https://freesound.org/s/675613/) · craigsmith |
| `incoming_a/b/c` `boom_a/b` | [G33-14 Shell whine and Explosion](https://freesound.org/s/438520/) · craigsmith |
| `whistle` `flyby` `hit_c` | [R09-51 Long Whistle and Hit](https://freesound.org/s/483279/) · craigsmith |
| `hit_a` `hit_b` | [S18-01 Incoming shells; explosions](https://freesound.org/s/674897/) · craigsmith |

主界面背景音乐 `music_hymn` 是美国海军赞美诗《Eternal Father, Strong to Save》，美国海军乐队礼仪乐队演奏，来自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Eternal_Father,_Strong_to_Save_(Instrumental).mp3)。美国政府作品，属公共领域。
- 本地运行：在仓库目录执行 `python3 -m http.server`，然后打开 `http://localhost:8000/`。

## 平衡测试

`dev/` 目录里是调数值用的工具。打开 `dev/index.html` 会开启调试句柄 `window.__ibs`，并加载一个「机器人舰长」。它会算提前量瞄准、躲鱼雷、绕开岛屿、自动损管。在控制台执行：

```js
__run('fletcher', 'captain')   // 座舰：fletcher / brooklyn / nc；难度：cadet / captain / admiral
```

模拟会同步跑完一整局，返回胜负、每 20 秒的战况，以及按炮弹、鱼雷、火灾、搁浅拆分的伤害来源。

`dev/viewer.html` 是舰模查看器，可以近距离环绕检查各舰模型：`?ship=takao&a=-110&e=14&d=0.6`（方位角、仰角、距离按舰长倍数），加 `lz=0.9` 可把视点移到舰艏（-1 为舰艉）。方向键环绕，+/- 远近，[ ] 切换舰型。
