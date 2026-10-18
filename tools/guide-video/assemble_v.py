# Final 9:16 cuts for social media, with the same mixes as the 16:9 films:
# each district with its end card, the stitched guide, and the intro teaser.
import json, os, subprocess, sys
from plan import ORDER
from render_v import TEASER_START
from teaser_audio import TAIL

HERE = os.path.dirname(os.path.abspath(__file__))
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
TL = json.load(open(os.path.join(HERE, "timeline.json")))
SCH = json.load(open(os.path.join(HERE, "schedule.json")))
OUT = os.path.join(HERE, "out_v")
os.makedirs(OUT, exist_ok=True)
# Platforms re-encode whatever they get, so they get plenty to work from.
ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-profile:v", "high", "-level", "4.2", "-pix_fmt", "yuv420p",
       "-g", "60", "-keyint_min", "30", "-maxrate", "9M", "-bufsize", "18M", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart"]

def run(cmd):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y"] + cmd, check=True)

def poster(video, at, name):
    run(["-ss", f"{at:.2f}", "-i", video, "-frames:v", "1", "-q:v", "2", os.path.join(OUT, name)])

def section(key):
    tl = TL[key]
    total = tl["total"]
    t_end = tl["vo_offset"] + tl["vo_duration"] + 0.5
    filt = (f"[1:v]format=rgba,fade=in:st={t_end:.3f}:d=0.9:alpha=1[e];"
            f"[0:v][e]overlay=0:0:enable='gte(t,{t_end:.3f})'[o];"
            f"[o]hqdn3d=1.5:1.2:5:4,fade=in:st=0:d=0.4,fade=out:st={total - 0.8:.3f}:d=0.8,format=yuv420p[v]")
    name = f"{key}-v1-916.mp4"
    run(["-i", f"core_v/{key}.mp4", "-loop", "1", "-t", f"{total:.3f}", "-i", "ov_v/end_section.png", "-i", f"audio/{key}.wav",
         "-filter_complex", filt, "-map", "[v]", "-map", "2:a", "-t", f"{total:.3f}"] + ENC + [os.path.join(OUT, name)])
    poster(os.path.join(OUT, name), 2.6, f"{key}-v1-916.jpg")

def guide():
    xf = SCH["xfade"]
    inputs, parts = [], []
    for i, k in enumerate(ORDER):
        inputs += ["-i", f"core_v/{k}.mp4"]
        parts.append(f"[{i}:v]trim=0:{SCH['cuts'][k]:.3f},setpts=PTS-STARTPTS,fps=30,format=yuv420p[s{i}]")
    chain, prev = [], "s0"
    for i, k in enumerate(ORDER[1:], 1):
        chain.append(f"[{prev}][s{i}]xfade=transition=fade:duration={xf}:offset={SCH['starts'][k]:.3f}[x{i}]")
        prev = f"x{i}"
    filt = ";".join(parts + chain) + f";[{prev}]hqdn3d=1.5:1.2:5:4[v]"
    n = len(ORDER)
    run(inputs + ["-i", "audio/guia.wav", "-filter_complex", filt, "-map", "[v]", "-map", f"{n}:a", "-t", f"{SCH['length']:.3f}"]
        + ENC + [os.path.join(OUT, "guia-v1-916.mp4")])

def teaser():
    tl = TL["intro"]
    length = tl["total"] - TEASER_START + TAIL
    t_end = tl["vo_offset"] + tl["vo_duration"] + 0.4 - TEASER_START
    filt = (f"[0:v]tpad=stop_mode=clone:stop_duration={TAIL + 0.5}[p];"
            f"[1:v]format=rgba,fade=in:st={t_end:.3f}:d=0.9:alpha=1[e];"
            f"[p][e]overlay=0:0:enable='gte(t,{t_end:.3f})'[o];"
            f"[o]hqdn3d=1.5:1.2:5:4,fade=out:st={length - 0.8:.3f}:d=0.8,format=yuv420p[v]")
    run(["-i", "core_v/intro-teaser.mp4", "-loop", "1", "-t", f"{length:.3f}", "-i", "ov_v/end_final.png", "-i", "audio/teaser.wav",
         "-filter_complex", filt, "-map", "[v]", "-map", "2:a", "-t", f"{length:.3f}"] + ENC + [os.path.join(OUT, "intro-v1-916.mp4")])
    poster(os.path.join(OUT, "intro-v1-916.mp4"), 1.2, "intro-v1-916.jpg")

if __name__ == "__main__":
    os.chdir(HERE)
    for t in sys.argv[1:] or ORDER[1:-1] + ["teaser", "guia"]:
        {"guia": guide, "teaser": teaser}.get(t, lambda: section(t))()
        print("done", t, flush=True)
