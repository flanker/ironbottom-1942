"""The 2026-10 online-duel promo: B站 (3:33) and 小红书 (0:51). Run by dev/promo/compose.py, mix.py and export.py with
their helpers in scope: F (full screen, z = zoom), P (portrait native), SPL (side by side), STK (stacked), BASE (session
time of each battle's t = 0), off(). Takes are the ones prod.py records; bt = battle seconds, session = session seconds."""

NAMES = {'b': 'B站横版', 'x': '小红书竖版'}
HOOK = {'b': 5.4, 'x': 4.1}   # highlight reel at the top, no narration


def edit_b():
    L = BASE['BB']
    S = []
    hook = [('hook', 0, 99)]
    S += [dict(d=1.6, v=SPL('bb_us_lobby', 'bb_jp_lobby', bt=-0.25), ov=hook, fin=1),
          dict(d=1.4, v=F('bb_tgtJP', bt=5.9), ov=hook),
          dict(d=1.1, v=F('dd_sink', bt=146.4), ov=hook),
          dict(d=1.3, v=F('bb_sink', bt=132.5), ov=hook, fout=1)]
    S += [dict(d=6.0, v=F('bb_chase', bt=20.5), ov=[('title', 0.3, 5.7)], n=('title', 0.4))]
    Z = 1.32
    home = len(S)
    cuts = [(11.5, 'S', 1), (14.4, 'US', 1.32), (16.4, 'US', 1), (23.6, 'JP', 1.32), (26.8, 'JP', 1), (28.4, 'S', 1), (30.0, 'US', 1), (34.3, 'US', Z), (43.4, 'JP', Z), (47.0, 'US', Z), (56.0, 'S', 1), (L, None, 1)]
    S += [dict(d=11.5, v=F('bb_us_lobby', session=0),
               n=[('home', 0.3), ('create', 11.8), ('copy', 19.6), ('join', 24.3), ('cls', 29.6), ('balance', 39.5), ('esc', 48.3), ('ready', 55.6)])]
    for (a, who, z), (b, _, _) in zip(cuts, cuts[1:]):
        if who == 'S': S.append(dict(d=b - a, v=SPL('bb_us_lobby', 'bb_jp_lobby', session=a), a='split'))
        else: S.append(dict(d=b - a, v=F(f'bb_{who.lower()}_lobby', z=z, session=a)))
    G = [(c, home, a, b) for c, a, b in [('t_create', 12.0, 19.5), ('t_join', 23.6, 29.0), ('t_cls', 29.6, 39.0), ('t_balance', 39.5, 48.0), ('t_esc', 48.3, 55.5), ('t_ready', 55.6, L)]]
    S += [dict(d=5.9, v=F('bb_us_lobby', bt=-0.1), ov=[('t_long', 0.2, 5.9)], n=('long', 0.2)),
          dict(d=4.6, v=F('bb_tgtJP', bt=5.8), n=('hit', 0.8)),
          dict(d=3.8, v=F('bb_tgtUS', bt=6.4), n=('hitback', 0.1)),
          dict(d=7.6, v=F('bb_jp_lobby', bt=1.0), ov=[('t_jp', 0.2, 7.6)], n=('jpview', 0.3)),
          dict(d=1.3, v=F('bb_shell', rel=3.9), ov=[('t_shell', 0.1, 6.0)], n=('shellcam', 0.2)),
          dict(d=4.7, v=F('bb_shell', rel=5.9), ov=[('t_shell', -1, 4.7)]),
          dict(d=7.0, v=SPL('bb_us_mid', 'bb_jp_mid', bt=97), ov=[('t_close', 0.2, 7.0)], a='split', n=('close', 0.4)),
          dict(d=3.4, v=F('bb_us_end', bt=130.3)),
          dict(d=9.0, v=F('bb_sink', bt=132.3), n=('sink', 0.3)),
          dict(d=2.6, v=F('bb_jp_end', bt=133.2))]
    S += [dict(d=7.0, v=F('dd_chase', bt=90), ov=[('t_dd', 0.2, 7.0)], n=('dd', 0.2)),
          dict(d=7.0, v=F('dd_jp_a', bt=77.3), ov=[('t_t93', 0.2, 7.0)], n=('t93', 0.1)),
          dict(d=5.2, v=F('dd_torp', bt=99.5), n=('torphit', 0.2)),
          dict(d=2.8, v=F('dd_us_a', bt=104.2)),
          dict(d=6.8, v=F('dd_us_b', bt=127.4), n=('comeback', 0.2)),
          dict(d=5.8, v=F('dd_sink', bt=145.3), n=('ddsink', 1.9))]
    S += [dict(d=8.8, v=F('ca_wide', bt=64), ov=[('t_ca', 0.2, 8.8)], n=('ca', 0.2)),
          dict(d=4.5, v=SPL('ca_us_a', 'ca_jp_a', bt=72), a='split'),
          dict(d=8.4, v=F('ca_jp_b', bt=122.6), ov=[('t_spec', 5.0, 8.4)], n=[('ca2', 0.3), ('spectate', 5.2)]),
          dict(d=4.2, v=F('ca_torpUS', bt=141.4))]
    S += [dict(d=4.6, v=F('bb_us_end', z=Z, bt=137), ov=[('t_result', 0.2, 99)], n=('result', 0.5)),
          dict(d=4.4, v=F('bb_jp_end', z=Z, bt=141.6), ov=[('t_result', -1, 99)]),
          dict(d=4.0, v=SPL('bb_us_end', 'bb_jp_end', bt=146.0), ov=[('t_result', -1, 3.8)], a='split')]
    S += [dict(d=9.0, v=F('bb_orbUS', bt=40), ov=[('tech', 0.3, 8.8)], n=('tech', 0.3))]
    S += [dict(d=8.0, v=F('ca_orbUS', bt=78), ov=[('outro', 0.4, 99)], n=('outro', 0.6), fade_end=1.2)]
    return S, (1920, 1080), 'b', G


