# QSC K8 visual planning model

Original K8, 280 W × 269 D × 450 H mm. Metres; X width, +Y front, Z up; bottom Z=0. The JSON, OBJ and GLB use the same evaluated Blender mesh. GLB uses standard glTF Y-up conversion. The Blender file contains a separate `99_Presentation` studio setup, excluded from exchange exports.

Sources: [QSC K Series Spec Sheet 04/06/11](https://in.qscaudio.com/resource-files/productresources/spk/k/q_spk_k_specs.pdf), dimensions on page 4 and photos/rear module on pages 1 and 3; the user's [World Mall K8 listing](https://world-mall.co.kr/product/detail.html?product_no=545).

Manufacturer envelope dimensions are retained. Cabinet taper, moulded radii, grille and control locations are photo-derived. This is a visual placement model, not manufacturer CAD. The separate tripod stand in the viewer is generic and uses a 35 mm upper pole.

Rebuild using Blender 4.5: `blender --background --python-exit-code 1 --python tools/blender/build_qsc_k8.py` from the repository root, then `npm run build`. Mesh perforations are geometric and need no external texture.
