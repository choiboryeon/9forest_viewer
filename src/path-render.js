import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {WebGLPathTracer, GradientEquirectTexture, DenoiseMaterial} from 'three-gpu-pathtracer';
import {initUNetFromBuffer} from 'oidn-web';

// Progressive path-traced stills of the live viewer scene. The tracer owns its own
// WebGL context and copies geometry, materials and lights when a render starts,
// so the interactive viewer keeps running while samples accumulate.
export class PathRender{
 // `weights()` returns the Open Image Denoise network (TZA) as an ArrayBuffer.
 constructor(host,weights){this.host=host;this.weights=weights;this.renderer=null;this.tracer=null;this.job=null;this.unet=null;this.smooth=true;}
 ensure(){
  if(this.renderer)return;
  const canvas=document.createElement('canvas');canvas.className='render-canvas';
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,preserveDrawingBuffer:true});
  this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.tracer=new WebGLPathTracer(this.renderer);
  Object.assign(this.tracer,{renderDelay:0,fadeDuration:0,minSamples:1,rasterizeScene:false,dynamicLowRes:false});
  this.tracer.bounces=6;this.tracer.transmissiveBounces=4;this.tracer.filterGlossyFactor=.5;this.tracer.multipleImportanceSampling=true;
  // Edge-aware smoothing keeps the live preview readable while samples gather.
  // The finished image goes to OIDN instead when WebGPU is available.
  this.preview=new FullScreenQuad(new DenoiseMaterial({map:null}));
  this.tracer.renderToCanvasCallback=(target,renderer,quad)=>{
   const autoClear=renderer.autoClear;renderer.autoClear=false;
   if(this.smooth){
    const u=this.preview.material.uniforms,n=Math.max(1,this.tracer.samples),exposure=renderer.toneMappingExposure||1;
    u.map.value=target.texture;u.sigma.value=Math.max(1.6,Math.min(4.5,4.5*Math.sqrt(48/n)));u.kSigma.value=1.6;u.threshold.value=.14/exposure;
    this.preview.render(renderer);
   }else quad.render(renderer);
   renderer.autoClear=autoClear;
  };
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;if(this.job)this.job.cancelled=true;});
  this.output=document.createElement('canvas');this.output.className='render-canvas';this.output.hidden=true;
  this.host.append(canvas,this.output);
 }
 // Compile the tracing shader ahead of the first render; it can take a minute.
 warm(){
  this.ensure();if(this.warming||this.job)return;this.warming=true;this.renderer.setSize(32,32,false);
  const step=()=>{if(this.job){this.warming=false;return;}this.tracer.renderSample();if(this.tracer.isCompiling||this.tracer.samples<1)tick(step);else this.warming=false;};
  tick(step);
 }
 get canvas(){return this.renderer?.domElement;}
 get samples(){return Math.floor(this.tracer?.samples||0);}
 get canDenoise(){return !!(navigator.gpu&&this.weights);}
 cancel(){if(this.job){this.job.cancelled=true;this.job.abort?.();}}
 // Ends the current render early and keeps the samples gathered so far.
 finish(){if(this.job)this.job.stop=true;}
 // `stage(scene)` prepares the shared scene for capture and returns a restore callback.
 async start({scene,camera,width,height,samples,exposure=0,toneMapping=THREE.ACESFilmicToneMapping,stage,onProgress=()=>{},onDenoise=()=>{}}){
  this.cancel();this.ensure();
  if(this.lost)throw Error('GPU context lost');
  const job=this.job={cancelled:false};
  const stopped=()=>{if(this.lost)throw Error('GPU context lost');return job.cancelled;};
  this.smooth=true;this.denoiser=null;this.canvas.hidden=false;this.output.hidden=true;
  this.renderer.setSize(width,height,false);this.renderer.toneMapping=toneMapping;this.renderer.toneMappingExposure=1;
  // Each draw traces one tile. Whole-frame draws at print sizes run long enough
  // to trip the GPU watchdog, which resets the GPU and blocks WebGL for the page.
  const tiles=Math.max(1,Math.ceil(Math.sqrt(width*height/2.5e5)));this.tracer.tiles.set(tiles,tiles);
  // BVH building is synchronous (a worker cannot ship inside the single HTML file);
  // yield one frame first so the progress dialog paints.
  await new Promise(r=>tick(()=>setTimeout(r)));
  const restore=stage(scene);
  try{this.tracer.setScene(scene,camera);}finally{restore();}
  if(stopped())return null;
  const network=this.canDenoise?this.network().catch(err=>{console.warn('OIDN unavailable',err);this.unet=null;return null;}):null;
  let metered=0;
  await new Promise(resolve=>{
   const step=()=>{
    if(job.cancelled||job.stop&&this.tracer.samples>=1){resolve();return;}
    this.tracer.renderSample();
    const done=Math.floor(this.tracer.samples);
    // Meter once early for a usable preview, then again once the noise settles.
    for(const at of [6,32])if(metered<at&&done>=Math.min(at,samples)){metered=at;this.exposure=autoExposure(this.renderer,this.tracer.target);this.renderer.toneMappingExposure=this.exposure*2**exposure;}
    onProgress(Math.min(done,samples),samples,this.tracer.isCompiling);
    if(done>=samples)resolve();else tick(step);
   };
   tick(step);
  });
  if(stopped())return null;
  const unet=await network;
  if(stopped())return null;
  if(!unet){this.denoiser='preview';return blobOf(this.canvas);}
  // Hand OIDN the plain tone-mapped average, not the smoothed preview.
  onDenoise();this.smooth=false;this.redraw();
  this.output.width=width;this.output.height=height;
  const ctx=this.output.getContext('2d');ctx.drawImage(this.canvas,0,0);
  const color=ctx.getImageData(0,0,width,height);
  const paint=(tile,rect)=>ctx.putImageData(tile,rect.x,rect.y);
  let denoised=await this.denoise(color,job,paint).catch(err=>{console.warn('OIDN failed, retrying',err);this.unet=null;return null;});
  if(!denoised&&!stopped())denoised=await this.denoise(color,job,paint).catch(err=>{console.warn('OIDN failed',err);this.unet=null;return null;});
  if(stopped())return null;
  if(denoised){this.denoiser='oidn';ctx.putImageData(denoised,0,0);this.canvas.hidden=true;this.output.hidden=false;return blobOf(this.output);}
  this.smooth=true;this.denoiser='preview';this.redraw();
  return blobOf(this.canvas);
 }
 // Repaint the accumulated image without tracing another sample.
 redraw(){this.tracer.pausePathTracing=true;this.tracer.renderSample();this.tracer.pausePathTracing=false;}
 // The denoiser gets its own device, held here so the adapter stays referenced for
 // the whole render; a lost device is rebuilt on the next request.
 network(){
  return this.unet??=(async()=>{
   const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');
   const device=await adapter.requestDevice({requiredFeatures:adapter.features.has('shader-f16')?['shader-f16']:[]});
   this.gpu={adapter,device};device.lost.then(()=>{if(this.gpu?.device===device){this.gpu=null;this.unet=null;}});
   return initUNetFromBuffer(this.weights(),{device});
  })();
 }
 denoise(color,job,onTile){
  return this.network().then(unet=>new Promise((resolve,reject)=>{job.abort=unet.tileExecute({color,done:resolve,error:reject,progress:(_,tile,rect)=>{if(tile&&!job.cancelled)onTile(tile,rect);}});}));
 }
}

