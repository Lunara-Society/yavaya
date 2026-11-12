# tools/depth

The pictures behind the home page's "Distritos en 3D" look
(`platform/docs/DISTRICTS-3D.md`). Everything runs on this machine.

```bash
# Depth maps (one per card photograph)
python3 -m venv venv && venv/bin/pip install onnxruntime pillow numpy
curl -L -o model.onnx https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
venv/bin/python -I tools/depth/make-depth.py model.onnx platform/public/art

# Medallions (one per district mark; Blender 4.5 LTS)
node tools/depth/glyphs.cjs out/glyphs.json
blender -b --python tools/depth/medallions.py -- out/glyphs.json out/
venv/bin/python -I tools/depth/finish-medallions.py out/ platform/public/art/depth
```

Run the first after replacing a card photograph, the second after changing a
district's mark in `platform/src/ui/site/home.tsx` or adding a district.
