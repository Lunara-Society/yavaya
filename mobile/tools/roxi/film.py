"""
Roxi materialises: a short vertical film for the app's first-run screen, the store
listing and the owner's posts (docs/synapse/ASSET_REGISTRY.md).

Blender 4.5 LTS, Cycles on the CPU, all of it on this machine:

    blender -b --python mobile/tools/roxi/film.py -- <mobile dir> <out dir> [frames]

`frames` is "all" (default) or a comma list for test stills, e.g. 30,70,120.

She is the owner's approved image on a surface raised by her estimated depth map,
so a moving camera sees her in relief rather than as a flat card. Light arrives
from the dark as particles and settles into her in the same order as the app's
reconstruction (reconstruct.ts): from her heart outward, near parts a touch
sooner, cell by cell. No asset from anywhere else is used.
"""
import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = Path(argv[0]) if argv else Path("mobile")
OUT = Path(argv[1]) if len(argv) > 1 else Path("/tmp/roxi-film")
WHICH = argv[2] if len(argv) > 2 else "all"

FPS = 24
FRAMES = 144                  # 6 seconds
FORM_START, FORM_END = 6, 100 # she forms over these frames, then holds
WIDTH_PX, HEIGHT_PX = 720, 1280
SAMPLES = 20

H = 3.0                       # her height on the surface, metres
W = H * 1440 / 3088
RELIEF = 0.22                 # how far the nearest parts stand out
HEART_V = 0.75                # her heart, from the bottom of the picture
CELLS_X = 64
ARRIVE = 0.18                 # as in the app's shader
SPREAD = 0.82
VIOLET = (0.62, 0.38, 1.0)
GOLD = (0.96, 0.80, 0.46)
random.seed(26112026)

scene = bpy.context.scene
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)


def load(path: Path, non_color: bool) -> bpy.types.Image:
    img = bpy.data.images.load(str(path))
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


photo = load(ROOT / "art/roxi/roxi-source.png", False)
matte_img = load(ROOT / "art/roxi/roxi-matte.png", True)
depth_img = load(ROOT / "assets/roxi/roxi-depth.webp", True)


def pixels(img: bpy.types.Image) -> np.ndarray:
    """RGBA floats, bottom row first (Blender's order), so [v, u] with v up."""
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)


def sample(arr: np.ndarray, u: float, v: float) -> np.ndarray:
    h, w = arr.shape[:2]
    return arr[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w)))]


depth_px = pixels(depth_img)
matte_px = pixels(matte_img)
photo_px = pixels(photo)

# ---- The order she forms in: one value per cell, the same rule as the app's shader.
cells_y = round(CELLS_X * H / W)
order = np.zeros((cells_y, CELLS_X), dtype=np.float32)
diag = math.hypot(W, H) * 0.62
for j in range(cells_y):
    for i in range(CELLS_X):
        u, v = (i + 0.5) / CELLS_X, (j + 0.5) / cells_y
        dist = math.hypot((u - 0.5) * W, (v - HEART_V) * H) / diag
        dc = float(sample(depth_px, u, v)[0])
        order[j, i] = min(1.0, max(0.0, 0.58 * dist + 0.30 * random.random() + 0.12 * (1 - dc))) * SPREAD
order_img = bpy.data.images.new("roxi-order", CELLS_X, cells_y, float_buffer=True, alpha=False)
order_img.colorspace_settings.name = "Non-Color"
order_img.pixels[:] = np.repeat(order[:, :, None], 4, axis=2).ravel()
order_img.pack()

# ---- Her surface: a fine grid raised by the depth map.
bpy.ops.mesh.primitive_grid_add(x_subdivisions=220, y_subdivisions=470, size=1, calc_uvs=True)
surface = bpy.context.object
surface.name = "Roxi"
surface.scale = (W, H, 1)
surface.rotation_euler = (math.radians(90), 0, 0)
surface.location = (0, 0, H / 2)
tex = bpy.data.textures.new("roxi-depth", type="IMAGE")
tex.image = depth_img
tex.extension = "EXTEND"
disp = surface.modifiers.new("relief", "DISPLACE")
disp.texture = tex
disp.texture_coords = "UV"
disp.strength = RELIEF / H  # the object is scaled by H along this axis's neighbours; strength is in object units
disp.mid_level = 0.0
disp.direction = "NORMAL"
bpy.ops.object.shade_smooth()

# The reveal value T, shared by her surface and the particles: -0.05 .. 1.0 over the forming frames.
T_FROM, T_TO = -0.05, 1.0


def node(tree, kind, **props):
    n = tree.nodes.new(kind)
    for key, value in props.items():
        setattr(n, key, value)
    return n


