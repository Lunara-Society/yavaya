# Santuario's candle (docs/sanctuary/CANDLE.md): an ivory pillar candle on a gold dish, lit and burning.
# Rendered in Blender 4.5 with Cycles on the CPU (this machine has no GPU and Eevee needs one), with a
# transparent background: the atmosphere behind it and the light that comes down to light it are drawn
# by HyperFrames (composition.html) and the layers are joined by ffmpeg (README.md).
#
#   blender -b -P candle.py -- <out dir> [lit|unlit|test]   (default: all frames)
#
# Two pieces, one flame: the lighting (frames 0–119; the flame catches at frame 51) and the burning loop
# (frames 0–119 again). The flicker is a sum of sines whose frequencies are whole numbers of cycles per
# 120 frames, so the loop's last frame runs into its first, and the lighting's last frame runs into the
# loop's first: both use the same phase, the frame number.
import bpy, bmesh, math, sys, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(args[0] if args else 'frames')
MODE = args[1] if len(args) > 1 else 'all'
LOOP = 120          # frames in the burning loop (4 s at 30 fps)
CATCH = 51          # the frame the flame catches in the lighting
SETTLED = 110       # from here the lighting equals the loop

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24 if MODE != 'test' else 16
scene.cycles.adaptive_threshold = 0.02
scene.render.use_persistent_data = True
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
scene.cycles.max_bounces = 6
scene.cycles.transparent_max_bounces = 12
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.render.resolution_x, scene.render.resolution_y = 720, 1280
scene.render.fps = 30
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
world = bpy.data.worlds.new('night'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.003, 0.003, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.0

def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links

# --- The candle: a pillar with a soft shoulder and a pool of melted wax ---------------------------
R, H = 0.32, 1.25
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=128, radius1=R, radius2=R, depth=H)
bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, H / 2))
top = [f for f in bm.faces if f.normal.z > 0.9][0]
inset = bmesh.ops.inset_region(bm, faces=[top], thickness=0.035, depth=0)
bmesh.ops.translate(bm, verts=list(top.verts), vec=(0, 0, -0.055))
pool_face = top
inner = bmesh.ops.inset_region(bm, faces=[pool_face], thickness=0.12, depth=0)
bmesh.ops.translate(bm, verts=list(pool_face.verts), vec=(0, 0, -0.012))
mesh = bpy.data.meshes.new('candle'); bm.to_mesh(mesh); bm.free()
candle = bpy.data.objects.new('candle', mesh); scene.collection.objects.link(candle)
for p in mesh.polygons: p.use_smooth = True
bev = candle.modifiers.new('soft', 'BEVEL'); bev.width = 0.018; bev.segments = 4; bev.limit_method = 'ANGLE'
candle.modifiers.new('sub', 'SUBSURF').levels = 1

wax, n, l = node_mat('wax')
b = n['Principled BSDF']
b.inputs['Base Color'].default_value = (0.93, 0.85, 0.71, 1)
b.inputs['Roughness'].default_value = 0.42
b.inputs['Subsurface Weight'].default_value = 0.65
b.inputs['Subsurface Radius'].default_value = (1.0, 0.55, 0.3)
b.inputs['Subsurface Scale'].default_value = 0.09
b.inputs['Emission Color'].default_value = (1.0, 0.5, 0.18, 1)
# The wax glows from within near the flame: emission falls off down the candle (Generated Z).
tc = n.new('ShaderNodeTexCoord'); sep = n.new('ShaderNodeSeparateXYZ'); ramp = n.new('ShaderNodeValToRGB')
ramp.color_ramp.interpolation = 'EASE'
ramp.color_ramp.elements[0].position = 0.55; ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
half = ramp.color_ramp.elements.new(0.86); half.color = (0.18, 0.18, 0.18, 1)
glow = n.new('ShaderNodeMath'); glow.operation = 'MULTIPLY'; glow.inputs[1].default_value = 0.0
l.new(tc.outputs['Generated'], sep.inputs[0]); l.new(sep.outputs['Z'], ramp.inputs[0])
l.new(ramp.outputs['Color'], glow.inputs[0]); l.new(glow.outputs[0], b.inputs['Emission Strength'])
WAX_GLOW = glow.inputs[1]
mesh.materials.append(wax)

# --- The wick ---------------------------------------------------------------------------------
pool_z = H - 0.055 - 0.012
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.009, depth=0.13, location=(0, 0, pool_z + 0.055))
wick = bpy.context.object; wick.rotation_euler = (math.radians(7), math.radians(-4), 0)
wm, n, l = node_mat('wick'); wb = n['Principled BSDF']
wb.inputs['Base Color'].default_value = (0.03, 0.025, 0.02, 1); wb.inputs['Roughness'].default_value = 0.8
wick.data.materials.append(wm)
WICK_TIP = Vector((0.004, 0.008, pool_z + 0.118))
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.012, location=WICK_TIP)
ember = bpy.context.object
em, n, l = node_mat('ember'); n.remove(n['Principled BSDF'])
e = n.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (1.0, 0.32, 0.06, 1); e.inputs['Strength'].default_value = 0.0
l.new(e.outputs[0], n['Material Output'].inputs['Surface'])
EMBER = e.inputs['Strength']
ember.data.materials.append(em)