// Animation frames stop while the page is hidden; a timer keeps a long render going.
const tick=fn=>{let ran=false;const go=()=>{if(!ran){ran=true;fn();}};requestAnimationFrame(go);setTimeout(go,120);};
const blobOf=canvas=>new Promise(resolve=>canvas.toBlob(resolve,'image/png'));

// Key the image so its average luminance lands near mid grey. Early samples are
// noisy (many black pixels), so a trimmed arithmetic mean is steadier than a
// log average; the brightest highlights (lamps, windows) are left out.
function autoExposure(renderer,target){
 const w=target.width,h=target.height,n=48,step=Math.max(1,Math.floor(w/n)),row=new Float32Array(w*4),lum=[];
 for(let j=0;j<n;j++){
  renderer.readRenderTargetPixels(target,0,Math.floor((j+.5)/n*h),w,1,row);
  for(let i=Math.floor(step/2);i<w;i+=step){const a=row[i*4+3]>0?row[i*4+3]:1,l=(.2126*row[i*4]+.7152*row[i*4+1]+.0722*row[i*4+2])/a;if(Number.isFinite(l))lum.push(Math.max(l,1e-4));}
 }
 if(!lum.length)return 1;
 lum.sort((a,b)=>a-b);const kept=lum.slice(0,Math.ceil(lum.length*.97));
 const avg=kept.reduce((s,l)=>s+l,0)/kept.length;
 return Math.min(Math.max(.22/avg,.02),40);
}

// The path tracer has no hemisphere light. Fold hemisphere lights and the viewer's
// soft environment into one Z-up sky/ground gradient with equivalent radiance.
// `outdoor` adds a daylight sky (radiance) seen and admitted through openings.
export function skyFrom(scene,hemispheres,outdoor=0){
 const sky=new THREE.Color(0,0,0),ground=new THREE.Color(0,0,0),env=.55*(scene.environment?scene.environmentIntensity??1:0);
 for(const h of hemispheres)if(h.visible&&h.intensity>0&&visibleChain(h)){sky.add(h.color.clone().multiplyScalar(h.intensity/Math.PI));ground.add(h.groundColor.clone().multiplyScalar(h.intensity/Math.PI));}
 sky.add(new THREE.Color(env,env,env));ground.add(new THREE.Color(env,env,env));
 if(outdoor>0){sky.add(new THREE.Color(.78,.87,1).multiplyScalar(outdoor));ground.add(new THREE.Color(.42,.4,.37).multiplyScalar(outdoor));}
 const texture=new GradientEquirectTexture(256);texture.topColor.copy(sky);texture.bottomColor.copy(ground);texture.exponent=1.4;texture.update();
 return texture;
}

function visibleChain(o){for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;}
