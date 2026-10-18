# Contact sheet: label each image with its file stem so picks can be named.
import sys, glob
from PIL import Image, ImageDraw
files = sorted(sum([glob.glob(p) for p in sys.argv[2:]], []))
W, H, cols = 480, 270, 4
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (W * cols, (H + 22) * rows), "black")
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB"); im.thumbnail((W, H))
    x, y = (i % cols) * W, (i // cols) * (H + 22)
    sheet.paste(im, (x, y + 22))
    d.text((x + 4, y + 4), f.split("/")[-1][:28], fill="yellow")
sheet.save(sys.argv[1], quality=85)
print(len(files))
