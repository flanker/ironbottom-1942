"""Deliverables for one edit: python3 dev/promo/export.py b|x <dest dir>  (SRT, 旁白稿.md, the mp4s, the AI guide track)"""
import json, os, shutil, subprocess, sys
from compose import SP, LINES, load_prod

def tc(t, srt=False):
    h, r = divmod(t, 3600); m, s = divmod(r, 60)
    return f'{int(h):02d}:{int(m):02d}:{s:06.3f}'.replace('.', ',') if srt else f'{int(m):d}:{s:04.1f}'


def main(k, dest):
    prod = load_prod(); PIC = prod['PIC']
    out = f'{SP}/out/{k}'; tl = json.load(open(f'{out}/timeline.json'))
    os.makedirs(dest, exist_ok=True)
    narr, total = tl['narr'], tl['total']
    text = LINES[k]
    # SRT: one cue per line, split at sentence punctuation into ≤ 2 cues of roughly even length
    cues = []
    for a, key, d in narr:
        t = text[key]
        parts = [p for p in __import__('re').split(r'(?<=[。！？；])', t) if p.strip()]
        n = sum(len(p) for p in parts); x = a
        for p in parts:
            dd = d * len(p) / n; cues.append((x, x + dd, p.rstrip('。；'))); x += dd
    with open(f'{dest}/旁白字幕.srt', 'w') as f:
        for i, (a, b, t) in enumerate(cues, 1): f.write(f'{i}\n{tc(a, True)} --> {tc(b, True)}\n{t}\n\n')
    name = prod['NAMES'][k]
    with open(f'{dest}/旁白稿.md', 'w') as f:
        f.write(f'# 铁底湾1942 联机对决 · {name} 旁白稿\n\n')
        f.write(f'全片 {tc(total)}（{total:.1f} 秒）。时间码是成片里这句话开始的位置，「参考时长」是 AI 试读的长度，你自己读快慢差半秒左右没关系，')
        f.write('视频里在每句旁白的位置已经把游戏声和音乐压低了，录完直接按时间码对上即可。\n\n')
        f.write(f'开头 0:00–{tc(prod["HOOK"][k])} 是精华片段，没有旁白。\n\n')
        f.write('| # | 开始 | 参考时长 | 台词 | 画面 |\n|---|---|---|---|---|\n')
        for i, (a, key, d) in enumerate(narr, 1):
            f.write(f'| {i} | {tc(a)} | {d:.1f}s | {text[key]} | {PIC.get(key, "")} |\n')
        f.write('\n## 纯台词（照着念）\n\n')
        for a, key, d in narr: f.write(f'[{tc(a)}] {text[key]}\n\n')
    shutil.copy(f'{out}/final.mp4', f'{dest}/{name}_游戏声音乐_无旁白.mp4')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f'{out}/guide.wav', '-af', 'loudnorm=I=-16:TP=-1.5', '-c:a', 'aac', '-b:a', '160k', f'{dest}/AI试读参考音轨_对齐成片.m4a'], check=True)
    shutil.copy(f'{out}/preview_with_guide.mp4', f'{dest}/预览_带AI试读_仅供对时间.mp4')
    print('exported', dest)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
