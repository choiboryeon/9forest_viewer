import * as THREE from 'three';
import {IndirectLighting} from './indirect-lighting.js';

const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
export const WESS_SUN_DIRECTION=unit([.18,.72,-1]);
export const defaultDaylight=()=>({version:1,sky:100,sun:35,artificial:0,bounce:true});
export function validateDaylight(data){
 if(data==null)return;
 if(typeof data!=='object'||Array.isArray(data)||data.version!==1||typeof data.bounce!=='boolean'||['sky','sun','artificial'].some(k=>!Number.isFinite(data[k])||data[k]<0||data[k]>150))throw Error('WESS 자연광 설정을 확인해 주세요.');
}

// Window emitters and their first surface reflections share the directional
// irradiance volume used by the rail lights. No global fill is added indoors.
export class WindowIrradiance extends IndirectLighting{
 key(l){return JSON.stringify([this.revision,l.id]);}
 patches(l){
  if(l.supplement){
   const hit=this.firstHit(l.supplement,[0,0,-1]);return hit?[{position:add(hit.position,hit.normal,.06),normal:hit.normal,rgb:hit.albedo.map(v=>v*.3),radius:1.2,secondary:true}]:[];
  }
  const w=l.window,patches=[],nx=3,nz=4,normal=w.normal,area=(w.max[w.axis]-w.min[w.axis])*(w.max[2]-w.min[2]),weight=area/(nx*nz);
  for(let x=0;x<nx;x++)for(let z=0;z<nz;z++){
   const origin=w.min.map((v,i)=>i===w.axis?v+(w.max[i]-v)*(x+.5)/nx:i===2?v+(w.max[i]-v)*(z+.5)/nz:(v+w.max[i])/2);
   const position=add(origin,normal,.06),transmission=w.transmission;
   if(l.sun){
    const cosine=normal.reduce((s,v,i)=>s+v*WESS_SUN_DIRECTION[i],0),hit=cosine>0?this.firstHit(position,WESS_SUN_DIRECTION):null;if(!hit)continue;
    const primary={position:add(hit.position,hit.normal,.06),normal:hit.normal,rgb:hit.albedo.map(v=>v*weight*transmission*cosine*.6),radius:.4,secondary:true};patches.push(primary);
    const next=this.firstHit(primary.position,primary.normal);if(next)patches.push({position:add(next.position,next.normal,.06),normal:next.normal,rgb:next.albedo.map((v,i)=>v*primary.rgb[i]*.22),radius:.8,secondary:true});
    continue;
   }
   patches.push({position,normal,rgb:[1,1,1].map(()=>weight*transmission),radius:.22,secondary:false,window:true});
   // Multiple inward directions spread transmitted skylight over actual room
   // surfaces. First-hit queries include the ceiling even in cutaway views.
   const tangent=w.axis===0?[1,0,0]:[0,1,0];
   for(const [side,down] of [[-.55,-.8],[0,-.55],[.55,-.8],[0,.45]]){
    const direction=unit(add(add(normal,tangent,side),[0,0,1],down)),hit=this.firstHit(position,direction);if(!hit)continue;
    patches.push({position:add(hit.position,hit.normal,.055),normal:hit.normal,rgb:hit.albedo.map(v=>v*weight*transmission*.17),radius:.38,secondary:true});
   }
  }
  return patches;
 }
 bake(l){
  const all=this.patches(l),reflected=all.filter(p=>!p.window),direct=all.filter(p=>p.window);
  // Keep the direct window contribution separate so reflected light can be
  // toggled without turning daylight off or rebuilding visibility.
  const primary=super.bake(l,direct),bounce=super.bake(l,reflected);
  return {data:primary.data,bounce:bounce.data,patches:all};
 }
 compose(enabled){
  // The base composer handles source colour, dimming and half-float upload.
  for(const l of enabled){const c=this.cache.get(l.id);if(!c)continue;c.direct??=c.data;c.combined??=new Float32Array(c.data.length);for(let i=0;i<c.data.length;i++)c.combined[i]=c.direct[i]+(this.bounce?c.bounce[i]:0);c.data=c.combined;}
  super.compose(enabled);
 }
}

