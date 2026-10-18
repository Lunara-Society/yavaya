# Compare each take's transcript with its script (word error rate on normalised words)
# and report the differing words, so a misread take is caught without listening.
import json, glob, re, unicodedata, difflib
def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.findall(r"[a-z0-9ñ]+", s)
scripts = {x['key']: x for x in json.load(open('scripts.json'))}
best = {}
for f in sorted(glob.glob('vo/*.words.json')):
    key = f.split('/')[-1].split('__')[0]
    words = json.load(open(f))
    hyp = norm(' '.join(w['w'] for w in words))
    ref = norm(re.sub(r'\[[^\]]+\]', ' ', scripts[key]['tts']))
    sm = difflib.SequenceMatcher(a=ref, b=hyp, autojunk=False)
    errs = [(op, ' '.join(ref[i1:i2]), ' '.join(hyp[j1:j2])) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != 'equal']
    n = sum(max(i2 - i1, j2 - j1) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != 'equal')
    wer = n / len(ref)
    dur = words[-1]['e']
    print(f"{f.split('/')[-1][:40]:40} wer={wer:.3f} dur={dur:.1f}")
    for e in errs: print('    ', e)
    if key not in best or wer < best[key][1]:
        best[key] = (f.replace('.words.json', '.mp3'), wer)
json.dump({k: v[0] for k, v in best.items()}, open('best_takes.json', 'w'), indent=1)
