#!/usr/bin/env python3
"""Joins the candle's layers into the files the site serves (docs/sanctuary/CANDLE.md, README.md).

    python3 compose.py <blender frames dir> <hyperframes renders dir> <out dir>

Per clip (720 × 1280, 30 fps, 4 s): HyperFrames' atmosphere behind; Blender's candle (RGBA) over it; a bloom
taken from the candle's own brightest light (the flame), blurred twice and screened on; HyperFrames' descending
light screened on top (lighting only); a little grain, so the dark gradients do not band once compressed.

The lighting's frames 0–50 are the unlit still (nothing moves in the candle before it catches), 51–109 the
catching, 110–119 the loop's own frames (the flame has settled; same phase); the loop is frames 0–119.
"""
import os, subprocess, sys, tempfile

frames, renders, out = (os.path.abspath(p) for p in sys.argv[1:4])
os.makedirs(out, exist_ok=True)
CATCH, SETTLED, LOOP = 51, 110, 120


def sequence(names):
    d = tempfile.mkdtemp(prefix='candle-seq-')
    for i, name in enumerate(names):
        os.symlink(os.path.join(frames, name), os.path.join(d, f'{i:04d}.png'))
    return d


def compose(seq, atmosphere, descent, output):
    inputs = ['-framerate', '30', '-i', os.path.join(seq, '%04d.png'), '-i', atmosphere]
    graph = [
        '[1:v]scale=720:1280:flags=lanczos,format=gbrp[bg]',
        '[0:v]format=rgba,split[c][cg]',
        # The bloom: only the brightest light (the flame and the wax nearest it) on black, blurred near and far.
        'color=c=black:s=720x1280:r=30[k]',
        '[k][cg]overlay=format=auto:shortest=1,format=gbrp,lutrgb=r=\'clip((val-170)*3,0,255)\':g=\'clip((val-170)*3,0,255)\':b=\'clip((val-170)*3,0,255)\',split[h1][h2]',
        '[h1]gblur=sigma=22[g1]',
        '[h2]gblur=sigma=80[g2]',
        '[bg][c]overlay=format=auto:shortest=1,format=gbrp[base]',
        '[base][g1]blend=all_mode=screen:all_opacity=0.55[b1]',
        '[b1][g2]blend=all_mode=screen:all_opacity=0.5[b2]',
    ]
    last = 'b2'
    if descent:
        inputs += ['-i', descent]
        graph += ['[2:v]scale=720:1280:flags=lanczos,format=gbrp[fg]', '[b2][fg]blend=all_mode=screen[b3]']
        last = 'b3'
    graph += [f'[{last}]noise=alls=3:allf=t,format=yuv420p[out]']
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(graph), '-map', '[out]', '-frames:v', str(LOOP),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-g', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output], check=True)


lighting = ['unlit.png'] * CATCH + [f'light_{f:04d}.png' for f in range(CATCH, SETTLED)] + [f'loop_{f:04d}.png' for f in range(SETTLED, LOOP)]
loop = [f'loop_{f:04d}.png' for f in range(LOOP)]
which = sys.argv[4] if len(sys.argv) > 4 else 'all'
if which in ('all', 'light'):
    compose(sequence(lighting), os.path.join(renders, 'atmo-light.mp4'), os.path.join(renders, 'descent.mp4'), os.path.join(out, 'encender.mp4'))
if which in ('all', 'loop'):
    compose(sequence(loop), os.path.join(renders, 'atmo-loop.mp4'), None, os.path.join(out, 'arde.mp4'))
print('composed', which)