# --- The flame: a teardrop of light, see-through at its edges -----------------------------------
FH, FR = 0.36, 0.068
bm = bmesh.new()
rings, seg = 40, 48
prev = None; first_ring = None
verts_rings = []
for i in range(rings + 1):
    z = i / rings
    r = FR * (math.sin(math.pi * z ** 0.6) ** 1.15) if 0 < z < 1 else 0.0
    ring = []
    if r < 1e-5:
        ring = [bm.verts.new((0, 0, z * FH))]
    else:
        for s in range(seg):
            a = 2 * math.pi * s / seg
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z * FH)))
    verts_rings.append(ring)
for i in range(rings):
    a, c = verts_rings[i], verts_rings[i + 1]
    if len(a) == 1:
        for s in range(seg): bm.faces.new((a[0], c[s], c[(s + 1) % seg]))
    elif len(c) == 1:
        for s in range(seg): bm.faces.new((a[s], c[0], a[(s + 1) % seg])[::-1])
    else:
        for s in range(seg): bm.faces.new((a[s], a[(s + 1) % seg], c[(s + 1) % seg], c[s]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
fm = bpy.data.meshes.new('flame'); bm.to_mesh(fm); bm.free()
for p in fm.polygons: p.use_smooth = True
flame = bpy.data.objects.new('flame', fm); scene.collection.objects.link(flame)
flame.location = (WICK_TIP.x, WICK_TIP.y, WICK_TIP.z - 0.05)
flame.visible_shadow = False

fmat, n, l = node_mat('flame'); n.remove(n['Principled BSDF'])
tc = n.new('ShaderNodeTexCoord'); sep = n.new('ShaderNodeSeparateXYZ')
col = n.new('ShaderNodeValToRGB'); cr = col.color_ramp
for el in list(cr.elements)[1:]: cr.elements.remove(el)
stops = [(0.0, (0.10, 0.22, 1.0)), (0.13, (0.30, 0.38, 0.95)), (0.24, (1.0, 0.93, 0.78)), (0.55, (1.0, 0.70, 0.30)), (1.0, (1.0, 0.34, 0.06))]
cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
for pos, c in stops[1:]:
    el = cr.elements.new(pos); el.color = (*c, 1)
strength = n.new('ShaderNodeValToRGB'); sr = strength.color_ramp
sr.elements[0].position = 0.0; sr.elements[0].color = (0.12, 0.12, 0.12, 1)
sr.elements[1].position = 1.0; sr.elements[1].color = (0.22, 0.22, 0.22, 1)
mid = sr.elements.new(0.28); mid.color = (1, 1, 1, 1)
upper = sr.elements.new(0.6); upper.color = (0.45, 0.45, 0.45, 1)
amount = n.new('ShaderNodeMath'); amount.operation = 'MULTIPLY'; amount.inputs[1].default_value = 0.0
emit = n.new('ShaderNodeEmission')
lw = n.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
edge = n.new('ShaderNodeValToRGB'); edge.color_ramp.interpolation = 'EASE'; edge.color_ramp.elements[0].position = 0.05; edge.color_ramp.elements[0].color = (1, 1, 1, 1)
edge.color_ramp.elements[1].position = 0.75; edge.color_ramp.elements[1].color = (0, 0, 0, 1)
transp = n.new('ShaderNodeBsdfTransparent'); mix = n.new('ShaderNodeMixShader')
l.new(tc.outputs['Generated'], sep.inputs[0])
l.new(sep.outputs['Z'], col.inputs[0]); l.new(sep.outputs['Z'], strength.inputs[0])
l.new(col.outputs['Color'], emit.inputs['Color'])
l.new(strength.outputs['Color'], amount.inputs[0]); l.new(amount.outputs[0], emit.inputs['Strength'])
l.new(lw.outputs['Facing'], edge.inputs[0])
l.new(edge.outputs['Color'], mix.inputs[0]); l.new(transp.outputs[0], mix.inputs[1]); l.new(emit.outputs[0], mix.inputs[2])
l.new(mix.outputs[0], n['Material Output'].inputs['Surface'])
FLAME_STRENGTH = amount.inputs[1]
fm.materials.append(fmat)

# The flame's outer mantle: larger, orange and mostly see-through, so the flame has a soft body of light.
outer = bpy.data.objects.new('mantle', fm.copy()); scene.collection.objects.link(outer)
outer.data.materials.clear()
om, n, l = node_mat('mantle'); n.remove(n['Principled BSDF'])
oe = n.new('ShaderNodeEmission'); oe.inputs['Color'].default_value = (1.0, 0.48, 0.12, 1); oe.inputs['Strength'].default_value = 0.0
olw = n.new('ShaderNodeLayerWeight'); olw.inputs['Blend'].default_value = 0.6
oedge = n.new('ShaderNodeValToRGB'); oedge.color_ramp.interpolation = 'EASE'
oedge.color_ramp.elements[0].position = 0.0; oedge.color_ramp.elements[0].color = (0.55, 0.55, 0.55, 1)
oedge.color_ramp.elements[1].position = 0.8; oedge.color_ramp.elements[1].color = (0, 0, 0, 1)
ot = n.new('ShaderNodeBsdfTransparent'); omix = n.new('ShaderNodeMixShader')
l.new(olw.outputs['Facing'], oedge.inputs[0]); l.new(oedge.outputs['Color'], omix.inputs[0])
l.new(ot.outputs[0], omix.inputs[1]); l.new(oe.outputs[0], omix.inputs[2]); l.new(omix.outputs[0], n['Material Output'].inputs['Surface'])
outer.data.materials.append(om)
OUTER_STRENGTH = oe.inputs['Strength']
outer.parent = None
outer.visible_shadow = False
outer.location = flame.location
for v in outer.data.vertices: v.co.x *= 1.45; v.co.y *= 1.45; v.co.z = v.co.z * 1.18 - 0.02

# --- Its light ---------------------------------------------------------------------------------
fl = bpy.data.lights.new('flame light', 'POINT'); fl.color = (1.0, 0.6, 0.28); fl.shadow_soft_size = 0.035; fl.energy = 0
flight = bpy.data.objects.new('flame light', fl); scene.collection.objects.link(flight)
flight.location = (WICK_TIP.x, WICK_TIP.y, WICK_TIP.z + 0.07)
# A faint cool light from above and behind, so the unlit candle is a shape in the dark, not nothing.
mo = bpy.data.lights.new('night', 'AREA'); mo.color = (0.62, 0.68, 1.0); mo.energy = 60; mo.size = 2.5
moon = bpy.data.objects.new('night', mo); scene.collection.objects.link(moon)
moon.location = (1.2, 2.6, 3.6); moon.rotation_euler = (math.radians(-40), math.radians(18), 0)
c = moon.constraints.new('TRACK_TO'); c.target = candle; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
fi = bpy.data.lights.new('fill', 'AREA'); fi.color = (1.0, 0.82, 0.62); fi.energy = 14; fi.size = 3
fill = bpy.data.objects.new('fill', fi); scene.collection.objects.link(fill)
fill.location = (-2.4, -3.2, 1.6)
c = fill.constraints.new('TRACK_TO'); c.target = candle; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'

# --- The gold dish and the altar ----------------------------------------------------------------
bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=0.5, depth=0.05, location=(0, 0, -0.025))
dish = bpy.context.object
dish.modifiers.new('b', 'BEVEL').width = 0.012
dm, n, l = node_mat('gold'); db = n['Principled BSDF']
db.inputs['Base Color'].default_value = (0.86, 0.64, 0.30, 1); db.inputs['Metallic'].default_value = 1.0; db.inputs['Roughness'].default_value = 0.24
dish.data.materials.append(dm)
for p in dish.data.polygons: p.use_smooth = True
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.05))
altar = bpy.context.object
am, n, l = node_mat('altar'); ab = n['Principled BSDF']
noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 3.0; noise.inputs['Detail'].default_value = 8
nr = n.new('ShaderNodeValToRGB'); nr.color_ramp.elements[0].color = (0.035, 0.022, 0.014, 1); nr.color_ramp.elements[1].color = (0.075, 0.048, 0.03, 1)
l.new(noise.outputs['Fac'], nr.inputs[0]); l.new(nr.outputs['Color'], ab.inputs['Base Color'])
ab.inputs['Roughness'].default_value = 0.34
# The altar fades into the dark with distance, so there is no horizon: the atmosphere drawn behind shows through.
atc = n.new('ShaderNodeTexCoord'); alen = n.new('ShaderNodeVectorMath'); alen.operation = 'LENGTH'
afade = n.new('ShaderNodeMapRange'); afade.inputs['From Min'].default_value = 1.6; afade.inputs['From Max'].default_value = 3.4
afade.inputs['To Min'].default_value = 1.0; afade.inputs['To Max'].default_value = 0.0
at = n.new('ShaderNodeBsdfTransparent'); amix = n.new('ShaderNodeMixShader')
l.new(atc.outputs['Object'], alen.inputs[0]); l.new(alen.outputs['Value'], afade.inputs['Value'])
l.new(afade.outputs['Result'], amix.inputs[0]); l.new(at.outputs[0], amix.inputs[1]); l.new(ab.outputs[0], amix.inputs[2])
l.new(amix.outputs[0], n['Material Output'].inputs['Surface'])
altar.data.materials.append(am)