def edit_x():
    S = []
    hk = [('phook', 0, 99)]
    top = ('ptop', 0, 99)
    S += [dict(d=1.6, v=STK('bb_us_lobby', 'bb_jp_lobby', bt=-0.25), ov=hk, a='split'),
          dict(d=1.4, v=P('bb_tgtJPp', bt=5.9), ov=hk + [top]),
          dict(d=1.1, v=P('dd_sinkp', bt=146.4), ov=hk + [top])]
    S += [dict(d=6.0, v=P('bb_chasep', bt=20.5), ov=[top], n=('x1', 0.2)),
          dict(d=3.6, v=STK('bb_us_lobby', 'bb_jp_lobby', session=15.4), ov=[('c_create', 0.2, 3.6)], a='split'),
          dict(d=3.7, v=STK('bb_us_lobby', 'bb_jp_lobby', session=23.9), ov=[('c_join', 0, 3.7)], a='split', n=('x2', -1.6)),
          dict(d=2.4, v=STK('bb_us_lobby', 'bb_jp_lobby', session=33.4), ov=[('c_ready', 0.2, 2.4)], a='split', n=('x3', 0.3)),
          dict(d=5.0, v=STK('bb_us_lobby', 'bb_jp_lobby', session=56.6, z=1.32), ov=[('c_ready', -1, 5.0)], a='split'),
          dict(d=4.0, v=P('bb_tgtJPp', bt=4.2), ov=[top, ('fc_long', 0.2, 4.0)], n=('x4', 0.2)),
          dict(d=2.6, v=P('bb_tgtUSp', bt=6.6), ov=[top, ('fc_long', -1, 2.4)]),
          dict(d=3.0, v=P('dd_chasep', bt=91), ov=[top, ('fc_t93', 0.2, 3.0)], n=('x5', 0.2)),
          dict(d=4.4, v=P('dd_torpp', bt=100.6), ov=[top, ('fc_t93', -1, 4.2)]),
          dict(d=3.0, v=STK('ca_us_a', 'ca_jp_a', bt=72), ov=[('c_ca', 0.2, 3.0)], a='split', n=('x6', 0.2)),
          dict(d=3.2, v=STK('bb_us_end', 'bb_jp_end', bt=133.4), ov=[('c_ca', -1, 3.2)], a='split'),
          dict(d=2.5, v=STK('bb_us_end', 'bb_jp_end', bt=138.5, z=1.32), ov=[('c_end', 0.2, 2.5)], a='split', n=('x7', 0.3)),
          dict(d=4.0, v=P('bb_orbUSp', bt=41), ov=[('pend', 0.3, 99)], fade_end=1.0)]
    return S, (1080, 1920), 'x', []


EDITS = {'b': edit_b, 'x': edit_x}