mat = bpy.data.materials.new("roxi-surface")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
uv = node(nt, "ShaderNodeTexCoord")
tex_photo = node(nt, "ShaderNodeTexImage", image=photo, interpolation="Cubic")
tex_matte = node(nt, "ShaderNodeTexImage", image=matte_img)
tex_order = node(nt, "ShaderNodeTexImage", image=order_img, interpolation="Closest")
for t in (tex_photo, tex_matte, tex_order):
    nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
t_value = node(nt, "ShaderNodeValue", label="T")
t_value.outputs[0].default_value = T_FROM
t_value.outputs[0].keyframe_insert("default_value", frame=FORM_START)
t_value.outputs[0].default_value = T_TO
t_value.outputs[0].keyframe_insert("default_value", frame=FORM_END)
order_plus = node(nt, "ShaderNodeMath", operation="ADD")
nt.links.new(tex_order.outputs["Color"], order_plus.inputs[0])
order_plus.inputs[1].default_value = ARRIVE
k = node(nt, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
nt.links.new(t_value.outputs[0], k.inputs["Value"])
nt.links.new(tex_order.outputs["Color"], k.inputs["From Min"])
nt.links.new(order_plus.outputs[0], k.inputs["From Max"])
settle = node(nt, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
nt.links.new(k.outputs["Result"], settle.inputs["Value"])
settle.inputs["From Min"].default_value = 0.45
alpha = node(nt, "ShaderNodeMath", operation="MULTIPLY")
nt.links.new(tex_matte.outputs["Color"], alpha.inputs[0])
nt.links.new(settle.outputs["Result"], alpha.inputs[1])
# A cell glows violet while it arrives: k * (1 - k), strongest halfway.
one_minus = node(nt, "ShaderNodeMath", operation="SUBTRACT")
one_minus.inputs[0].default_value = 1.0
nt.links.new(k.outputs["Result"], one_minus.inputs[1])
glow = node(nt, "ShaderNodeMath", operation="MULTIPLY")
nt.links.new(k.outputs["Result"], glow.inputs[0])
nt.links.new(one_minus.outputs[0], glow.inputs[1])
glow_amt = node(nt, "ShaderNodeMath", operation="MULTIPLY")
nt.links.new(glow.outputs[0], glow_amt.inputs[0])
glow_amt.inputs[1].default_value = 5.0
tint = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="ADD")
tint.inputs["B"].default_value = (*VIOLET, 1)
nt.links.new(glow_amt.outputs[0], tint.inputs["Factor"])
nt.links.new(tex_photo.outputs["Color"], tint.inputs["A"])
emit = node(nt, "ShaderNodeEmission")
nt.links.new(tint.outputs["Result"], emit.inputs["Color"])
transparent = node(nt, "ShaderNodeBsdfTransparent")
mix = node(nt, "ShaderNodeMixShader")
nt.links.new(alpha.outputs[0], mix.inputs["Fac"])
nt.links.new(transparent.outputs[0], mix.inputs[1])
nt.links.new(emit.outputs[0], mix.inputs[2])
out = node(nt, "ShaderNodeOutputMaterial")
nt.links.new(mix.outputs[0], out.inputs["Surface"])
surface.data.materials.append(mat)
for fc in mat.node_tree.animation_data.action.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"

# ---- The light that becomes her: points with a home on her surface and a start in the dark.
homes, starts, orders, cols = [], [], [], []
heart = np.array([0.0, 0.0, HEART_V * H])
for j in range(cells_y):
    for i in range(CELLS_X):
        u, v = (i + 0.5) / CELLS_X, (j + 0.5) / cells_y
        if sample(matte_px, u, v)[0] < 0.4:
            continue
        for _ in range(2):
            uu = u + (random.random() - 0.5) / CELLS_X
            vv = v + (random.random() - 0.5) / cells_y
            d = float(sample(depth_px, uu, vv)[0])
            home = np.array([(uu - 0.5) * W, -d * RELIEF, vv * H])
            out_dir = home - heart
            out_dir = out_dir / (np.linalg.norm(out_dir) + 1e-6)
            rnd = np.array([random.gauss(0, 1) for _ in range(3)])
            direction = out_dir * 0.8 + rnd / (np.linalg.norm(rnd) + 1e-6)
            direction[1] -= 0.5  # many come from the viewer's side, through the camera's space
            direction /= np.linalg.norm(direction)
            start = home + direction * random.uniform(1.0, 3.2)
            c = sample(photo_px, uu, vv)[:3]
            glow_c = np.array(VIOLET if random.random() < 0.62 else GOLD)
            homes.append(home)
            starts.append(start)
            orders.append(float(order[j, i]))
            cols.append(np.clip(c * 0.5 + glow_c * 0.9, 0, 1))

mesh = bpy.data.meshes.new("roxi-light")
mesh.from_pydata([tuple(h) for h in homes], [], [])
for name, values, kind in (("home", homes, "FLOAT_VECTOR"), ("start", starts, "FLOAT_VECTOR"), ("col", cols, "FLOAT_VECTOR")):
    attr = mesh.attributes.new(name, kind, "POINT")
    attr.data.foreach_set("vector", np.array(values, dtype=np.float32).ravel())
attr = mesh.attributes.new("order", "FLOAT", "POINT")
attr.data.foreach_set("value", np.array(orders, dtype=np.float32))
light_obj = bpy.data.objects.new("RoxiLight", mesh)
scene.collection.objects.link(light_obj)

gn = bpy.data.node_groups.new("roxi-light", "GeometryNodeTree")
gn.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
gn.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
g_in = node(gn, "NodeGroupInput")
g_out = node(gn, "NodeGroupOutput")


def attr_node(name, data_type):
    n = node(gn, "GeometryNodeInputNamedAttribute", data_type=data_type)
    n.inputs["Name"].default_value = name
    return n


a_home, a_start, a_order = attr_node("home", "FLOAT_VECTOR"), attr_node("start", "FLOAT_VECTOR"), attr_node("order", "FLOAT")
time = node(gn, "GeometryNodeInputSceneTime")
t_map = node(gn, "ShaderNodeMapRange", clamp=True)
gn.links.new(time.outputs["Frame"], t_map.inputs["Value"])
t_map.inputs["From Min"].default_value = FORM_START
t_map.inputs["From Max"].default_value = FORM_END
t_map.inputs["To Min"].default_value = T_FROM
t_map.inputs["To Max"].default_value = T_TO
o_plus = node(gn, "ShaderNodeMath", operation="ADD")
gn.links.new(a_order.outputs["Attribute"], o_plus.inputs[0])
o_plus.inputs[1].default_value = ARRIVE
kk = node(gn, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
gn.links.new(t_map.outputs["Result"], kk.inputs["Value"])
gn.links.new(a_order.outputs["Attribute"], kk.inputs["From Min"])
gn.links.new(o_plus.outputs[0], kk.inputs["From Max"])
pos = node(gn, "ShaderNodeMix", data_type="VECTOR")
gn.links.new(kk.outputs["Result"], pos.inputs["Factor"])
gn.links.new(a_start.outputs["Attribute"], pos.inputs["A"])
gn.links.new(a_home.outputs["Attribute"], pos.inputs["B"])
# Appear as their moment nears, vanish as the surface takes over.
o_early = node(gn, "ShaderNodeMath", operation="SUBTRACT")
gn.links.new(a_order.outputs["Attribute"], o_early.inputs[0])
o_early.inputs[1].default_value = 0.4
appear = node(gn, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
gn.links.new(t_map.outputs["Result"], appear.inputs["Value"])
gn.links.new(o_early.outputs[0], appear.inputs["From Min"])
gn.links.new(a_order.outputs["Attribute"], appear.inputs["From Max"])
vanish = node(gn, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
gn.links.new(kk.outputs["Result"], vanish.inputs["Value"])
vanish.inputs["From Min"].default_value = 0.75
vanish.inputs["To Min"].default_value = 1.0
vanish.inputs["To Max"].default_value = 0.0
radius = node(gn, "ShaderNodeMath", operation="MULTIPLY")
gn.links.new(appear.outputs["Result"], radius.inputs[0])
gn.links.new(vanish.outputs["Result"], radius.inputs[1])
radius_m = node(gn, "ShaderNodeMath", operation="MULTIPLY")
gn.links.new(radius.outputs[0], radius_m.inputs[0])
radius_m.inputs[1].default_value = 0.0065
to_points = node(gn, "GeometryNodeMeshToPoints")
gn.links.new(g_in.outputs[0], to_points.inputs["Mesh"])
gn.links.new(pos.outputs["Result"], to_points.inputs["Position"])
gn.links.new(radius_m.outputs[0], to_points.inputs["Radius"])
set_mat = node(gn, "GeometryNodeSetMaterial")
gn.links.new(to_points.outputs["Points"], set_mat.inputs["Geometry"])
gn.links.new(set_mat.outputs["Geometry"], g_out.inputs[0])
mod = light_obj.modifiers.new("light", "NODES")
mod.node_group = gn

pmat = bpy.data.materials.new("roxi-light")
pmat.use_nodes = True
pt = pmat.node_tree
pt.nodes.clear()
p_attr = node(pt, "ShaderNodeAttribute", attribute_name="col")
p_emit = node(pt, "ShaderNodeEmission")
p_emit.inputs["Strength"].default_value = 1.4
pt.links.new(p_attr.outputs["Vector"], p_emit.inputs["Color"])
p_out = node(pt, "ShaderNodeOutputMaterial")
pt.links.new(p_emit.outputs[0], p_out.inputs["Surface"])
set_mat.inputs["Material"].default_value = pmat

# ---- The room: a dark floor that reflects her, a faint violet aura behind, and nothing else.
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
floor = bpy.context.object
fmat = bpy.data.materials.new("floor")
fmat.use_nodes = True
bsdf = fmat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.004, 0.0035, 0.007, 1)
bsdf.inputs["Roughness"].default_value = 0.22
floor.data.materials.append(fmat)

bpy.ops.mesh.primitive_plane_add(size=7, location=(0, 1.4, H * 0.55), rotation=(math.radians(90), 0, 0))
aura = bpy.context.object
amat = bpy.data.materials.new("aura")
amat.use_nodes = True
at = amat.node_tree
at.nodes.clear()
a_uv = node(at, "ShaderNodeTexCoord")
a_grad = node(at, "ShaderNodeTexGradient", gradient_type="SPHERICAL")
a_map = node(at, "ShaderNodeMapping")
# Centre the gradient and let it reach nothing well inside the plane's edges.
a_map.inputs["Location"].default_value = (-1.1, -1.1, 0)
a_map.inputs["Scale"].default_value = (2.2, 2.2, 1)
at.links.new(a_uv.outputs["Generated"], a_map.inputs["Vector"])
at.links.new(a_map.outputs["Vector"], a_grad.inputs["Vector"])
a_emit = node(at, "ShaderNodeEmission")
a_emit.inputs["Color"].default_value = (*VIOLET, 1)
a_soft = node(at, "ShaderNodeMath", operation="POWER")
at.links.new(a_grad.outputs["Fac"], a_soft.inputs[0])
a_soft.inputs[1].default_value = 2.2
a_strength = node(at, "ShaderNodeMath", operation="MULTIPLY")
at.links.new(a_soft.outputs[0], a_strength.inputs[0])
a_strength.inputs[1].default_value = 0.0
a_strength.inputs[1].keyframe_insert("default_value", frame=1)
a_strength.inputs[1].default_value = 0.10
a_strength.inputs[1].keyframe_insert("default_value", frame=FORM_END)
at.links.new(a_strength.outputs[0], a_emit.inputs["Strength"])
a_out = node(at, "ShaderNodeOutputMaterial")
at.links.new(a_emit.outputs[0], a_out.inputs["Surface"])
aura.data.materials.append(amat)

world = bpy.data.worlds.new("night")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.0015, 0.0012, 0.0025, 1)
scene.world = world

# ---- The camera: a slow push in and a small turn, so the relief reads.
bpy.ops.object.empty_add(location=(0, 0, 1.6))
target = bpy.context.object
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("Camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
track = cam.constraints.new("TRACK_TO")
track.target = target
for frame, angle, dist, height in ((1, -14, 7.2, 1.25), (FRAMES, 6, 5.5, 1.6)):
    a = math.radians(angle)
    cam.location = (dist * math.sin(a), -dist * math.cos(a), height)
    cam.keyframe_insert("location", frame=frame)

# ---- Render.
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPENIMAGEDENOISE"
scene.cycles.max_bounces = 3
scene.cycles.transparent_max_bounces = 8
scene.render.resolution_x, scene.render.resolution_y = WIDTH_PX, HEIGHT_PX
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, FRAMES
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "PNG"

scene.use_nodes = True
ct = scene.node_tree
ct.nodes.clear()
rl = ct.nodes.new("CompositorNodeRLayers")
glare = ct.nodes.new("CompositorNodeGlare")
glare.glare_type = "BLOOM"
for name, value in (("threshold", 0.85), ("size", 7), ("mix", 0.0)):
    if hasattr(glare, name):
        setattr(glare, name, value)
for name, value in (("Threshold", 0.85), ("Strength", 0.6), ("Size", 0.5)):
    if name in glare.inputs:
        glare.inputs[name].default_value = value
comp = ct.nodes.new("CompositorNodeComposite")
ct.links.new(rl.outputs["Image"], glare.inputs["Image"])
ct.links.new(glare.outputs["Image"], comp.inputs["Image"])

OUT.mkdir(parents=True, exist_ok=True)
print(f"points: {len(homes)}, cells: {CELLS_X}x{cells_y}")
frames = range(1, FRAMES + 1) if WHICH == "all" else [int(f) for f in WHICH.split(",")]
for f in frames:
    scene.frame_set(f)
    scene.render.filepath = str(OUT / f"frame-{f:04d}.png")
    bpy.ops.render.render(write_still=True)
