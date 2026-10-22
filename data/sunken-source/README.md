# Sunken source export

`sunken_v5_export.json` is written by `tools/blender/export_sunken.py` from
`9 forests/[virtual] sunken/modeling/nineforests_stage_v5.blend`.

- Blender world metres, Z up, triangles only, 0.1 mm rounding.
- One entry per object and material (the brick shell is split at Z 3.015 m into `_painted` / `_upper`).
- `source_sha256` identifies the .blend that was exported.

`node tools/convert-sunken.mjs` turns it into `data/sunken-room.json`. See `docs/sunken-space.md`.