export class WessDaylight{
 constructor(scene,onChange=()=>{}){
  this.config=defaultDaylight();this.onChange=onChange;this.active=false;this.volume=new WindowIrradiance();this.group=new THREE.Group();scene.add(this.group);this.glass=[];this.masks=[];
  this.sun=new THREE.DirectionalLight(0xfff2d9,0);this.sun.position.set(-4,-14,22);this.sun.target.position.set(0,2,0);this.group.add(this.sun,this.sun.target);
  this.sun.castShadow=true;this.sun.shadow.autoUpdate=false;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-11,right:11,top:9,bottom:-9,near:.1,far:50});this.sun.shadow.camera.layers.enable(1);this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.bias=-.00008;this.sun.shadow.normalBias=.008;this.sun.shadow.radius=2;
  this.lamps=[];
  // A small optional supplement only; the default is daylight with lamps off.
  for(const p of [[3.4,2.5,2.55],[6.7,2.8,2.55],[9.7,3.1,2.55]]){
   const light=new THREE.SpotLight(0xf3f6ff,0,6,Math.PI/3,.85,2);light.position.set(...p);light.target.position.set(p[0],p[1],0);light.castShadow=true;light.shadow.autoUpdate=false;light.shadow.mapSize.set(512,512);light.shadow.camera.layers.enable(1);light.shadow.normalBias=.015;this.group.add(light,light.target);this.lamps.push(light);
  }
  this.setActive(false);
 }
 setRoom(meshes,metadata,glass){
  for(const m of this.masks){this.group.remove(m);m.geometry.dispose();m.material.dispose();}this.masks=[];
  this.glass=glass;this.windows=glass.map(mesh=>{
   const b=new THREE.Box3().setFromObject(mesh),axis=mesh.name==='Window_Glass_08'||/^Window_Glass_0[0-3]$/.test(mesh.name)?0:1,normal=axis===0?[0,1,0]:[1,0,0];
   // Photos show a raised sill on the return window. The source OBJ models
   // floor-height glass; mask only its light aperture, preserving source data.
   if(axis===1){
    const sill=.85,material=new THREE.MeshBasicMaterial({color:'#c7c9c4',colorWrite:false,depthWrite:false});material.shadowSide=THREE.DoubleSide;
    const mask=new THREE.Mesh(new THREE.BoxGeometry(.03,b.max.y-b.min.y,sill),material);mask.position.set((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,sill/2);mask.castShadow=true;mask.name='WESS_photo_sill_'+mesh.name;this.masks.push(mask);this.group.add(mask);b.min.z=sill;
   }
   return {id:mesh.name,min:b.min.toArray(),max:b.max.toArray(),axis,normal,transmission:axis===0?.72:.9};
  });
  this.dynamicAt=0;this.volume.setRoom([...meshes,...this.masks],metadata);this.invalidateShadows();this.apply();
 }
 attach(root){this.volume.attach(root);}
 setDynamic(root,defer=false){
  this.invalidateShadows();
  if(defer){this.volume.dynamicRoot=root;this.volume.attach(root);this.dynamicAt=performance.now()+120;}
  else{this.dynamicAt=0;this.volume.setDynamic(root);}
 }
 invalidateShadows(){for(const l of [this.sun,...this.lamps])l.shadow.needsUpdate=true;}
 invalidateGeometry(){this.volume.invalidateGeometry(true);this.invalidateShadows();}
 setActive(active){this.active=active;this.group.visible=active;this.volume.setActive(active);if(active)this.invalidateShadows();this.apply();}
 restore(data){validateDaylight(data);this.config=data?structuredClone(data):defaultDaylight();this.apply();}
 edit(patch){const next={...this.config,...patch};validateDaylight(next);this.config=next;this.apply();this.onChange();}
 apply(){
  this.sun.intensity=this.config.sun/100*12;this.sun.visible=this.active&&this.config.sun>0;
  // Match the direction used for the daylight reference, not a surveyed sun path.
  this.sun.target.position.set(4,2,0);this.sun.position.fromArray(add([4,2,0],WESS_SUN_DIRECTION,-22));
  for(const light of this.lamps){light.intensity=this.config.artificial/100*8;light.visible=this.active&&this.config.artificial>0;}
  for(const mesh of this.glass){mesh.material.emissiveIntensity=this.config.sky/100*.18;}
  this.volume.bounce=this.config.bounce;
  const fixtures=(this.windows||[]).flatMap(w=>[{id:w.id,window:w,enabled:true,dimmer:this.config.sky,lumens:45,kelvin:6500},{id:w.id+'-sun',window:w,sun:true,enabled:this.config.bounce,dimmer:this.config.sun,lumens:90,kelvin:5500}]);
  this.lamps.forEach((l,i)=>fixtures.push({id:'supplement-'+i,supplement:l.position.toArray(),enabled:this.config.bounce,dimmer:this.config.artificial,lumens:25,kelvin:6000}));
  this.volume.setLighting({indirect:true,indirectStrength:100,master:100,fixtures});
 }
 tick(){if(this.dynamicAt){if(performance.now()<this.dynamicAt)return;this.dynamicAt=0;this.volume.invalidateGeometry(false);}this.volume.tick();}
 toJSON(){return structuredClone(this.config);}
 describe(){return {...this.volume.describe(),pending:this.dynamicAt?1:this.volume.pending,active:this.active,config:this.toJSON(),windows:this.windows||[],sunDirection:WESS_SUN_DIRECTION};}
}

export function daylightEditor(element,rig){
 const presets={daylight:defaultDaylight(),overcast:{...defaultDaylight(),sky:65,sun:0},supplement:{...defaultDaylight(),artificial:12}};
 function render(){
  const c=rig.config;
  element.className='lighting-editor';element.innerHTML=`<p class="mini-note">두 창면에서 들어오는 자연광과 벽·바닥의 반사광을 조절합니다. 기본 인공조명은 꺼져 있습니다.</p><div class="light-presets"><button data-daylight-preset="daylight">자연광</button><button data-daylight-preset="overcast">흐린 날</button><button data-daylight-preset="supplement">보조광 최소</button></div>${[['sky','창으로 들어오는 확산광'],['sun','창가 햇빛'],['artificial','실내 보조조명']].map(([key,label])=>`<div class="light-slider"><label for="daylight-${key}">${label}<output id="daylight-${key}-value">${c[key]}%</output></label><input id="daylight-${key}" type="range" min="0" max="150" step="1" value="${c[key]}"></div>`).join('')}<div class="light-switches"><label><input type="checkbox" id="daylight-bounce" ${c.bounce?'checked':''}>주변 반사광</label></div><p class="mini-note">사진 기준 주간 채광의 근사입니다. 햇빛 방향은 참고값이며 실제 시각·방위에 따른 일조 계산은 아닙니다.</p>`;
  for(const key of ['sky','sun','artificial'])element.querySelector('#daylight-'+key).addEventListener('input',e=>{rig.edit({[key]:Number(e.target.value)});element.querySelector('#daylight-'+key+'-value').textContent=e.target.value+'%';});
  element.querySelector('#daylight-bounce').addEventListener('change',e=>rig.edit({bounce:e.target.checked}));
  for(const b of element.querySelectorAll('[data-daylight-preset]'))b.addEventListener('click',()=>{rig.edit(presets[b.dataset.daylightPreset]);render();});
 }
 return {render};
}
