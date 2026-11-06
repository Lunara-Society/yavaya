"""The owner's new logo (6 Nov 2026): the header mark, the icons and the share card.

Only crops and scaling: no pixel of the artwork is retouched. The mark is the
square around the Guardian's head, the orb and the arch (readable down to
16 px); the share card is the whole logo, centred on the site's obsidian.
"""
import os
from PIL import Image
# The owner's originals (src/), the 2480 px working copy and BiRefNet's mask (out/) are kept out
# of git (3840 px, about 30 MB); point OWNER_ART at the folder that holds them.
S = os.environ.get('OWNER_ART', 'owner-art')
PUB = '/home/user/yavaya/platform/public'
logo = Image.open(f'{S}/src/logo.png').convert('RGB')  # 2880×3840
K = 1.92
mark = logo.crop(tuple(round(v * K) for v in (380, 150, 1120, 890)))  # 1421 px square
mark.save(f'{S}/out/logo-mark-master.png')
os.makedirs(f'{PUB}/brand', exist_ok=True)
for w in (96, 192, 384):
    im = mark.resize((w, w), Image.LANCZOS)
    im.save(f'{PUB}/brand/logo-mark-{w}.webp', 'WEBP', quality=95, method=6)
    im.save(f'{PUB}/brand/logo-mark-{w}.avif', 'AVIF', quality=90, speed=4, subsampling='4:4:4')
for name, w in (('logo-icon-192.png', 192), ('logo-icon-512.png', 512), ('logo-icon-maskable-512.png', 512), ('logo-apple-touch-icon.png', 180)):
    mark.resize((w, w), Image.LANCZOS).save(f'{PUB}/{name}', optimize=True)
mark.resize((48, 48), Image.LANCZOS).save(f'{PUB}/logo-favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
# Share card, 1200×630: the whole logo at the card's height, on obsidian.
card = Image.new('RGB', (1200, 630), (7, 6, 10))
h = 630; w = round(logo.width * h / logo.height)
card.paste(logo.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, 0))
card.save(f'{PUB}/og-logo.jpg', quality=92, optimize=True, progressive=True)
# The whole logo, for anyone who needs it (press, partners): 1080 px wide.
logo.resize((1080, 1440), Image.LANCZOS).save(f'{PUB}/brand/logo-1080.webp', 'WEBP', quality=95, method=6)
for f in sorted(os.listdir(f'{PUB}/brand')):
    if f.startswith('logo'): print(f, os.path.getsize(f'{PUB}/brand/{f}') // 1024, 'KB')
for f in ('og-logo.jpg', 'logo-favicon.ico', 'logo-icon-512.png'):
    print(f, os.path.getsize(f'{PUB}/{f}') // 1024, 'KB')
