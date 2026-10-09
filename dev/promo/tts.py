"""AI guide read, one mp3 per line: python3 dev/promo/tts.py  ($PROMO_PROD/lines.json → $PROMO_WORK/tts/{b,x}/NN_key.mp3 and a copy of lines.json)
Only for timing and as a reference track; the final narration is recorded by the author."""
import json, os, shutil, subprocess
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
W = os.environ.get('PROMO_WORK') or os.path.abspath('promo-work')
PROD = os.path.abspath(os.environ.get('PROMO_PROD') or os.path.join(REPO, 'dev/promo/productions/2026-10-duel'))
os.makedirs(f'{W}/tts', exist_ok=True)
src = f'{PROD}/lines.json'
shutil.copy(src, f'{W}/tts/lines.json')
for k, lines in json.load(open(src)).items():
    os.makedirs(f'{W}/tts/{k}', exist_ok=True)
    for f in os.listdir(f'{W}/tts/{k}'): os.remove(f'{W}/tts/{k}/{f}')
    for i, (n, t) in enumerate(lines):
        out = f'{W}/tts/{k}/{i:02d}_{n}.mp3'
        subprocess.run(['uvx', 'edge-tts', '--voice', 'zh-CN-YunxiNeural', '--rate=+0%', '--text', t, '--write-media', out], check=True, capture_output=True)
        d = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]))
        print(f'{k} {i:02d} {n:10s} {d:5.2f}s  {t}')
