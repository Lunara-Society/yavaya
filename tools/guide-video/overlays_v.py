# Vertical (1080x1920) overlays for the 9:16 cuts. Layout keeps clear of the platforms' own UI:
# nothing important in the top 220 px, the bottom 330 px or the right-hand rail of icons.
#   title card ........ upper zone (only in a section's first seconds)
#   callouts .......... just above the captions
#   captions .......... drawn by render_v.py, lower-middle
#   real screens ...... a large browser card in the upper half, over a blurred scene
import json, glob, os, html
from plan import SECTIONS, ORDER

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = "/home/user/yavaya/platform/public"
OUT = os.path.join(HERE, "ov_v")
os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1920

FONTS = f"""
@font-face {{ font-family: Fraunces; src: url(file://{PUB}/fonts/fraunces.woff2) format('woff2'); font-weight: 100 900; }}
@font-face {{ font-family: Jakarta; src: url(file://{PUB}/fonts/jakarta.woff2) format('woff2'); font-weight: 200 800; }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ background: transparent; width: {W}px; height: {H}px; overflow: hidden; color: #fff; }}
.gold {{ background: linear-gradient(180deg, #fbe7a1 0%, #e9c95c 45%, #b8892a 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }}
"""
def page(body, css=""):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONTS}{css}</style></head><body>{body}</body></html>"""

jobs = []
def emit(name, doc, transparent=True):
    path = os.path.join(OUT, name + ".html")
    open(path, "w").write(doc)
    jobs.append({"html": path, "png": os.path.join(OUT, name + ".png"), "w": W, "h": H, "transparent": transparent})

TITLE_CSS = """
.scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,10,22,.86) 0%, rgba(5,10,22,.62) 24%, rgba(5,10,22,0) 46%); }
.card { position: absolute; left: 76px; right: 120px; top: 250px; }
.eyebrow { font: 600 27px Jakarta; letter-spacing: .3em; text-transform: uppercase; color: #e9c95c; display: flex; align-items: center; gap: 20px; }
.eyebrow i { display: block; width: 60px; height: 2px; background: linear-gradient(90deg, #e9c95c, rgba(233,201,92,.2)); }
h1 { font: 600 132px/1.0 Fraunces; letter-spacing: -.01em; margin-top: 16px; text-shadow: 0 6px 40px rgba(0,0,0,.35); }
p { font: 500 40px/1.3 Jakarta; color: rgba(255,255,255,.95); margin-top: 18px; text-shadow: 0 2px 18px rgba(0,0,0,.7); }
"""
for key in ORDER:
    s = SECTIONS[key]
    if not s["title"]:
        continue
    body = f"""<div class="scrim"></div><div class="card"><div class="eyebrow"><i></i>Guía Yavaya · {s['num']}</div>
<h1 class="gold">{html.escape(s['title'])}</h1><p>{html.escape(s['tagline'])}</p></div>"""
    emit(f"title_{key}", page(body, TITLE_CSS))

CALL_CSS = """
.wrap { position: absolute; left: 60px; right: 110px; bottom: 640px; display: flex; justify-content: center; }
.chip { display: flex; align-items: stretch; max-width: 910px;
  background: linear-gradient(135deg, rgba(8,17,32,.86), rgba(8,17,32,.70)); border: 1px solid rgba(233,201,92,.42);
  border-radius: 24px; box-shadow: 0 24px 70px rgba(0,0,0,.5); overflow: hidden; }
.bar { width: 8px; flex: none; background: linear-gradient(180deg, #fbe7a1, #c99a2e); }
.txt { padding: 24px 34px 26px 28px; }
.k { font: 700 21px Jakarta; letter-spacing: .28em; text-transform: uppercase; color: #e9c95c; }
.v { font: 700 44px/1.22 Jakarta; color: #fff; margin-top: 8px; }
"""
for key in ORDER:
    for i, (_, text) in enumerate(SECTIONS[key]["callouts"]):
        label = SECTIONS[key]["title"] or "Yavaya"
        body = f"""<div class="wrap"><div class="chip"><div class="bar"></div><div class="txt"><div class="k">{html.escape(label)}</div><div class="v">{html.escape(text)}</div></div></div></div>"""
        emit(f"call_{key}_{i}", page(body, CALL_CSS))

CHAPTERS = ["Mercadito", "Servicios", "Trabajo", "YavayaGo · viajes y mandados", "Comunidad", "Espacio Violeta", "Santuario", "Animales", "Confianza"]
LIST_CSS = """
.scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,10,22,.35) 0%, rgba(5,10,22,.80) 22%, rgba(5,10,22,.80) 62%, rgba(5,10,22,.2) 78%); }
.panel { position: absolute; left: 96px; right: 140px; top: 330px; }
.head { font: 600 27px Jakarta; letter-spacing: .3em; text-transform: uppercase; color: #e9c95c; margin-bottom: 22px; }
.item { display: flex; align-items: baseline; gap: 26px; padding: 13px 0; border-bottom: 1px solid rgba(255,255,255,.09); }
.n { font: 600 24px Jakarta; letter-spacing: .1em; width: 46px; color: rgba(255,255,255,.3); }
.t { font: 500 50px/1.12 Fraunces; color: rgba(255,255,255,.3); }
.on .n { color: #e9c95c; } .on .t { color: #fff; text-shadow: 0 0 30px rgba(233,201,92,.35); }
"""
for lit in range(len(CHAPTERS) + 1):
    items = "".join(f"""<div class="item{' on' if i < lit else ''}"><span class="n">{i + 1:02d}</span><span class="t">{html.escape(c)}</span></div>""" for i, c in enumerate(CHAPTERS))
    emit(f"list_{lit}", page(f"""<div class="scrim"></div><div class="panel"><div class="head">En esta guía</div>{items}</div>""", LIST_CSS))

END_CSS = """
.bg { position: absolute; inset: 0; background: radial-gradient(80% 60% at 50% 42%, rgba(8,17,32,.72), rgba(5,10,22,.94)); }
.c { position: absolute; left: 0; right: 0; top: 380px; display: flex; flex-direction: column; align-items: center; text-align: center; }
img { width: 330px; height: 330px; filter: drop-shadow(0 0 60px rgba(233,201,92,.35)); }
h2 { font: 600 128px Fraunces; letter-spacing: .14em; margin-top: 26px; }
.url { font: 700 58px Jakarta; color: #fff; margin-top: 10px; letter-spacing: .02em; }
.tag { font: 600 23px Jakarta; letter-spacing: .26em; text-transform: uppercase; color: #e9c95c; margin-top: 28px; padding: 0 70px; line-height: 1.6; }
.cta { font: 600 40px/1.3 Jakarta; color: rgba(255,255,255,.95); margin-top: 34px; padding: 0 90px; }
.fine { position: absolute; top: 1440px; left: 90px; right: 90px; text-align: center; font: 400 22px/1.45 Jakarta; color: rgba(255,255,255,.55); }
"""
FINE = "Las fotografías son escenas ilustrativas creadas para Yavaya: no muestran miembros, vendedores ni publicaciones reales."
def endcard(name, cta):
    body = f"""<div class="bg"></div><div class="c"><img src="file://{PUB}/brand/seal-768.webp"><h2 class="gold">YAVAYA</h2>
<div class="url">yavaya.lat</div><div class="tag">Una cuenta · Una reputación · Un ecosistema</div><div class="cta">{html.escape(cta)}</div></div><div class="fine">{FINE}</div>"""
    emit(name, page(body, END_CSS))
endcard("end_section", "Crear tu cuenta es gratis.")
endcard("end_final", "Crea tu cuenta gratis y elige tu distrito.")

# Real screens: the content column of the page, large enough to read on a phone, in a browser card.
FRAME_CSS = """
html, body { background: #050a16; }
.bg { position: absolute; inset: -80px; background-size: cover; background-position: center; filter: blur(44px) brightness(.40) saturate(1.25); }
.glow { position: absolute; inset: 0; background: radial-gradient(60% 40% at 50% 34%, rgba(233,201,92,.18), rgba(0,0,0,0) 70%); }
.win { position: absolute; left: 24px; right: 24px; top: 290px; border-radius: 26px; overflow: hidden;
  box-shadow: 0 50px 140px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.12); background: #0b1424; }
.bar { height: 60px; display: flex; align-items: center; gap: 12px; padding: 0 22px; background: linear-gradient(180deg, #121d31, #0d1626); border-bottom: 1px solid rgba(255,255,255,.06); }
.dot { width: 14px; height: 14px; border-radius: 50%; background: #3a4558; }
.url { margin-left: 16px; flex: 1; height: 38px; border-radius: 19px; background: rgba(255,255,255,.06); display: flex; align-items: center; gap: 12px; padding: 0 18px;
  font: 500 23px Jakarta; color: rgba(255,255,255,.85); white-space: nowrap; overflow: hidden; }
.lock { width: 13px; height: 15px; border: 2.5px solid #9fb0c8; border-radius: 3px; position: relative; top: 1px; flex: none; }
.view { width: 1032px; height: 740px; overflow: hidden; position: relative; }
/* the page's content column (x 300-2580 of the 2880 px capture) across the card */
.view img { position: absolute; width: 2880px; height: 1800px; left: -300px; top: 0; transform: scale(.4526); transform-origin: 300px 0; }
"""
PATHS = {"home": "", "mercadito": "mercadito", "mercadito-about": "mercadito/about", "services": "services", "services-new": "services/new",
  "services-about": "services/about", "work": "work", "work-principles": "work", "yavayago": "yavayago", "yavayago-trust": "yavayago",
  "viajes": "yavayago/viajes", "viajes-how": "yavayago/viajes", "community-about": "community/about", "community-new": "community/new",
  "violeta": "violeta", "violeta-protect": "violeta", "sanctuary-light": "sanctuary", "animals": "animals", "animals-learn": "animals/learn",
  "animals-lost": "animals/lost", "trust": "trust", "reputation": "reputation", "tokens": "tokens", "status": "status"}
UI_SHOTS = {}
for key in ORDER:
    for _, src in SECTIONS[key]["shots"]:
        if src.startswith("ui:"):
            UI_SHOTS.setdefault(src[3:], key)
for name, key in UI_SHOTS.items():
    bg = sorted(glob.glob(os.path.join(HERE, "img", SECTIONS[key]["bg"] + "__*.png")))[0]
    body = f"""<div class="bg" style="background-image:url(file://{bg})"></div><div class="glow"></div>
<div class="win"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span>
<div class="url"><span class="lock"></span>yavaya.lat/{PATHS[name]}</div></div><div class="view"><img src="file://{HERE}/ui/{name}.png"></div></div>"""
    emit(f"ui_{name}", page(body, FRAME_CSS), transparent=False)

json.dump(jobs, open(os.path.join(HERE, "ov_jobs_v.json"), "w"), indent=1)
print(len(jobs), "vertical overlays")