def music(which, S, starts, narr, total, lay):
    """where the game's hymn plays (lay(t0, t1, start_in, fi, fo)); returns its level under the game sound"""
    if which == 'b':
        battle = next(t0 for s, t0 in zip(S, starts) if s['v'][0] == 'full' and s['v'][1] == 'bb_us_lobby' and s['v'][2] > 60)
        lay(starts[4], battle + 1.0, 0.0, fi=2.0, fo=3.0)                 # title → room scene → first salvo
        res = next(a for a, key, d in narr if key == 'result')
        lay(res - 1.0, total, 4.0, fi=2.5, fo=1.5)                          # results, tech, outro
        mg = 0.30
    else:
        lay(4.1, 25.0, 0.0, fi=1.0, fo=2.0)
        lay(total - 7.5, total, 30.0, fi=1.5, fo=1.0)
        mg = 0.26
    return mg


def clicks(S, starts):
    """button presses and keystrokes in the BB room scene: session times from prod.py's lobby(), placed where that scene sits"""
    home = None
    for s, t0 in zip(S, starts):
        v = s['v']
        if v[0] == 'full' and v[1] == 'bb_us_lobby' and abs(v[2]) < 0.01: home = t0
    if home is None: return []
    btn = [13.6, 16.3, 21.0, 34.0, 53.5, 57.0, 13.8, 26.6, 58.0, 24.2]
    keys = [24.4 + i / 5 for i in range(4)]
    return [(home + t, 'btn') for t in btn] + [(home + t, 'key') for t in keys]


PIC = {
    'title': '片头：华盛顿号迎着夕阳开炮，叠「铁底湾1942 · 联机对决 · 上线」',
    'home': '游戏首页，光标先停在「单人战役」，再移到「联机对决」',
    'create': '左右分屏：左边玩家 A（美军），右边玩家 B（日军）；A 点联机对决 → 创建房间，房间号 1942 出现',
    'copy': 'A 点「复制邀请链接」，按钮变成「已复制」',
    'join': 'B 的画面：输入 1942，点加入，两人进了同一个房间',
    'cls': 'A（房主）的光标扫过 驱逐舰/轻巡/重巡/战列舰，点战列舰：华盛顿号 对 雾岛',
    'balance': '光标指着两艘船的数据：航速、主炮、射程、耐久；中间切到 B 的画面',
    'esc': '光标指「两艘驱逐舰」，再点「无」',
    'ready': '分屏：两边先后点「准备」，3 秒倒计时',
    'long': 'A 的战斗画面：开局横幅「华盛顿号 对阵 雾岛」，第一轮齐射，炮弹飞向九公里外',
    'hit': '镜头在雾岛旁边：炮弹落下，命中、起火',
    'hitback': '镜头在华盛顿号旁边：雾岛的还击命中',
    'jpview': 'B 的画面（日军）：九公里外的炮弹落下，本舰中弹、起火',
    'shellcam': '炮弹视角：跟着一发 406 mm 炮弹飞向雾岛',
    'close': '分屏：两边距离拉近，副炮加入，互相命中',
    'sink': '雾岛中弹爆炸、下沉',
    'dd': '驱逐舰：从夕立身后看弗莱彻号，两公里内对射',
    't93': 'B 的画面（日军驱逐舰夕立）：九三式鱼雷出管',
    'torphit': '镜头在弗莱彻号旁：鱼雷水柱炸起，A 的画面「我舰中雷」',
    'comeback': 'A 的画面：弗莱彻号抵近，鱼雷出管',
    'ddsink': '夕立中雷，爆炸下沉',
    'ca': '重巡三对三：旧金山号在前，炮弹落在四周，远处是日军舰队',
    'ca2': 'B 的画面：青叶沉入铁底湾',
    'spectate': 'B 的画面：座舰沉没后继续观战，跟着僚舰看',
    'result': '结算：A 的「胜利」→ B 的「战败」→ 分屏，两人点「回到房间」',
    'tech': '华盛顿号在夕阳里航行，右侧叠服务器说明卡片',
    'outro': '重巡混战空镜，叠片尾卡「铁底湾1942 · 联机对决」',
    'x1': '华盛顿号迎着夕阳开炮，顶部是标题条',
    'x2': '上下分屏：上面 A 创建房间拿到 1942，下面 B 输入房间号加入',
    'x3': '上下分屏：选战列舰，两边点准备，倒计时开战',
    'x4': '竖屏：雾岛中弹起火，接着华盛顿号被还击命中',
    'x5': '竖屏：驱逐舰对射，鱼雷水柱',
    'x6': '上下分屏：重巡三对三混战，雾岛沉入铁底湾',
    'x7': '上下分屏：结算「胜利 / 战败」，片尾卡',
}
