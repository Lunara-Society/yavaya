# Local transcription with word timestamps, to check takes (tags read aloud, misreadings) and time captions.
import json, sys, os
from faster_whisper import WhisperModel
m = WhisperModel("medium", device="cpu", compute_type="int8")
for path in sys.argv[1:]:
    segs, info = m.transcribe(path, language="es", word_timestamps=True, beam_size=5, vad_filter=False)
    words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for s in segs for w in s.words]
    out = os.path.splitext(path)[0] + ".words.json"
    json.dump(words, open(out, "w"), ensure_ascii=False)
    print("==", path, len(words))
    print(" ".join(w["w"] for w in words))
