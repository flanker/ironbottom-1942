import sys, os, glob
from PIL import Image, ImageDraw, ImageFont
# tsheet.py out.jpg every take1 take2 ...   (one row per take, label = seconds into take)
out, ev = sys.argv[1], int(sys.argv[2]); takes = sys.argv[3:]
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 18)
rows = []
for d in takes:
    fs = sorted(glob.glob(d + '/f*.jpg'))[::ev]
    pw = 1 if Image.open(fs[0]).width > Image.open(fs[0]).height else 0
    W, H = (256, 144) if pw else (108, 192)
    C = 12 if pw else 16; R = (len(fs) + C - 1) // C
    row = Image.new('RGB', (W * C, H * R + 22))
    g = ImageDraw.Draw(row); g.text((4, 2), os.path.basename(d), fill=(255, 255, 0), font=font)
    for i, f in enumerate(fs):
        im = Image.open(f).resize((W, H)); ImageDraw.Draw(im).text((3, 2), f'{i * ev / 30:.1f}', fill=(255, 255, 0), font=font); row.paste(im, ((i % C) * W, 22 + (i // C) * H))
    rows.append(row)
S = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows)))
y = 0
for r in rows: S.paste(r, (0, y)); y += r.height
S.save(out, quality=75); print(S.size)
