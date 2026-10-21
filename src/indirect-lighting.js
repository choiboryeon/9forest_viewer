import * as THREE from 'three';
import {railPoint,lampDirection,kelvinColor} from './track-lighting.js';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

// A small static BVH keeps the irradiance bake independent of camera cutaways.
// Geometry is queried on the CPU; the result needs only one 3D GPU texture.
export class SurfaceBVH{
 constructor(meshes=[]){
  const triangles=[];
  for(const mesh of meshes){
   mesh.updateWorldMatrix(true,false);const g=mesh.geometry,p=g?.attributes.position;if(!p)continue;
   const index=g.index,material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
   const c=material?.color||new THREE.Color(.5,.5,.5),albedo=[c.r,c.g,c.b].map(v=>Math.min(.85,.1+v*.8));
   const vertex=i=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld).toArray();
   for(let i=0;i<(index?index.count:p.count);i+=3){
    const a=vertex(i),b=vertex(i+1),c=vertex(i+2),e1=add(b,a,-1),e2=add(c,a,-1),n=cross(e1,e2);if(Math.hypot(...n)<1e-9)continue;
    triangles.push({a,e1,e2,normal:unit(n),albedo,bounds:[...a.map((v,j)=>Math.min(v,b[j],c[j])),...a.map((v,j)=>Math.max(v,b[j],c[j]))]});
   }
  }
  const build=ts=>{
   if(!ts.length)return null;
   const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(const t of ts)for(let j=0;j<3;j++){bounds[j]=Math.min(bounds[j],t.bounds[j]);bounds[j+3]=Math.max(bounds[j+3],t.bounds[j+3]);}
   if(ts.length<=10)return {bounds,triangles:ts};
   const spans=bounds.slice(3).map((v,j)=>v-bounds[j]),axis=spans.indexOf(Math.max(...spans));ts.sort((a,b)=>(a.bounds[axis]+a.bounds[axis+3])-(b.bounds[axis]+b.bounds[axis+3]));
   const mid=ts.length>>1;return {bounds,left:build(ts.slice(0,mid)),right:build(ts.slice(mid))};
  };
  this.count=triangles.length;this.root=build(triangles);this.stack=[];
 }
 cast(origin,dir,limit=30,any=false){
  if(!this.root)return Infinity;let near=limit,found=false,sp=0;this.stack[sp++]=this.root;this.hit=null;
  while(sp){
   const node=this.stack[--sp],b=node.bounds;let lo=0,hi=near;
   for(let j=0;j<3;j++){
    if(Math.abs(dir[j])<1e-10){if(origin[j]<b[j]||origin[j]>b[j+3]){hi=-1;break;}}
    else{let a=(b[j]-origin[j])/dir[j],z=(b[j+3]-origin[j])/dir[j];if(a>z)[a,z]=[z,a];lo=Math.max(lo,a);hi=Math.min(hi,z);}
   }
   if(hi<lo)continue;
   if(!node.triangles){this.stack[sp++]=node.left;this.stack[sp++]=node.right;continue;}
   for(const t of node.triangles){
    const px=dir[1]*t.e2[2]-dir[2]*t.e2[1],py=dir[2]*t.e2[0]-dir[0]*t.e2[2],pz=dir[0]*t.e2[1]-dir[1]*t.e2[0],det=t.e1[0]*px+t.e1[1]*py+t.e1[2]*pz;if(Math.abs(det)<1e-10)continue;
    const tx=origin[0]-t.a[0],ty=origin[1]-t.a[1],tz=origin[2]-t.a[2],u=(tx*px+ty*py+tz*pz)/det;if(u<0||u>1)continue;
    const qx=ty*t.e1[2]-tz*t.e1[1],qy=tz*t.e1[0]-tx*t.e1[2],qz=tx*t.e1[1]-ty*t.e1[0],v=(dir[0]*qx+dir[1]*qy+dir[2]*qz)/det;if(v<0||u+v>1)continue;
    const distance=(t.e2[0]*qx+t.e2[1]*qy+t.e2[2]*qz)/det;
    if(distance>1e-4&&distance<near){if(any)return distance;near=distance;this.hit=t;found=true;}
   }
  }
  return found?near:Infinity;
 }
}

const shaderDeclarations=`
uniform highp sampler3D nfIndirectVolume;
uniform vec3 nfIndirectMin;
uniform vec3 nfIndirectExtent;
uniform vec3 nfIndirectSize;
uniform float nfIndirectStrength;
varying vec3 nfIndirectWorld;
vec3 nfReadIndirect(vec3 p, float layer) {
 vec3 cell=clamp((p-nfIndirectMin)/nfIndirectExtent,0.0,1.0)*(nfIndirectSize-1.0)+0.5;
 return texture(nfIndirectVolume,vec3(cell.xy/nfIndirectSize.xy,(cell.z+layer*nfIndirectSize.z)/(nfIndirectSize.z*4.0))).rgb;
}
vec3 nfIndirectIrradiance(vec3 p, vec3 n) {
 return max(vec3(0.0),nfReadIndirect(p,0.0)+nfReadIndirect(p,1.0)*n.x+nfReadIndirect(p,2.0)*n.y+nfReadIndirect(p,3.0)*n.z)*nfIndirectStrength;
}`;

