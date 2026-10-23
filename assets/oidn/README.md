# OIDN weights

`rt_ldr.tza` is the Open Image Denoise ray-tracing LDR network from [RenderKit/oidn-weights](https://github.com/RenderKit/oidn-weights) (Apache-2.0, see `LICENSE.txt`). `tools/build.mjs` embeds it in `9forest_viewer.html`; the render-cut dialog runs it with [oidn-web](https://github.com/pissang/oidn-web) on WebGPU to denoise path-traced stills.