# --- The camera: the candle in the lower half, the dark above it kept for the day's prayer --------
cd = bpy.data.cameras.new('cam'); cd.lens = 50; cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 36
cd.dof.use_dof = True; cd.dof.aperture_fstop = 2.8
cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (0, -5.3, 1.85); cam.rotation_euler = (math.radians(85.0), 0, 0)
cd.dof.focus_distance = 5.3

# --- The flame's life ---------------------------------------------------------------------------
TAU = 2 * math.pi
WAVES = {  # channel: [(cycles per loop, amplitude, phase)]
    'height': [(3, 0.030, 0.4), (7, 0.018, 2.1), (13, 0.010, 4.0), (29, 0.006, 1.3)],
    'width':  [(5, 0.020, 1.0), (11, 0.010, 3.3), (23, 0.006, 0.2)],
    'swayx':  [(2, 0.030, 0.0), (5, 0.016, 2.6), (17, 0.006, 5.1)],
    'swayy':  [(3, 0.024, 1.7), (7, 0.012, 0.9), (19, 0.005, 3.8)],
    'light':  [(3, 0.06, 0.4), (7, 0.04, 2.1), (13, 0.03, 4.0), (29, 0.02, 1.3)],
}
def wave(channel, phase):
    return sum(a * math.sin(TAU * k * phase / LOOP + p) for k, a, p in WAVES[channel])

