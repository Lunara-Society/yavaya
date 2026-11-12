"""
The district medallions of the "Distritos en 3D" look, rendered in Blender.

Each district's own mark (traced from the site's SVG by glyphs.cjs) is raised
in gold on a polished obsidian disc inside a gold rim, lit from the upper left
with a touch of the district's colour from the right. The home page floats the
result above its card (platform/src/ui/depth). Santuario's mark is a
photograph, so its medallion is the rim alone, hung around the photograph.

    blender -b --python tools/depth/medallions.py -- out/glyphs.json out/ [district ...]

Writes out/medal-<district>.png, larger than shown; finish-medallions.py
reduces them and writes the WebP files the site serves.

Blender 4.5 LTS. Cycles on the processor: about ten seconds each.
"""
import json
import math
import sys
from pathlib import Path

import bpy

import os

# Well over three times the published 160: reduced afterwards, which is what keeps thin gold lines clean.
SIZE = int(os.environ.get("MEDAL_SIZE", "576"))
SAMPLES = int(os.environ.get("MEDAL_SAMPLES", "160"))

K = 0.060  # one unit of the mark's 24-unit box, in scene units (the disc's radius is 1)
STROKE = 0.94 * K  # half the drawn stroke, a little heavier than on paper so it holds at 50 pixels
DOME = 0.11  # how much the obsidian rises: a low lens, not a ball
LIFT = 0.93 * DOME * 0.82  # where the mark sits: half sunk into the dome


