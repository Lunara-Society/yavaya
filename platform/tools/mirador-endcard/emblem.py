# The Mirador emblem for the end card: a gold lookout ring framing a volcano over still water,
# turning a quarter and settling, on Mirador's obsidian. Rendered in Blender (Eevee), 720×720, 60 frames at 30 fps.
import bpy, math
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.render.resolution_x = 720
scene.render.resolution_y = 720
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 45
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '//frames/f_'
world = bpy.data.worlds.new('obsidian'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.0022, 0.0018, 0.0028, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
scene.view_settings.view_transform = 'Standard'

def gold(name, rough=0.28):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.86, 0.66, 0.30, 1)
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = rough
    return m

root = bpy.data.objects.new('emblem', None); scene.collection.objects.link(root)
bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.075, major_segments=128, minor_segments=24)
ring = bpy.context.object; ring.data.materials.append(gold('ring', 0.22)); ring.parent = root
bpy.ops.object.shade_smooth()
# The volcano: a soft cone, its foot on the water line.
bpy.ops.mesh.primitive_cone_add(vertices=96, radius1=0.6, radius2=0.11, depth=0.6, location=(0, 0, -0.12))
cone = bpy.context.object
cone.data.materials.append(gold('volcano', 0.4)); cone.parent = root
bpy.ops.object.shade_smooth()
# The lake: a thin gold bar across the ring's lower half.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.42))
lake = bpy.context.object; lake.scale = (0.86, 0.04, 0.025); lake.data.materials.append(gold('lake', 0.15)); lake.parent = root
# Rotate the inner pieces to face the camera (built in XZ plane).
for o in (cone,):
    pass
ring.rotation_euler = (math.radians(90), 0, 0)

cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 70
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (0, -6.2, 0.15); cam.rotation_euler = (math.radians(89), 0, 0)
for name, loc, energy, color in [('key', (-3, -4, 3), 900, (1.0, 0.86, 0.62)), ('rim', (3.5, 2.5, 1.5), 700, (0.75, 0.62, 1.0)), ('fill', (2.5, -4, -1.5), 220, (1, 0.9, 0.8))]:
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.color = color; l.size = 3
    o = bpy.data.objects.new(name, l); o.location = loc; scene.collection.objects.link(o)
    o.rotation_euler = (0, 0, 0)
    c = o.constraints.new('TRACK_TO'); c.target = root; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
# A quarter turn that settles: ease-out.
root.rotation_euler = (0, 0, math.radians(-70)); root.keyframe_insert('rotation_euler', frame=1)
root.rotation_euler = (0, 0, 0); root.keyframe_insert('rotation_euler', frame=36)
root.scale = (0.82, 0.82, 0.82); root.keyframe_insert('scale', frame=1)
root.scale = (1, 1, 1); root.keyframe_insert('scale', frame=36)
for fc in root.animation_data.action.fcurves:
    for k in fc.keyframe_points:
        k.interpolation = 'SINE'; k.easing = 'EASE_OUT'
bpy.ops.render.render(animation=True)
