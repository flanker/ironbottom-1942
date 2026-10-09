"""Contact sheet of a frame folder: python3 dev/promo/sheet.py <dir> <out.jpg> <seconds per frame> [cols] [t0]"""
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont
d, out, step, cols = sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4]) if len(sys.argv) > 4 else 6
t0 = float(sys.argv[5]) if len(sys.argv) > 5 else 0
fs = sorted(glob.glob(os.path.join(d, 'f*.jpg')))
W, H = 384, 216
rows = (len(fs) + cols - 1) // cols
S = Image.new('RGB', (cols * W, rows * H))
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
for i, f in enumerate(fs):
    im = Image.open(f).resize((W, H)); g = ImageDraw.Draw(im)
    g.rectangle((0, 0, 80, 28), fill=(0, 0, 0)); g.text((4, 2), f'{t0 + i * step:.0f}', fill=(255, 255, 0), font=font)
    S.paste(im, ((i % cols) * W, (i // cols) * H))
S.save(out, quality=80)
print(out, len(fs))
