// The Blender scene script (R22): one Python file that builds the page's scene in Blender, so
// that `blender --python scene.py` opens it ready to render with Cycles. It carries the same copy
// of the scene as the path tracer (trace.js): the faces with their colours, a material for the
// viewer's material and style, the stage, the key light as an area light, a gradient sky for the
// rest of the light, the stage colour as the background, and the camera. The drawn lines become
// Freestyle lines of the same width.
//
// Blender is z-up and three.js y-up: (x, y, z) here is (x, -z, y) there, a rotation, so faces keep
// their winding.

import * as THREE from '../vendor/three.module.min.js';
import { filmUV, LIGHTNESS } from './film.js';

const r6 = x => Math.round(x * 1e6) / 1e6;
const toBlender = v => [r6(v.x), r6(-v.z), r6(v.y)];
const rgb = c => [r6(c.r), r6(c.g), r6(c.b)];   // linear, as three.js keeps colours

// The scene as data. size is the square picture in pixels; samples, denoise and transparent are
// the Export panel's.
export function sceneData(v, { size, samples, denoise, transparent, title }) {
  // the faces as drawn: the polyhedron's, or its detached tiles
  const o = v.opts, m = v.shown, p = v.shownPos;
  // the camera as for a square export
  v.placeCamera(1);
  v.scene.updateMatrixWorld(true);
  const w = new THREE.Vector3(), M = v.faces.matrixWorld;
  const verts = [];
  for (let i = 0; i < p.length; i += 3) verts.push(toBlender(w.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(M)));
  // a face's colour is that of its first corner in the viewer's buffer
  const faces = [], colours = [], ca = v.faces.geometry.attributes.color.array;
  for (let f = 0, k = 0; f < m.nf; f++) {
    const a = m.fo[f], d = m.fo[f + 1] - a;
    faces.push(Array.from(m.fv.slice(a, a + d)));
    colours.push([r6(ca[k]), r6(ca[k + 1]), r6(ca[k + 2])]);
    k += 9 * (d === 3 ? 1 : d);
  }
  // the stage meshes as they stand, the curved part of the backdrop smooth
  const stage = [];
  if (v.stage.visible) {
    v.stage.traverse(s => {
      if (!s.isMesh || !s.parent.visible) return;
      const g = s.geometry, P = g.attributes.position, idx = g.index;
      const sv = [];
      for (let i = 0; i < P.count; i++) sv.push(toBlender(w.fromBufferAttribute(P, i).applyMatrix4(s.matrixWorld)));
      const sf = [];
      for (let i = 0; i < idx.count; i += 3) sf.push([idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]);
      stage.push({ verts: sv, faces: sf, smooth: g.type === 'CylinderGeometry' });
    });
  }
  const c = v.camera;
  const data = {
    title,
    verts, faces, colours,
    // the iridescent bands' two coordinates at each vertex, and the sliders (film.js)
    film: o.material === 'iridescent' ? Array.from({ length: p.length / 3 }, (_, i) => filmUV(p[3 * i], p[3 * i + 1], p[3 * i + 2], o.filmBand * v.meanEdge).map(r6)) : null,
    iri: { ...o.iri, hue: o.hue, chroma: o.chroma, lightness: LIGHTNESS, spec: o.spec, rough: o.rough },
    // matte, glossy, iridescent; glass and frame are styles that override it
    material: o.style === 'solid' ? o.material : o.style,
    // glass: the index of refraction
    ior: o.ior,
    stage, stageColour: rgb(new THREE.Color(o.stage)),
    background: transparent ? null : rgb(new THREE.Color(o.stage)),
    // the tracer's key light: 3 × 3 units of radiance 7 where the directional light is; Cycles
    // takes an area light's power in watts, radiance × π × area
    light: { position: toBlender(v.key.position), target: toBlender(v.key.target.position), size: 3, power: r6(7 * Math.PI * 9) },
    sky: { top: [1, 1, 1], bottom: rgb(new THREE.Color(0x777777)), exponent: 2, strength: 0.8 },
    camera: { position: toBlender(c.position), target: toBlender(v.target), fov: c.fov, near: r6(c.near), far: r6(c.far) },
    // depth of field: the lens opening and the sharp distance, in scene units
    lens: (({ diameter, distance }) => ({ diameter: r6(diameter), distance: r6(distance) }))(v.lens()),
    // lines over the picture, as in Render: every edge type becomes drawn lines
    lines: o.edge > 0 ? { width: r6(o.edge * 0.01 * size), ink: rgb(v.uniforms.uInk.value), hidden: o.style === 'solid' ? 0 : o.hidden } : null,
    size, samples, denoise,
  };
  v.placeCamera(v.aspect || 1);
  return data;
}

