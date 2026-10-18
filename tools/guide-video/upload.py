# Puts finished guide videos into the media bucket through /api/ops/guide-upload,
# in 8 MB parts, three at a time, retrying a part a few times before giving up.
# The token is read from a local file and never printed.
import json, os, sys, time, ssl, urllib.request, concurrent.futures as cf

BASE = os.environ.get("GUIDE_BASE", "https://yavaya.lat")
TOKEN = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".upload_token")).read().strip()
PART = 8 * 1024 * 1024
CTX = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE"))

def call(method, path, body=None, ctype="application/json", tries=5):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(BASE + path, data=body, method=method, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": ctype})
            with urllib.request.urlopen(req, context=CTX, timeout=180) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 404, 413): raise
            time.sleep(2 ** attempt)
        except Exception:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"{method} {path} failed after {tries} tries")

def upload(path):
    name = os.path.basename(path)
    size = os.path.getsize(path)
    up = call("POST", "/api/ops/guide-upload", json.dumps({"action": "start", "file": name}).encode())["uploadId"]
    n = (size + PART - 1) // PART
    def send(i):
        with open(path, "rb") as f:
            f.seek(i * PART); chunk = f.read(PART)
        q = f"/api/ops/guide-upload?file={name}&uploadId={urllib.parse.quote(up)}&part={i + 1}"
        return {"partNumber": i + 1, "etag": call("PUT", q, chunk, "application/octet-stream")["etag"]}
    import urllib.parse
    with cf.ThreadPoolExecutor(3) as ex:
        parts = list(ex.map(send, range(n)))
    call("POST", "/api/ops/guide-upload", json.dumps({"action": "complete", "file": name, "uploadId": up, "parts": parts}).encode())
    print(f"uploaded {name} ({size / 1e6:.1f} MB, {n} parts)", flush=True)

if __name__ == "__main__":
    for p in sys.argv[1:]:
        upload(p)
