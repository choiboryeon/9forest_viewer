"""Prepare 박지수 artwork textures and a GLB model for the WESS+ viewer.

Usage: python -I tools/prepare-artworks.py "<artwork folder>"

Reads the transparent cut-outs 상단_2.png / 하단_2.png / 전체_1.png, crops them to
their alpha bounds and writes web textures (WebP with alpha), a catalog thumbnail
and a self-contained GLB (glTF 2.0, metres, Y-up) to assets/artworks/parkjisu/.
Physical sizes are the measured artwork sizes, not the photo aspect ratio.
"""
import io, json, struct, sys, unicodedata
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'artworks' / 'parkjisu'
# width x height in metres (상단 87 x 114.5 cm, 하단 50 x 118.3 cm; the long side is horizontal)
PARTS = [
    {'id': 'top', 'file': '상단_2.png', 'width_m': 1.145, 'height_m': 0.87},
    {'id': 'bottom', 'file': '하단_2.png', 'width_m': 1.183, 'height_m': 0.50},
]
GAP_M = 0.14  # measured from 전체_1.png (both scale estimates give 13.8–14.1 cm)


def find(folder, name):
    for p in folder.iterdir():
        if unicodedata.normalize('NFC', p.name) == name:
            return p
    raise SystemExit(f'missing {name} in {folder}')


def cutout(path, longest):
    im = Image.open(path).convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox())
    im.thumbnail((longest, longest), Image.LANCZOS)
    return im


def glb(parts, images):
    """Two alpha-masked quads, centred horizontally; origin = wall point at the bottom edge."""
    bin_parts, views, accessors, meshes, nodes, materials, textures, imgs = [], [], [], [], [], [], [], []
    offset = 0

    def add(data, target=None):
        nonlocal offset
        pad = (-len(data)) % 4
        bin_parts.append(data + b'\0' * pad)
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if target:
            view['target'] = target
        views.append(view)
        offset += len(data) + pad
        return len(views) - 1

    y = 0.0
    for i, (part, png) in reversed(list(enumerate(zip(parts, images)))):
        w, h = part['width_m'], part['height_m']
        pos = [-w / 2, 0, 0, w / 2, 0, 0, w / 2, h, 0, -w / 2, h, 0]
        uv = [0, 1, 1, 1, 1, 0, 0, 0]
        nrm = [0, 0, 1] * 4
        idx = [0, 1, 2, 0, 2, 3]
        a_pos = len(accessors); accessors.append({'bufferView': add(struct.pack('12f', *pos), 34962), 'componentType': 5126, 'count': 4, 'type': 'VEC3', 'min': [-w / 2, 0, 0], 'max': [w / 2, h, 0]})
        a_nrm = len(accessors); accessors.append({'bufferView': add(struct.pack('12f', *nrm), 34962), 'componentType': 5126, 'count': 4, 'type': 'VEC3'})
        a_uv = len(accessors); accessors.append({'bufferView': add(struct.pack('8f', *uv), 34962), 'componentType': 5126, 'count': 4, 'type': 'VEC2'})
        a_idx = len(accessors); accessors.append({'bufferView': add(struct.pack('6H', *idx), 34963), 'componentType': 5123, 'count': 6, 'type': 'SCALAR'})
        imgs.append({'bufferView': add(png), 'mimeType': 'image/png', 'name': part['id']})
        textures.append({'source': len(imgs) - 1})
        materials.append({'name': f"parkjisu_{part['id']}", 'pbrMetallicRoughness': {'baseColorTexture': {'index': len(textures) - 1}, 'metallicFactor': 0, 'roughnessFactor': 0.92}, 'alphaMode': 'MASK', 'alphaCutoff': 0.5})
        meshes.append({'name': part['id'], 'primitives': [{'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm, 'TEXCOORD_0': a_uv}, 'indices': a_idx, 'material': len(materials) - 1}]})
        nodes.append({'name': f"parkjisu_{part['id']}", 'mesh': len(meshes) - 1, 'translation': [0, y, 0.004]})
        y += h + GAP_M
    nodes.append({'name': 'parkjisu_set', 'children': list(range(len(nodes)))})
    gltf = {'asset': {'version': '2.0', 'generator': '9forest tools/prepare-artworks.py'}, 'scene': 0,
            'scenes': [{'nodes': [len(nodes) - 1]}], 'nodes': nodes, 'meshes': meshes, 'materials': materials,
            'textures': textures, 'images': imgs, 'samplers': [], 'accessors': accessors, 'bufferViews': views,
            'buffers': [{'byteLength': offset}],
            'extras': {'unit': 'm', 'note': 'Origin at the wall, bottom edge of 하단; faces +Z.', 'gap_m': GAP_M}}
    del gltf['samplers']
    js = json.dumps(gltf, ensure_ascii=False).encode('utf8'); js += b' ' * ((-len(js)) % 4)
    body = b''.join(bin_parts)
    return b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(body)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(body)) + b'BIN\0' + body


def main():
    folder = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    pngs = []
    for part in PARTS:
        im = cutout(find(folder, part['file']), 2048)
        im.save(OUT / f"{part['id']}.webp", 'WEBP', quality=88, method=6)
        buf = io.BytesIO(); cutout(find(folder, part['file']), 1600).save(buf, 'PNG', optimize=True); pngs.append(buf.getvalue())
        print(part['id'], im.size, (OUT / f"{part['id']}.webp").stat().st_size)
    thumb = cutout(find(folder, '전체_1.png'), 160)
    thumb.save(OUT / 'thumb.webp', 'WEBP', quality=85)
    (OUT / 'parkjisu_set.glb').write_bytes(glb(PARTS, pngs))
    print('glb', (OUT / 'parkjisu_set.glb').stat().st_size)


main()