export class IndirectLighting{
 constructor(){
  this.active=false;this.config=null;this.cache=new Map();this.materials=new WeakSet();this.staticMeshes=[];this.dynamicRoot=null;this.revision=0;this.pending=0;this.energy=0;
  this.uniforms={nfIndirectVolume:{value:null},nfIndirectMin:{value:new THREE.Vector3()},nfIndirectExtent:{value:new THREE.Vector3(1,1,1)},nfIndirectSize:{value:new THREE.Vector3(1,1,1)},nfIndirectStrength:{value:0}};
  this.allocate([1,1,1]);
 }
 allocate(size){
  this.size=size;this.cells=size.reduce((a,b)=>a*b,1);this.texture?.dispose();
  this.pixels=new Uint16Array(this.cells*16);this.accum=new Float32Array(this.cells*12);this.texture=new THREE.Data3DTexture(this.pixels,size[0],size[1],size[2]*4);
  this.texture.type=THREE.HalfFloatType;this.texture.format=THREE.RGBAFormat;this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;this.texture.unpackAlignment=1;this.texture.needsUpdate=true;
  this.uniforms.nfIndirectVolume.value=this.texture;this.uniforms.nfIndirectSize.value.set(...size);
 }
 setRoom(meshes,metadata){
  this.staticMeshes=meshes;const bounds=metadata.bounds||{min:[0,0],max:[metadata.width_m,metadata.depth_m]},height=metadata.ceiling_m||metadata.ridge_m;
  this.min=[bounds.min[0],bounds.min[1],.09];this.extent=[bounds.max[0]-bounds.min[0],bounds.max[1]-bounds.min[1],height-.18];
  this.allocate(this.extent.map((v,i)=>Math.ceil(v/(i===2?.5:.6))+1));this.uniforms.nfIndirectMin.value.set(...this.min);this.uniforms.nfIndirectExtent.value.set(...this.extent);
  this.probes=[];for(let z=0;z<this.size[2];z++)for(let y=0;y<this.size[1];y++)for(let x=0;x<this.size[0];x++)this.probes.push([x,y,z].map((v,i)=>this.min[i]+v/(this.size[i]-1)*this.extent[i]));
  this.cache.clear();this.invalidateGeometry(true);
 }
 attach(root){
  root.traverse(mesh=>{for(const material of [mesh.material||[]].flat()){
   if(!material.isMeshStandardMaterial||this.materials.has(material))continue;this.materials.add(material);const previous=material.onBeforeCompile;
   material.onBeforeCompile=shader=>{
    previous.call(material,shader);Object.assign(shader.uniforms,this.uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 nfIndirectWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nnfIndirectWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+shaderDeclarations).replace('#include <lights_fragment_end>','irradiance+=nfIndirectIrradiance(nfIndirectWorld,inverseTransformDirection(normal,viewMatrix));\n#include <lights_fragment_end>');
   };
   material.customProgramCacheKey=()=> 'space-him-spatial-indirect-v1';material.needsUpdate=true;
  }});
 }
 setActive(active){this.active=active;this.updateStrength();}
 setLighting(config){this.config=config;this.powerDirty=true;this.updateStrength();}
 updateStrength(){this.uniforms.nfIndirectStrength.value=this.active&&this.config?.indirect&&this.config.master>0?this.config.indirectStrength/100:0;}
 setDynamic(root){this.dynamicRoot=root;this.invalidateGeometry(false);this.attach(root);}
 invalidateGeometry(staticToo=false){this.staticDirty||=staticToo;this.dynamicDirty=true;this.powerDirty=true;}
 rebuildGeometry(){
  if(this.staticDirty){this.staticBVH=new SurfaceBVH(this.staticMeshes.filter(m=>m.visible));this.staticDirty=false;}
  const meshes=[];this.dynamicRoot?.traverse(o=>{if(o.isMesh&&o.castShadow&&o.material?.isMeshStandardMaterial)meshes.push(o);});this.dynamicBVH=new SurfaceBVH(meshes);this.dynamicDirty=false;this.revision++;
 }
 firstHit(origin,dir){
  let distance=Infinity,t=null;
  for(const bvh of [this.staticBVH,this.dynamicBVH]){const d=bvh?.cast(origin,dir,distance)||Infinity;if(d<distance){distance=d;t=bvh.hit;}}
  if(!t)return null;const normal=dot(t.normal,dir)>0?t.normal.map(v=>-v):t.normal;return {position:add(origin,dir,distance),normal,albedo:t.albedo,distance};
 }
 blocked(origin,dir,distance){return (this.staticBVH?.cast(origin,dir,distance,true)||Infinity)<distance||(this.dynamicBVH?.cast(origin,dir,distance,true)||Infinity)<distance;}
 patches(l){
  const dir=lampDirection(l),origin=add(add(railPoint(l.rail,l.t),[0,0,-.145]),dir,.087),axis=unit(cross(dir,Math.abs(dir[2])<.9?[0,0,1]:[1,0,0])),other=cross(dir,axis),angle=l.beam*Math.PI/360,patches=[];
  const cone=[{dir,weight:.28}];for(let i=0;i<4;i++){const a=i*Math.PI/2,theta=angle*.6,d=add(add(dir,axis,Math.cos(a)*Math.tan(theta)),other,Math.sin(a)*Math.tan(theta));const inner=Math.cos(angle*(1-l.feather/100)),outer=Math.cos(angle),attenuation=l.feather===0?1:smooth((Math.cos(theta)-outer)/(inner-outer));cone.push({dir:unit(d),weight:.18*attenuation});}
  for(const sample of cone){const hit=this.firstHit(origin,sample.dir);if(!hit)continue;patches.push({position:add(hit.position,hit.normal,.045),normal:hit.normal,rgb:hit.albedo.map(v=>v*sample.weight),radius:Math.max(.2,hit.distance*Math.tan(angle)*.4),secondary:false});}
  // One extra diffuse reflection through an actual enclosing surface lets floor
  // spots lift adjacent floor areas via the ceiling, without a uniform fill.
  if(patches.length){const primary=patches[0],hit=this.firstHit(primary.position,primary.normal);if(hit){const reflected=[0,1,2].map(j=>patches.reduce((s,p)=>s+p.rgb[j],0));patches.push({position:add(hit.position,hit.normal,.045),normal:hit.normal,rgb:hit.albedo.map((v,j)=>v*reflected[j]*.28),radius:Math.max(.65,primary.radius*1.4),secondary:true});}}
  return patches;
 }
 bake(l,patches=this.patches(l)){
  const data=new Float32Array(this.cells*12);
  for(let i=0;i<this.probes.length;i++)for(const patch of patches){
   const delta=add(this.probes[i],patch.position,-1),r2=dot(delta,delta);if(r2<.003||r2>(patch.secondary?100:49))continue;
   const distance=Math.sqrt(r2),direction=delta.map(v=>v/distance),cosine=dot(patch.normal,direction);if(cosine<=.005||this.blocked(patch.position,direction,distance-.03))continue;
   const irradiance=cosine/(Math.PI*(r2+patch.radius*patch.radius)),basis=[.25,-direction[0]*.5,-direction[1]*.5,-direction[2]*.5];
   for(let k=0;k<4;k++)for(let j=0;j<3;j++)data[i*12+k*3+j]+=patch.rgb[j]*irradiance*basis[k];
  }
  return {data,patches};
 }
 key(l){return JSON.stringify([this.revision,l.rail,l.t,l.yaw,l.tilt,l.beam,l.feather]);}
 tick(){
  if(!this.active||!this.config||!this.probes)return;
  if(this.staticDirty||this.dynamicDirty)this.rebuildGeometry();
  const enabled=this.config.indirect&&this.config.indirectStrength>0&&this.config.master>0?this.config.fixtures.filter(l=>l.enabled&&l.dimmer>0):[];
  const pending=enabled.filter(l=>this.cache.get(l.id)?.key!==this.key(l));
  for(const l of pending.slice(0,2)){const result=this.bake(l);result.key=this.key(l);this.cache.set(l.id,result);this.powerDirty=true;}
  this.pending=Math.max(0,pending.length-2);
  if(this.powerDirty){this.compose(enabled);this.powerDirty=false;}
 }
 compose(enabled){
  this.accum.fill(0);this.energy=0;
  for(const l of enabled){const cached=this.cache.get(l.id);if(!cached)continue;const color=new THREE.Color(kelvinColor(l.kelvin)),rgb=[color.r,color.g,color.b],power=l.lumens*l.dimmer/100*this.config.master/100;
   for(let i=0;i<this.accum.length;i++){const value=cached.data[i]*power*rgb[i%3];this.accum[i]+=value;this.energy+=Math.abs(value);}
  }
  for(let i=0;i<this.cells;i++)for(let k=0;k<4;k++)for(let j=0;j<3;j++)this.pixels[(k*this.cells+i)*4+j]=THREE.DataUtils.toHalfFloat(Math.max(-65504,Math.min(65504,this.accum[i*12+k*3+j])));
  this.texture.needsUpdate=true;
 }
 describe(){return {active:this.active,enabled:!!this.config?.indirect,strength:this.config?.indirectStrength||0,pending:this.pending,energy:this.uniforms.nfIndirectStrength.value?this.energy:0,grid:this.size,triangles:(this.staticBVH?.count||0)+(this.dynamicBVH?.count||0),sources:this.config?.fixtures.flatMap(l=>{const c=this.cache.get(l.id);return c?c.patches.map(p=>({lamp:l.id,position:p.position,normal:p.normal,secondary:p.secondary})):[];})||[]};}
}
