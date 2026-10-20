# WESS+ architectural source

`WESS_Plus_Space.obj` and its companion material library are the architectural-only, metre-unit Z-up exports of the existing WESS floor-plan model. They contain no installed Nine Forests objects. `model_parameters.json` records the vector floor-plan rectangles and assumed vertical dimensions.

Regenerate the editor room with `node tools/convert-wess.mjs` from the repository root. The converter preserves every source triangle's coordinates and winding, splits exterior walls for cutaway views, and writes `data/wess-room.json` plus `data/wess-geometry-audit.json`. No Blender installation is needed for this conversion.

The slab and +30 mm central-floor regions are transcribed from the original `build_wess_model.py`. The optional ceiling follows those slab regions at an assumed 2.70 m; it is tagged `assumed: true` and is distinct from the original architectural triangles. Stair treads are visual context and are excluded from usable exhibition floors. Door jambs, open door leaves, glazing, walls and the central column are included in the collision metadata; lintels carry their actual lower Z so they do not block walking through doorways.

Coordinate convention: X right on the source floor plan, Y up on the plan, Z vertically up. The lower entrance lobby has negative Y coordinates. `metadata.bounds` encloses the floor footprint; `metadata.model_bounds` also includes the open north door outside that footprint. Area is calculated from the slab-region union minus wall, column and partition footprints; it is a model-derived area, not a separately surveyed venue measurement.