def srgb(hex_colour: str) -> tuple[float, float, float]:
    """#rrggbb as the linear values Blender's shaders expect."""
    def channel(value: int) -> float:
        c = value / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hex_colour.lstrip("#")
    return tuple(channel(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def principled(name: str, **inputs) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    for key, value in inputs.items():
        shader.inputs[key].default_value = value
    return material


def place(obj: bpy.types.Object, material: bpy.types.Material, smooth: bool = True) -> bpy.types.Object:
    obj.data.materials.append(material)
    if smooth and hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def add_light(name: str, location, size, power, colour, size_y=None) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.color = colour
    data.size = size
    if size_y:
        data.shape = "RECTANGLE"
        data.size_y = size_y
    light = bpy.data.objects.new(name, data)
    light.location = location
    # Every light looks at the middle of the medallion.
    direction = -light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(light)


def build(district: str, entry: dict) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    accent = srgb(entry["accent"])

    # --- Materials: the brand's two, gold and obsidian. -----------------------
    gold = principled("gold", **{"Base Color": (0.95, 0.60, 0.19, 1.0), "Metallic": 1.0, "Roughness": 0.17})
    rim_gold = principled("rim", **{"Base Color": (0.93, 0.58, 0.18, 1.0), "Metallic": 1.0, "Roughness": 0.24})
    obsidian = principled("obsidian", **{"Base Color": (0.006, 0.005, 0.010, 1.0), "Metallic": 0.0, "Roughness": 0.1})

    # --- The body: a low dome of obsidian, a gold rim, a fine gold line. ------
    if entry["shapes"]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=0.93)
        dome = place(bpy.context.object, obsidian)
        dome.scale = (1.0, 1.0, DOME)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.795, minor_radius=0.012, major_segments=160, minor_segments=12, location=(0, 0, 0.93 * DOME * 0.5))
        place(bpy.context.object, gold)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.922, minor_radius=0.078, major_segments=192, minor_segments=32, location=(0, 0, 0.012))
    rim = place(bpy.context.object, rim_gold)
    rim.scale = (1.0, 1.0, 0.9)

    # --- The mark: strokes as rounded gold, filled shapes as raised gold. -----
    def to_scene(point):
        return ((point[0] - 12.0) * K, -(point[1] - 12.0) * K)

    strokes = bpy.data.curves.new("strokes", "CURVE")
    strokes.dimensions = "3D"
    strokes.bevel_depth = STROKE
    strokes.bevel_resolution = 8
    strokes.use_fill_caps = True
    fills = bpy.data.curves.new("fills", "CURVE")
    fills.dimensions = "2D"
    fills.fill_mode = "BOTH"
    fills.extrude = 0.02
    fills.bevel_depth = 0.014
    fills.bevel_resolution = 4
    ends = []
    for shape in entry["shapes"]:
        points = [to_scene(p) for p in shape["points"]]
        spline = (fills if shape["filled"] else strokes).splines.new("POLY")
        spline.points.add(len(points) - 1)
        for target, (x, y) in zip(spline.points, points):
            target.co = (x, y, 0.0, 1.0)
        spline.use_cyclic_u = shape["closed"] or shape["filled"]
        if not shape["filled"] and not shape["closed"]:
            ends.extend([points[0], points[-1]])
    if strokes.splines:
        obj = bpy.data.objects.new("strokes", strokes)
        obj.location = (0, 0, LIFT)
        obj.scale = (1.0, 1.0, 0.8)
        obj.data.materials.append(gold)
        bpy.context.collection.objects.link(obj)
    if fills.splines:
        obj = bpy.data.objects.new("fills", fills)
        obj.location = (0, 0, LIFT + 0.012)
        obj.data.materials.append(gold)
        bpy.context.collection.objects.link(obj)
    # The drawing's strokes end round: a ball at each open end.
    for x, y in ends:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=STROKE, location=(x, y, LIFT))
        ball = place(bpy.context.object, gold)
        ball.scale = (1.0, 1.0, 0.8)

    # --- Light: a key from the upper left, the district's colour from the lower right. ---
    add_light("key", (-2.3, 2.5, 2.7), 2.2, 520.0, (1.0, 0.93, 0.80))
    add_light("accent", (2.9, -1.7, 1.5), 2.0, 300.0, tuple(0.25 + 0.75 * c for c in accent))

    # Polished stone shows what it reflects. An arc of light just off the axis,
    # up and to the left, is the crescent that says the disc is glass-smooth.
    if entry["shapes"]:
        arc = bpy.data.meshes.new("arc")
        steps, inner, outer, height = 32, 0.86, 1.03, 4.0
        verts, faces = [], []
        for i in range(steps + 1):
            angle = math.radians(98.0 + (172.0 - 98.0) * i / steps)
            for radius in (inner, outer):
                verts.append((radius * math.cos(angle), radius * math.sin(angle), height))
        for i in range(steps):
            a = i * 2
            faces.append((a, a + 1, a + 3, a + 2))
        arc.from_pydata(verts, [], faces)
        glow = bpy.data.materials.new("glow")
        glow.use_nodes = True
        glow.node_tree.nodes.clear()
        emission = glow.node_tree.nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (1.0, 0.95, 0.86, 1.0)
        emission.inputs["Strength"].default_value = 10.0
        output = glow.node_tree.nodes.new("ShaderNodeOutputMaterial")
        glow.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
        arc.materials.append(glow)
        arc_object = bpy.data.objects.new("arc", arc)
        arc_object.visible_camera = False
        bpy.context.collection.objects.link(arc_object)

    # What the gold has to reflect where no lamp is: a warm horizon, brighter
    # toward the top of the picture, and a dark sky straight above, so the
    # disc, which only ever reflects straight up, stays black.
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    background = nodes["Background"]
    coord = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    horizon = nodes.new("ShaderNodeMapRange")
    horizon.inputs["From Min"].default_value = 0.82
    horizon.inputs["From Max"].default_value = 0.30
    side = nodes.new("ShaderNodeMapRange")
    side.inputs["From Min"].default_value = -1.0
    side.inputs["From Max"].default_value = 1.0
    side.inputs["To Min"].default_value = 0.10
    side.inputs["To Max"].default_value = 1.0
    both = nodes.new("ShaderNodeMath")
    both.operation = "MULTIPLY"
    mix = nodes.new("ShaderNodeMixRGB")
    mix.inputs["Color1"].default_value = (0.085, 0.062, 0.034, 1.0)
    mix.inputs["Color2"].default_value = (1.25, 0.92, 0.50, 1.0)
    links.new(coord.outputs["Generated"], split.inputs["Vector"])
    links.new(split.outputs["Z"], horizon.inputs["Value"])
    links.new(split.outputs["Y"], side.inputs["Value"])
    links.new(horizon.outputs["Result"], both.inputs[0])
    links.new(side.outputs["Result"], both.inputs[1])
    links.new(both.outputs["Value"], mix.inputs["Fac"])
    links.new(mix.outputs["Color"], background.inputs["Color"])
    scene.world = world

    # --- Camera: straight on and without perspective, so the rim is a true circle. ---
    camera_data = bpy.data.cameras.new("camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 2.04
    camera = bpy.data.objects.new("camera", camera_data)
    camera.location = (0, 0, 6)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    # Standard keeps gold gold: AgX turned its highlights pale.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def main() -> None:
    arguments = sys.argv[sys.argv.index("--") + 1:]
    glyphs = json.loads(Path(arguments[0]).read_text())
    out = Path(arguments[1])
    wanted = arguments[2:] or list(glyphs)
    for district in wanted:
        build(district, glyphs[district])
        bpy.context.scene.render.filepath = str(out / f"medal-{district}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {district}")


main()
