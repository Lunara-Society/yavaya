# Writes one HTML file per overlay (transparent, 1920x1080) and per framed screen (opaque, 2400x1350),
# then ovshot.cjs renders them with Chromium so every letter is in Yavaya's own fonts.
import json, glob, os, html
from plan import SECTIONS, ORDER

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = "/home/user/yavaya/platform/public"
OUT = os.path.join(HERE, "ov")
os.makedirs(OUT, exist_ok=True)

FONTS = f"""
@font-face {{ font-family: Fraunces; src: url(file://{PUB}/fonts/fraunces.woff2) format('woff2'); font-weight: 100 900; }}
@font-face {{ font-family: Jakarta; src: url(file://{PUB}/fonts/jakarta.woff2) format('woff2'); font-weight: 200 800; }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ background: transparent; width: 1920px; height: 1080px; overflow: hidden; }}
.gold {{ background: linear-gradient(180deg, #fbe7a1 0%, #e9c95c 45%, #b8892a 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }}
"""

def page(body, css="", w=1920, h=1080):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONTS}
html, body {{ width: {w}px; height: {h}px; }} {css}</style></head><body>{body}</body></html>"""

jobs = []
def emit(name, doc, w=1920, h=1080, transparent=True):
    path = os.path.join(OUT, name + ".html")
    open(path, "w").write(doc)
    jobs.append({"html": path, "png": os.path.join(OUT, name + ".png"), "w": w, "h": h, "transparent": transparent})

# Section title card: lower-left, over a soft scrim so it reads on any picture.
TITLE_CSS = """
.scrim { position: absolute; inset: 0; background: radial-gradient(120% 90% at 0% 100%, rgba(5,10,22,.82) 0%, rgba(5,10,22,.55) 38%, rgba(5,10,22,0) 70%); }
.card { position: absolute; left: 132px; bottom: 150px; }
.eyebrow { font: 600 26px Jakarta; letter-spacing: .32em; text-transform: uppercase; color: #e9c95c; display: flex; align-items: center; gap: 22px; }
.eyebrow i { display: block; width: 64px; height: 2px; background: linear-gradient(90deg, #e9c95c, rgba(233,201,92,.2)); }
h1 { font: 600 148px/1.02 Fraunces; letter-spacing: -.01em; margin-top: 18px; text-shadow: 0 6px 40px rgba(0,0,0,.35); }
p { font: 400 38px/1.35 Jakarta; color: rgba(255,255,255,.92); margin-top: 18px; max-width: 1180px; text-shadow: 0 2px 18px rgba(0,0,0,.6); }
"""
for key in ORDER:
    s = SECTIONS[key]
    if not s["title"]:
        continue
    body = f"""<div class="scrim"></div><div class="card"><div class="eyebrow"><i></i>Guía Yavaya · {s['num']}</div>
<h1 class="gold">{html.escape(s['title'])}</h1><p>{html.escape(s['tagline'])}</p></div>"""
    emit(f"title_{key}", page(body, TITLE_CSS))

# Callout chip: lower-left glass card with a gold rule; short, factual, from the live site.
CALL_CSS = """
.chip { position: absolute; left: 110px; bottom: 112px; display: flex; align-items: stretch; max-width: 1240px;
  background: linear-gradient(135deg, rgba(8,17,32,.80), rgba(8,17,32,.62)); border: 1px solid rgba(233,201,92,.38);
  border-radius: 22px; box-shadow: 0 24px 70px rgba(0,0,0,.45); overflow: hidden; }
.bar { width: 7px; background: linear-gradient(180deg, #fbe7a1, #c99a2e); }
.txt { padding: 26px 40px 28px 30px; }
.k { font: 700 19px Jakarta; letter-spacing: .3em; text-transform: uppercase; color: #e9c95c; }
.v { font: 600 42px/1.25 Jakarta; color: #fff; margin-top: 8px; }
"""
for key in ORDER:
    for i, (_, text) in enumerate(SECTIONS[key]["callouts"]):
        label = SECTIONS[key]["title"] or "Yavaya"
        body = f"""<div class="chip"><div class="bar"></div><div class="txt"><div class="k">{html.escape(label)}</div><div class="v">{html.escape(text)}</div></div></div>"""
        emit(f"call_{key}_{i}", page(body, CALL_CSS))

# Intro chapter list: the nine stops of the guide light up as the narrator names them.
CHAPTERS = ["Mercadito", "Servicios", "Trabajo", "YavayaGo · viajes y mandados", "Comunidad", "Espacio Violeta", "Santuario", "Animales", "Confianza"]
LIST_CSS = """
.scrim { position: absolute; inset: 0; background: linear-gradient(270deg, rgba(5,10,22,.86) 0%, rgba(5,10,22,.7) 34%, rgba(5,10,22,0) 62%); }
.panel { position: absolute; right: 150px; top: 50%; transform: translateY(-50%); width: 640px; }
.head { font: 600 24px Jakarta; letter-spacing: .32em; text-transform: uppercase; color: #e9c95c; margin-bottom: 26px; }
.item { display: flex; align-items: baseline; gap: 26px; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
.n { font: 600 22px Jakarta; letter-spacing: .1em; width: 44px; color: rgba(255,255,255,.28); }
.t { font: 500 44px/1.15 Fraunces; color: rgba(255,255,255,.28); }
.on .n { color: #e9c95c; } .on .t { color: #fff; text-shadow: 0 0 30px rgba(233,201,92,.35); }
"""
for lit in range(len(CHAPTERS) + 1):
    items = "".join(f"""<div class="item{' on' if i < lit else ''}"><span class="n">{i + 1:02d}</span><span class="t">{html.escape(c)}</span></div>""" for i, c in enumerate(CHAPTERS))
    emit(f"list_{lit}", page(f"""<div class="scrim"></div><div class="panel"><div class="head">En esta guía</div>{items}</div>""", LIST_CSS))

# End card for each district video, and the closing card of the full guide.
END_CSS = """
.bg { position: absolute; inset: 0; background: radial-gradient(70% 70% at 50% 45%, rgba(8,17,32,.70), rgba(5,10,22,.93)); }
.c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
img { width: 300px; height: 300px; filter: drop-shadow(0 0 60px rgba(233,201,92,.35)); }
h2 { font: 600 112px Fraunces; letter-spacing: .14em; margin-top: 24px; }
.url { font: 600 46px Jakarta; color: #fff; margin-top: 10px; letter-spacing: .02em; }
.tag { font: 600 22px Jakarta; letter-spacing: .3em; text-transform: uppercase; color: #e9c95c; margin-top: 26px; }
.cta { font: 500 34px Jakarta; color: rgba(255,255,255,.92); margin-top: 28px; }
.fine { position: absolute; bottom: 46px; left: 0; right: 0; text-align: center; font: 400 21px Jakarta; color: rgba(255,255,255,.55); }
"""
FINE = "Las fotografías son escenas ilustrativas creadas para Yavaya: no muestran miembros, vendedores ni publicaciones reales."
def endcard(name, cta):
    body = f"""<div class="bg"></div><div class="c"><img src="file://{PUB}/brand/seal-768.webp"><h2 class="gold">YAVAYA</h2>
<div class="url">yavaya.lat</div><div class="tag">Una cuenta · Una reputación · Un ecosistema</div><div class="cta">{html.escape(cta)}</div></div><div class="fine">{FINE}</div>"""
    emit(name, page(body, END_CSS))
endcard("end_section", "Crear tu cuenta es gratis.")
endcard("end_final", "Crea tu cuenta gratis y elige tu distrito.")

# Real screens, framed in a browser window over a blurred scene from the same section.
FRAME_CSS = """
html, body { background: #050a16; }
.bg { position: absolute; inset: -60px; background-size: cover; background-position: center; filter: blur(38px) brightness(.42) saturate(1.25); }
.glow { position: absolute; inset: 0; background: radial-gradient(55% 55% at 50% 52%, rgba(233,201,92,.16), rgba(0,0,0,0) 70%); }
.win { position: absolute; left: 50%; top: 50%; width: 1880px; transform: translate(-50%, -50%); border-radius: 26px; overflow: hidden;
  box-shadow: 0 50px 140px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.10); background: #0b1424; }
.bar { height: 66px; display: flex; align-items: center; gap: 14px; padding: 0 26px; background: linear-gradient(180deg, #121d31, #0d1626); border-bottom: 1px solid rgba(255,255,255,.06); }
.dot { width: 16px; height: 16px; border-radius: 50%; background: #3a4558; }
.url { margin-left: 26px; flex: 1; max-width: 900px; height: 40px; border-radius: 20px; background: rgba(255,255,255,.06); display: flex; align-items: center; gap: 12px; padding: 0 20px;
  font: 500 22px Jakarta; color: rgba(255,255,255,.82); }
.lock { width: 14px; height: 16px; border: 2.5px solid #9fb0c8; border-radius: 3px; position: relative; top: 2px; }
.shot { display: block; width: 1880px; }
"""
UI_SHOTS = {}
for key in ORDER:
    for _, src in SECTIONS[key]["shots"]:
        if src.startswith("ui:"):
            UI_SHOTS.setdefault(src[3:], key)
PATHS = {"home": "", "mercadito": "mercadito", "mercadito-about": "mercadito/about", "services": "services", "services-new": "services/new",
  "services-about": "services/about", "work": "work", "work-principles": "work", "yavayago": "yavayago", "yavayago-trust": "yavayago",
  "viajes": "yavayago/viajes", "viajes-how": "yavayago/viajes", "community-about": "community/about", "community-new": "community/new",
  "violeta": "violeta", "violeta-protect": "violeta", "sanctuary-light": "sanctuary", "animals": "animals", "animals-learn": "animals/learn",
  "animals-lost": "animals/lost", "trust": "trust", "reputation": "reputation", "tokens": "tokens", "status": "status"}
for name, key in UI_SHOTS.items():
    bg = sorted(glob.glob(os.path.join(HERE, "img", SECTIONS[key]["bg"] + "__*.png")))[0]
    body = f"""<div class="bg" style="background-image:url(file://{bg})"></div><div class="glow"></div>
<div class="win"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span>
<div class="url"><span class="lock"></span>yavaya.lat/{PATHS[name]}</div></div><img class="shot" src="file://{HERE}/ui/{name}.png"></div>"""
    emit(f"ui_{name}", page(body, FRAME_CSS, 2400, 1350), 2400, 1350, transparent=False)

json.dump(jobs, open(os.path.join(HERE, "ov_jobs.json"), "w"), indent=1)
print(len(jobs), "overlays")
