"""LaMa (big-lama, TorchScript) inpainting on CPU.

usage: lama.py image.png mask.png out.png
The mask is white where the picture must be rebuilt. Only masked pixels change:
the result is composited back over the original, so everything outside the
mask stays exactly as it was.
"""
import sys
import numpy as np
import torch
from PIL import Image, ImageFilter

torch.set_num_threads(4)
here = __file__.rsplit('/', 1)[0]
model = torch.jit.load(here + '/models/big-lama.pt', map_location='cpu').eval()


def pad8(a):
    h, w = a.shape[:2]
    ph, pw = (8 - h % 8) % 8, (8 - w % 8) % 8
    return np.pad(a, ((0, ph), (0, pw)) + ((0, 0),) * (a.ndim - 2), mode='symmetric'), h, w


@torch.no_grad()
def inpaint(img, mask):
    a = np.asarray(img.convert('RGB'), dtype=np.float32) / 255.0
    m = (np.asarray(mask.convert('L'), dtype=np.float32) > 127).astype(np.float32)
    a8, h, w = pad8(a)
    m8, _, _ = pad8(m)
    x = torch.from_numpy(a8).permute(2, 0, 1)[None]
    mk = torch.from_numpy(m8)[None, None]
    out = model(x, mk)[0].permute(1, 2, 0).numpy()[:h, :w]
    out = np.clip(out, 0, 1)
    # Feathered composite: a soft edge of a few pixels, so the seam never shows.
    soft = np.asarray(mask.convert('L').filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32)[..., None] / 255.0
    res = a * (1 - soft) + out * soft
    return Image.fromarray((res * 255).round().astype(np.uint8))


if __name__ == '__main__':
    img, mask, dst = sys.argv[1:4]
    inpaint(Image.open(img), Image.open(mask)).save(dst)
    print('inpainted', dst)
