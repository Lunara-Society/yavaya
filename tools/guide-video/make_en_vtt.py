import json, os, sys
from captions_en import EN
from mix import write_vtt, TL
from plan import ORDER
HERE = os.path.dirname(os.path.abspath(__file__))
SCH = json.load(open(os.path.join(HERE, "schedule.json")))
dest = sys.argv[1]
def cues(k, off=0.0):
    src = TL[k]["cues"]
    assert len(src) == len(EN[k]), (k, len(src), len(EN[k]))
    return [(off + s, off + e, en) for (s, e, _), en in zip(src, EN[k])]
for k in ORDER[1:-1]:
    write_vtt(os.path.join(dest, f"{k}-v1.en.vtt"), cues(k))
allc = []
for k in ORDER:
    allc += cues(k, SCH["starts"][k])
write_vtt(os.path.join(dest, "guia-v1.en.vtt"), allc)
print("ok")