export function blenderScene(v, opts) {
  // inside a Python raw string: no quote can end it early
  const json = JSON.stringify(sceneData(v, opts)).replace(/'/g, '\\u0027');
  return `# ${opts.title}: a scene from https://asfaust.github.io/art/polyhedra/
# Open it in Blender:     blender --python scene.py
# Or render it directly:  blender -b --python scene.py -- --render out.png
# Blender 4.0 or later. It replaces everything in the open file.

import json, math, sys
import bpy
from mathutils import Vector

DATA = json.loads(r'''${json}''')

scene = bpy.context.scene
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob)
for c in list(scene.collection.children):
    bpy.data.collections.remove(c)


def look_at(ob, position, target):
    """Places ob at position with its -z axis towards target and its y axis up, as lights and
    cameras face in both Blender and three.js."""
    ob.location = position
    ob.rotation_euler = (Vector(target) - Vector(position)).to_track_quat('-Z', 'Y').to_euler()


def set_input(node, names, value):
    """Sets the first of names the node has; names change between Blender versions."""
    for name in names:
        if name in node.inputs:
            node.inputs[name].default_value = value
            return


def use_nodes(owner):
    """Node trees are always on from Blender 5; before, they had to be switched on."""
    if bpy.app.version < (5, 0, 0):
        owner.use_nodes = True


def mesh_object(name, verts, faces, material, collection=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    (collection or scene.collection).objects.link(ob)
    me.materials.append(material)
    return ob


# ---------- the shape ----------

def film_colour(nodes, links):
    """The iridescent colour per pixel, as the page computes it (film.js): a colour wheel at a
    phase mixed from bands (the 'film' UV map), angle (normal and view), holo (the reflection in
    the world, z up here)."""
    I = DATA['iri']
    def op(kind, a, b=None):
        m = nodes.new('ShaderNodeMath')
        m.operation = kind
        m.location = (-1400 + 120 * (len(nodes) % 10), -400 - 40 * (len(nodes) // 10))
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                links.new(v, m.inputs[i])
        return m.outputs[0]
    def add(*xs):
        out = xs[0]
        for x in xs[1:]:
            out = op('ADD', out, x)
        return out
    tau = 2 * math.pi
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'film'
    xyz = nodes.new('ShaderNodeSeparateXYZ')
    links.new(uv.outputs['UV'], xyz.inputs[0])
    bands = add(0.5, op('MULTIPLY', 0.35, op('SINE', op('MULTIPLY', xyz.outputs['X'], tau))),
                op('MULTIPLY', 0.15, op('SINE', op('ADD', op('MULTIPLY', xyz.outputs['Y'], tau), 1.3))))
    geo = nodes.new('ShaderNodeNewGeometry')
    dot = nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    links.new(geo.outputs['Normal'], dot.inputs[0])
    links.new(geo.outputs['Incoming'], dot.inputs[1])
    angle = op('SUBTRACT', 1.0, op('MINIMUM', op('ABSOLUTE', dot.outputs['Value']), 1.0))
    tex = nodes.new('ShaderNodeTexCoord')
    refl = nodes.new('ShaderNodeSeparateXYZ')
    links.new(tex.outputs['Reflection'], refl.inputs[0])
    holo = add(0.5, op('MULTIPLY', 0.35, refl.outputs['Z']), op('MULTIPLY', 0.25, refl.outputs['X']))
    mix = add(op('MULTIPLY', bands, I['bands']), op('MULTIPLY', angle, I['angle']), op('MULTIPLY', holo, I['holo']))
    h = op('MULTIPLY', op('ADD', op('MULTIPLY', mix, I['cycles']), I['hue'] / 360), tau)
    a = op('MULTIPLY', op('COSINE', h), I['chroma'])
    b = op('MULTIPLY', op('SINE', h), I['chroma'])
    L = I['lightness']
    lms = [op('POWER', add(L, op('MULTIPLY', a, ka), op('MULTIPLY', b, kb)), 3.0)
           for ka, kb in ((0.3963377774, 0.2158037573), (-0.1055613458, -0.0638541728), (-0.0894841775, -1.2914855480))]
    rgb = nodes.new('ShaderNodeCombineXYZ')
    for i, k in enumerate(((4.0767416621, -3.3077115913, 0.2309699292), (-1.2684380046, 2.6097574011, -0.3413193965), (-0.0041960863, -0.7034186147, 1.7076147010))):
        x = add(*(op('MULTIPLY', lms[j], k[j]) for j in range(3)))
        x = op('MINIMUM', op('MAXIMUM', x, 0.0), 1.0)
        links.new(x, rgb.inputs[i])
    return rgb.outputs[0]


def shape_material(kind):
    mat = bpy.data.materials.new('Polyhedron ' + kind)
    use_nodes(mat)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    colour = nodes.new('ShaderNodeAttribute')
    colour.attribute_name = 'colour'
    colour.location = (-300, 200)
    if kind == 'frame':
        # the faces are not seen, only their lines; they still hide the lines behind them
        nodes.remove(bsdf)
        clear = nodes.new('ShaderNodeBsdfTransparent')
        links.new(clear.outputs[0], nodes['Material Output'].inputs['Surface'])
        return mat
    links.new(colour.outputs['Color'], bsdf.inputs['Base Color'])
    set_input(bsdf, ['Roughness'], 1.0)
    set_input(bsdf, ['Metallic'], 0.0)
    if kind == 'matte':
        set_input(bsdf, ['Specular IOR Level', 'Specular'], 0.0)
    elif kind == 'glossy':
        set_input(bsdf, ['Roughness'], 0.35)
        set_input(bsdf, ['Coat Weight', 'Clearcoat'], 1.0)
        set_input(bsdf, ['Coat Roughness', 'Clearcoat Roughness'], 0.08)
    elif kind == 'iridescent':
        # the sliders' shine: three's specular intensity 1 is Blender's level 0.5 (F0 0.04)
        set_input(bsdf, ['Specular IOR Level', 'Specular'], 0.5 * DATA['iri']['spec'])
        set_input(bsdf, ['Roughness'], DATA['iri']['rough'])
        links.new(film_colour(nodes, links), bsdf.inputs['Base Color'])
    elif kind == 'glass':
        set_input(bsdf, ['Roughness'], 0.03)
        set_input(bsdf, ['Transmission Weight', 'Transmission'], 1.0)
        set_input(bsdf, ['IOR'], DATA['ior'])
    return mat


# in a collection of its own, so that only it gets lines
shapes = bpy.data.collections.new('Polyhedron')
scene.collection.children.link(shapes)
shape = mesh_object('Polyhedron', DATA['verts'], DATA['faces'], shape_material(DATA['material']), shapes)
colours = shape.data.attributes.new('colour', 'FLOAT_COLOR', 'FACE')
for i, c in enumerate(DATA['colours']):
    colours.data[i].color = (*c, 1.0)
if DATA['material'] == 'frame':
    shape.visible_shadow = False
if DATA['film']:
    layer = shape.data.uv_layers.new(name='film')
    for loop in shape.data.loops:
        layer.data[loop.index].uv = DATA['film'][loop.vertex_index]

# ---------- the stage ----------

if DATA['stage']:
    mat = bpy.data.materials.new('Stage')
    use_nodes(mat)
    bsdf = mat.node_tree.nodes['Principled BSDF']
    set_input(bsdf, ['Base Color'], (*DATA['stageColour'], 1.0))
    set_input(bsdf, ['Roughness'], 1.0)
    set_input(bsdf, ['Specular IOR Level', 'Specular'], 0.0)
    for i, s in enumerate(DATA['stage']):
        ob = mesh_object('Stage %d' % i, s['verts'], s['faces'], mat)
        if s['smooth']:
            for poly in ob.data.polygons:
                poly.use_smooth = True

# ---------- light and sky ----------

L = DATA['light']
light = bpy.data.lights.new('Key', 'AREA')
light.shape = 'SQUARE'
light.size = L['size']
light.energy = L['power']
key = bpy.data.objects.new('Key', light)
scene.collection.objects.link(key)
look_at(key, L['position'], L['target'])

# the sky lights the scene (white above, grey below); the camera sees the background colour
world = bpy.data.worlds.new('Sky')
scene.world = world
use_nodes(world)
nodes, links = world.node_tree.nodes, world.node_tree.links
S = DATA['sky']
coord = nodes.new('ShaderNodeTexCoord')
xyz = nodes.new('ShaderNodeSeparateXYZ')
links.new(coord.outputs['Generated'], xyz.inputs[0])
half = nodes.new('ShaderNodeMath')
half.operation = 'MULTIPLY_ADD'
half.inputs[1].default_value = 0.5
half.inputs[2].default_value = 0.5
links.new(xyz.outputs['Z'], half.inputs[0])
power = nodes.new('ShaderNodeMath')
power.operation = 'POWER'
power.inputs[1].default_value = S['exponent']
links.new(half.outputs[0], power.inputs[0])
ramp = nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (*S['bottom'], 1.0)
ramp.color_ramp.elements[1].color = (*S['top'], 1.0)
links.new(power.outputs[0], ramp.inputs['Fac'])
sky = nodes['Background']
sky.inputs['Strength'].default_value = S['strength']
links.new(ramp.outputs['Color'], sky.inputs['Color'])
out = sky
if DATA['background']:
    seen = nodes.new('ShaderNodeBackground')
    seen.inputs['Color'].default_value = (*DATA['background'], 1.0)
    path = nodes.new('ShaderNodeLightPath')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(path.outputs['Is Camera Ray'], mix.inputs['Fac'])
    links.new(sky.outputs[0], mix.inputs[1])
    links.new(seen.outputs[0], mix.inputs[2])
    out = mix
links.new(out.outputs[0], nodes['World Output'].inputs['Surface'])

# ---------- camera ----------

C = DATA['camera']
cam = bpy.data.cameras.new('Camera')
cam.sensor_fit = 'VERTICAL'
cam.angle_y = math.radians(C['fov'])
cam.clip_start = C['near']
cam.clip_end = C['far']
camera = bpy.data.objects.new('Camera', cam)
scene.collection.objects.link(camera)
look_at(camera, C['position'], C['target'])
scene.camera = camera
# Blender takes the opening as an f-number: focal length over opening, both in metres
if DATA['lens']['diameter'] > 0:
    cam.dof.use_dof = True
    cam.dof.focus_distance = DATA['lens']['distance']
    cam.dof.aperture_fstop = cam.lens * 1e-3 / DATA['lens']['diameter']

# ---------- lines ----------

if DATA['lines']:
    # every edge of the shape marked, and only those drawn: a face that is not flat would
    # otherwise show the diagonals Blender splits it along
    me = shape.data
    if hasattr(me.edges[0], 'use_freestyle_mark'):
        for e in me.edges:
            e.use_freestyle_mark = True
    else:
        marks = me.attributes.new('freestyle_edge', 'BOOLEAN', 'EDGE')
        for d in marks.data:
            d.value = True
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = 'ABSOLUTE'
    layer = scene.view_layers[0]
    layer.use_freestyle = True
    fs = layer.freestyle_settings
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    W = DATA['lines']
    sets = [('Lines', 'VISIBLE', 1.0)]
    if W['hidden'] > 0:
        sets.append(('Hidden lines', 'HIDDEN', W['hidden']))
    for name, visibility, alpha in sets:
        ls = fs.linesets.new(name)
        ls.select_by_visibility = True
        ls.visibility = visibility
        ls.select_by_edge_types = True
        for t in ('silhouette', 'border', 'crease', 'ridge_valley', 'suggestive_contour', 'material_boundary', 'contour', 'external_contour'):
            setattr(ls, 'select_' + t, False)
        ls.select_edge_mark = True
        ls.select_by_collection = True
        ls.collection = shapes
        style = ls.linestyle
        style.color = W['ink']
        style.alpha = alpha
        style.thickness = W['width']
        style.thickness_position = 'CENTER'
        style.caps = 'ROUND'

# ---------- render settings ----------

R = scene.render
R.engine = 'CYCLES'
R.resolution_x = R.resolution_y = DATA['size']
R.resolution_percentage = 100
R.film_transparent = DATA['background'] is None
scene.cycles.samples = DATA['samples']
scene.cycles.use_denoising = DATA['denoise'] and getattr(bpy.app.build_options, 'openimagedenoise', True)
for transform in ('Khronos PBR Neutral', 'Standard'):
    try:
        scene.view_settings.view_transform = transform
        break
    except TypeError:
        pass
scene.view_settings.look = 'None'

# the first graphics card Cycles can use, if any
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in gpus:
                d.use = True
            scene.cycles.device = 'GPU'
            break
except Exception:
    pass

# in the window, look through the camera
for area in getattr(bpy.context.screen, 'areas', []):
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--render' in argv:
    R.filepath = argv[argv.index('--render') + 1]
    bpy.ops.render.render(write_still=True)
`;
}
