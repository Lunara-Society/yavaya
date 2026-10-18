# Final cuts. Each district: its picture, end card, fades and its own mix, in 1080p and 720p.
# The full guide: every section dissolving into the next over the one continuous score.
import json, os, subprocess, sys
from plan import ORDER

HERE = os.path.dirname(os.path.abspath(__file__))
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
TL = json.load(open(os.path.join(HERE, "timeline.json")))
SCH = json.load(open(os.path.join(HERE, "schedule.json")))
VERSION = 1
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

# Guide keys on the site (config/guide.ts) are the section keys; the full guide is "guia".
ENC_HD = ["-c:v", "libx264", "-preset", "slow", "-crf", "23", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
          "-g", "60", "-keyint_min", "30", "-maxrate", "5M", "-bufsize", "10M", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart"]
ENC_SD = ["-c:v", "libx264", "-preset", "slow", "-crf", "25", "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
          "-g", "60", "-keyint_min", "30", "-maxrate", "2500k", "-bufsize", "5M", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart"]

def run(cmd):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y"] + cmd, check=True)

def section(key):
    tl = TL[key]
    total = tl["total"]
    t_end = tl["vo_offset"] + tl["vo_duration"] + 0.5
    filt = (f"[1:v]format=rgba,fade=in:st={t_end:.3f}:d=0.9:alpha=1[e];"
            f"[0:v][e]overlay=0:0:enable='gte(t,{t_end:.3f})'[o];"
            f"[o]hqdn3d=2:1.5:6:5,fade=in:st=0:d=0.6,fade=out:st={total - 0.8:.3f}:d=0.8,format=yuv420p,split[hd][s];"
            f"[s]scale=1280:720:flags=lanczos[sd]")
    base = ["-i", f"core/{key}.mp4", "-loop", "1", "-t", f"{total:.3f}", "-i", "ov/end_section.png", "-i", f"audio/{key}.wav", "-filter_complex", filt]
    name = f"{key}-v{VERSION}"
    run(base + ["-map", "[hd]", "-map", "2:a", "-t", f"{total:.3f}"] + ENC_HD + [f"{OUT}/{name}.mp4",
                "-map", "[sd]", "-map", "2:a", "-t", f"{total:.3f}"] + ENC_SD + [f"{OUT}/{name}-720.mp4"])
    # poster: the title card over the first scene
    run(["-ss", "2.6", "-i", f"core/{key}.mp4", "-frames:v", "1", "-vf", "scale=1280:720:flags=lanczos", "-q:v", "3", f"{OUT}/{name}.jpg"])

def guide():
    xf = SCH["xfade"]
    inputs, parts = [], []
    for i, k in enumerate(ORDER):
        inputs += ["-i", f"core/{k}.mp4"]
        parts.append(f"[{i}:v]trim=0:{SCH['cuts'][k]:.3f},setpts=PTS-STARTPTS,fps=30,format=yuv420p[s{i}]")
    chain, prev = [], "s0"
    for i, k in enumerate(ORDER[1:], 1):
        out = f"x{i}"
        chain.append(f"[{prev}][s{i}]xfade=transition=fade:duration={xf}:offset={SCH['starts'][k]:.3f}[{out}]")
        prev = out
    filt = ";".join(parts + chain) + f";[{prev}]hqdn3d=2:1.5:6:5,split[hd][s];[s]scale=1280:720:flags=lanczos[sd]"
    n = len(ORDER)
    length = SCH["length"]
    name = f"guia-v{VERSION}"
    run(inputs + ["-i", "audio/guia.wav", "-filter_complex", filt,
                  "-map", "[hd]", "-map", f"{n}:a", "-t", f"{length:.3f}"] + ENC_HD + [f"{OUT}/{name}.mp4",
                  "-map", "[sd]", "-map", f"{n}:a", "-t", f"{length:.3f}"] + ENC_SD + [f"{OUT}/{name}-720.mp4"])

if __name__ == "__main__":
    os.chdir(HERE)
    targets = sys.argv[1:] or ORDER[1:-1] + ["guia"]
    for t in targets:
        guide() if t == "guia" else section(t)
        print("done", t, flush=True)