def envelope(frame, lighting):
    """How alight the flame is: 0 before it catches, a flare, then 1."""
    if not lighting: return 1.0, 1.0
    if frame < CATCH: return 0.0, 0.0
    t = frame - CATCH
    if t < 7: size = (t / 7) ** 0.7 * 1.22
    else: size = 1.0 + 0.22 * math.exp(-(t - 7) / 9.0) * math.cos((t - 7) / 6.0)
    glow = min(1.0, (t / 40.0)) ** 1.4   # the wax warms more slowly than the flame
    if frame >= SETTLED: size, glow = 1.0, 1.0
    return max(0.0, size), glow

def pose(frame, lighting):
    size, glow = envelope(frame, lighting)
    ph = frame % LOOP
    h = (1 + wave('height', ph)) * size
    w = (1 + wave('width', ph)) * (0.55 + 0.45 * size if size > 0 else 0)
    flame.scale = (max(w, 1e-4), max(w, 1e-4), max(h, 1e-4))
    flame.rotation_euler = (wave('swayx', ph), wave('swayy', ph), 0)
    flame.hide_render = size <= 0.001
    FLAME_STRENGTH.default_value = 9.0 * min(1.0, size) * (1 + wave('light', ph) * 0.5)
    OUTER_STRENGTH.default_value = 1.6 * min(1.0, size) * (1 + wave('light', ph) * 0.5)
    outer.scale = flame.scale; outer.rotation_euler = flame.rotation_euler; outer.hide_render = flame.hide_render
    fl.energy = 22.0 * min(1.15, size) * (1 + wave('light', ph))
    WAX_GLOW.default_value = 0.9 * glow * (1 + wave('light', ph) * 0.6)
    EMBER.default_value = 6.0 if size > 0 else 0.0

def render(path, frame, lighting):
    pose(frame, lighting)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

os.makedirs(OUT, exist_ok=True)
bpy.context.view_layer.update()
# Where the wick tip and the flame's heart fall in the picture, for the composition (0–1, from top-left).
def screen(v):
    p = world_to_camera_view(scene, cam, v)
    return {'x': round(p.x, 4), 'y': round(1 - p.y, 4)}
with open(os.path.join(OUT, 'positions.json'), 'w') as f:
    json.dump({'wick': screen(WICK_TIP), 'flame': screen(WICK_TIP + Vector((0, 0, 0.12))), 'candleTop': screen(Vector((0, 0, H)))}, f)

if MODE == 'test':
    render(os.path.join(OUT, 'test_lit.png'), 0, False)
    render(os.path.join(OUT, 'test_unlit.png'), 0, True)
else:
    if MODE in ('all', 'unlit'):
        render(os.path.join(OUT, 'unlit.png'), 0, True)
    if MODE in ('all', 'lit'):
        for f in range(CATCH, SETTLED):
            render(os.path.join(OUT, f'light_{f:04d}.png'), f, True)
        for f in range(LOOP):
            render(os.path.join(OUT, f'loop_{f:04d}.png'), f, False)
