"""Export the Sunken (nineforests v5) hall to a plain triangle JSON for the viewer.

Run from the repository root:
  blender --background "../../[virtual] sunken/modeling/nineforests_stage_v5.blend" \
    --python tools/blender/export_sunken.py -- data/sunken-source/sunken_v5_export.json

Only the architecture, rigging, live-stage and building-detail collections are
exported. The nine v2 artworks, their mounts, cables and the haze volume stay in
Blender; the viewer places its own 20-object library inside the hall instead.
Coordinates stay in Blender world metres (Z up). Nothing is saved to the .blend.
"""
import bmesh
import bpy
import hashlib
import json
import sys
from pathlib import Path

COLLECTIONS = ['ROOM', 'FACTORY_ARCHITECTURE', 'FACTORY_GLAZING', 'FACTORY_RIGGING', 'V5_ARCH_DETAIL', 'V5_STAGE_SETUP']
SKIP = {'v4_atmosphere_haze'}
# The lower brick is painted white up to brick course 45 (GALLERY_V4_ko.md).
PAINT_LINE_Z = 3.015
# Cables are curves; their tube resolution is lowered for the web copy only.
CURVE_RESOLUTION = 4


def srgb_hex(rgb):
    def channel(c):
        c = max(0.0, min(1.0, c))
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return '#' + ''.join(f'{round(channel(c) * 255):02x}' for c in rgb[:3])


def material_info(mat):
    if mat is None:
        return {'material': None, 'color': '#cccccc', 'opacity': 1}
    glass = 'glass' in mat.name
    return {'material': mat.name, 'color': srgb_hex(mat.diffuse_color), 'opacity': 0.28 if glass else 1}


def export_object(obj, depsgraph):
    if obj.type == 'CURVE':
        obj.data.resolution_u = min(obj.data.resolution_u, CURVE_RESOLUTION)
        obj.data.bevel_resolution = min(obj.data.bevel_resolution, 1)
        depsgraph.update()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.transform(obj.matrix_world)
    evaluated.to_mesh_clear()
    if obj.name == 'v4_brick_shell':
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, PAINT_LINE_Z), plane_no=(0, 0, 1))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    slots = [s.material for s in obj.material_slots] or [None]
    parts = {}
    for face in bm.faces:
        key = min(face.material_index, len(slots) - 1)
        name = obj.name
        if obj.name == 'v4_brick_shell':
            name += '_painted' if face.calc_center_median().z < PAINT_LINE_Z else '_upper'
        elif len(slots) > 1:
            name += f'_{key}'
        part = parts.setdefault(name, {'name': name, 'object': obj.name, **material_info(slots[key]), 'vertices': [], 'faces': [], '_ids': {}})
        for v in face.verts:
            if v.index not in part['_ids']:
                part['_ids'][v.index] = len(part['vertices']) // 3
                part['vertices'].extend(round(c, 4) for c in v.co)
            part['faces'].append(part['_ids'][v.index])
    bm.free()
    for part in parts.values():
        del part['_ids']
    return list(parts.values())


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = Path(argv[0] if argv else 'data/sunken-source/sunken_v5_export.json')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    meshes = []
    for collection in COLLECTIONS:
        for obj in bpy.data.collections[collection].objects:
            if obj.type not in {'MESH', 'CURVE'} or obj.name in SKIP or obj.hide_render:
                continue
            for part in export_object(obj, depsgraph):
                part['collection'] = collection
                meshes.append(part)
    source = Path(bpy.data.filepath)
    report = {
        'source_file': source.name,
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'blender': bpy.app.version_string,
        'collections': COLLECTIONS,
        'skipped': sorted(SKIP),
        'paint_line_z': PAINT_LINE_Z,
        'curve_resolution': CURVE_RESOLUTION,
        'spawn': list(bpy.data.objects['player_spawn'].location) if 'player_spawn' in bpy.data.objects else None,
        'meshes': meshes,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, separators=(',', ':')), encoding='utf-8')
    triangles = sum(len(m['faces']) // 3 for m in meshes)
    print(f'Sunken export: {len(meshes)} meshes, {triangles} triangles -> {out}')


main()
