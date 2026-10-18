# Download every finished generation listed in a saved run-status JSON.
# Usage: fetch.py status.json outdir [prefix-map.json]
# Files are named <node or prompt key>__<generation_id>.<ext>; a map from prompt prefix to a short name is optional.
import json, sys, os, urllib.request
src, outdir = sys.argv[1], sys.argv[2]
names = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
d = json.load(open(src))
if isinstance(d, list):  # tool-result wrapper
    d = json.loads(d[0]["text"])
os.makedirs(outdir, exist_ok=True)
print("all_completed", d.get("all_completed"), "failures", d.get("has_failures"))
for m in d.get("media", []):
    prompt = m.get("prompt", "")
    key = next((v for k, v in names.items() if prompt.startswith(k)), "x")
    ext = {"audio": "mp3", "image": "png", "video": "mp4"}.get(m["kind"], "bin")
    url = m.get("master_url") or m["url"]
    path = os.path.join(outdir, f"{key}__{m['generation_id']}.{ext}")
    if not os.path.exists(path):
        urllib.request.urlretrieve(url, path)
    n = globals().get("n", 0) + 1; globals()["n"] = n
print("downloaded", globals().get("n", 0))
