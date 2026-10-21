import * as THREE from 'three';
import {projectionFor} from './projection.js';

export const defaultProjection=()=>({version:1,enabled:true,brightness:100,lumens:3000,content:'white',color:'#709dff',showGuides:true,mediaName:'',poster:null});
export function validateProjection(c){
 if(c==null)return;
 const number=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
 if(!c||c.version!==1||typeof c.enabled!=='boolean'||typeof c.showGuides!=='boolean'||!number(c.brightness,0,100)||!number(c.lumens,500,10000)||!['white','black','color','pulse','image','video'].includes(c.content)||typeof c.color!=='string'||!/^#[0-9a-f]{6}$/i.test(c.color)||typeof c.mediaName!=='string'||c.mediaName.length>240||!(c.poster===null||typeof c.poster==='string'&&c.poster.length<1200000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(c.poster)))throw Error('프로젝터 화면 설정을 확인해 주세요.');
}
const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
// Average linear-light RGB, so a black video frame contributes no reflected light.
export function frameColors(pixels,width,height){
 const halves=[[0,0,0],[0,0,0]],counts=[0,0];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const h=x<width/2?0:1,i=(y*width+x)*4;for(let j=0;j<3;j++)halves[h][j]+=linear(pixels[i+j]);counts[h]++;}
 return halves.map((rgb,h)=>rgb.map(v=>v/Math.max(1,counts[h])));
}
export function projectorPower(config,area,colors){
 const flux=config.enabled?config.lumens*config.brightness/100:0;
 return {gain:1-Math.exp(-flux/Math.max(.05,area)/180),halves:colors.map(rgb=>rgb.map(v=>v*flux*.55/2))};
}
const dispose=node=>node.traverse(o=>{o.geometry?.dispose();for(const m of [o.material||[]].flat())m.dispose();});

export class ProjectorLighting{
 constructor(root,onChange=()=>{}){
  this.root=root;this.onChange=onChange;this.records=new Map();this.active=false;this.lastTick=0;
  // Keep the shadow budget bounded alongside twelve track lights. A single
  // projection gets two samples; the two brightest surfaces get one each otherwise.
  this.bounce=Array.from({length:2},()=>{const l=new THREE.SpotLight(0xffffff,0,0,Math.PI*.48,.8,2);l.castShadow=true;l.shadow.mapSize.set(512,512);l.shadow.camera.near=.03;l.shadow.camera.far=22;l.shadow.camera.layers.enable(1);l.shadow.normalBias=.012;l.shadow.bias=-.00015;l.shadow.autoUpdate=false;root.add(l,l.target);return l;});
 }
 setActive(active){this.active=active;this.root.visible=active;for(const r of this.records.values())if(!active)r.video?.pause();else if(r.playing)r.video?.play().catch(()=>{});}
 clear(){for(const r of this.records.values())this.release(r);this.records.clear();for(const l of this.bounce)l.intensity=0;}
 release(r){r.video?.pause();if(r.video){r.video.removeAttribute('src');r.video.load();}if(r.url)URL.revokeObjectURL(r.url);r.texture.dispose();dispose(r.group);this.root.remove(r.group);}
 settings(id){const r=this.records.get(id),c=structuredClone(r?.config||defaultProjection());if(r?.video?.readyState>=2)c.poster=r.canvas.toDataURL('image/jpeg',.82);return c;}
 create(item){
  const config=item.projection?structuredClone(item.projection):defaultProjection();validateProjection(config);item.projection=config;
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=432;
  const sample=document.createElement('canvas');sample.width=32;sample.height=18;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
  const group=new THREE.Group();group.name='Projector_screen_'+item.uid;this.root.add(group);
  const r={item,config,canvas,ctx:canvas.getContext('2d'),sample,sampleCtx:sample.getContext('2d',{willReadFrequently:true}),texture,group,colors:[[1,1,1],[1,1,1]],video:null,image:null,url:null,playing:false,p:null,geometryKey:'',frameTime:-1};
  this.records.set(item.uid,r);this.paint(r,0);
  if(config.poster){const image=new Image();image.onload=()=>{if(this.records.get(item.uid)!==r||r.config.poster!==config.poster)return;r.image=image;this.paint(r,0);this.refreshPower();};image.src=config.poster;}
  return r;
 }
 sync(items,meta,floorAt){
  const projectors=items.filter(it=>it.type==='PROJECTOR'),ids=new Set(projectors.map(it=>it.uid));
  for(const [id,r] of this.records)if(!ids.has(id)){this.release(r);this.records.delete(id);}
  for(const item of projectors){
   const r=this.records.get(item.uid)||this.create(item);r.item=item;r.p=projectionFor(item,meta.projectionWalls);
   const key=JSON.stringify([r.p,item.x,item.y,item.rotation,floorAt(meta,item.x,item.y)]);
   if(key!==r.geometryKey){r.geometryKey=key;this.buildScreen(r,floorAt(meta,item.x,item.y));}
  }
  this.invalidateShadows();this.refreshPower();
 }
 buildScreen(r,floorZ){
  dispose(r.group);r.group.clear();r.screen=null;r.guides=null;if(!r.p)return;
  const p=r.p,a=p.wallA,b=p.wallB,len=Math.hypot(b[0]-a[0],b[1]-a[1]),t=new THREE.Vector3((b[0]-a[0])/len,(b[1]-a[1])/len,0),n=new THREE.Vector3(-t.y,t.x,0);
  if(n.x*(r.item.x-p.center[0])+n.y*(r.item.y-p.center[1])<0)n.negate();
  const center=new THREE.Vector3(...p.center,floorZ+.22+p.height/2).addScaledVector(n,.018);r.center=center;r.normal=n;r.tangent=t;r.area=p.width*p.height;
  // Invalid oversized/oblique placements retain the warning guide, but do not
  // invent a luminous rectangle beyond the physical wall.
  const width=Math.min(p.width,6),height=Math.min(p.height,2.5),points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>new THREE.Vector3(...p.center,floorZ+.22+height/2).addScaledVector(n,.018).addScaledVector(t,x*width/2).add(new THREE.Vector3(0,0,z*height/2)));
  const geometry=new THREE.BufferGeometry().setFromPoints(points);geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,1,2,0,2,3]);
  const material=new THREE.MeshBasicMaterial({map:r.texture,color:0xffffff,side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  r.screen=new THREE.Mesh(geometry,material);r.screen.raycast=()=>{};r.screen.renderOrder=2;r.group.add(r.screen);
  const guides=new THREE.Group(),color=p.valid?0x7ebed1:0xde925e;
  guides.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color,transparent:true,opacity:.65,toneMapped:false})));
  const angle=r.item.rotation*Math.PI/180,lens=new THREE.Vector3(r.item.x-Math.sin(angle)*.16,r.item.y+Math.cos(angle)*.16,floorZ+.092);
  const lines=points.flatMap(v=>[lens,v]);guides.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines),new THREE.LineBasicMaterial({color,transparent:true,opacity:.18,toneMapped:false})));guides.traverse(o=>o.raycast=()=>{});r.guides=guides;r.group.add(guides);
 }
 paint(r,now){
  const {ctx,canvas,config:c}=r;ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  const media=c.content==='video'&&r.video?.readyState>=2?r.video:['image','video'].includes(c.content)?r.image:null;
  if(media&&(media.videoWidth||media.naturalWidth)>0){const w=media.videoWidth||media.naturalWidth,h=media.videoHeight||media.naturalHeight,scale=Math.min(canvas.width/w,canvas.height/h);ctx.drawImage(media,(canvas.width-w*scale)/2,(canvas.height-h*scale)/2,w*scale,h*scale);}
  else if(c.content==='white'||c.content==='color'||c.content==='pulse'){const pulse=c.content==='pulse'?(1-Math.cos(now*Math.PI/2000))/2:1;ctx.fillStyle=c.content==='color'?c.color:`rgb(${Math.round(255*pulse)} ${Math.round(255*pulse)} ${Math.round(255*pulse)})`;ctx.fillRect(0,0,canvas.width,canvas.height);}
  r.texture.needsUpdate=true;r.sampleCtx.drawImage(canvas,0,0,32,18);r.colors=frameColors(r.sampleCtx.getImageData(0,0,32,18).data,32,18);
 }
 refreshPower(){
  const sources=[];
  for(const r of this.records.values()){
   const power=projectorPower(r.config,r.area||1,r.colors),valid=r.p?.valid;
   r.power=power;if(r.screen){r.screen.visible=!!valid&&r.config.enabled;r.screen.material.color.setScalar(power.gain);r.guides.visible=r.config.showGuides;}
   if(valid&&r.config.enabled){const energy=power.halves.reduce((sum,rgb)=>sum+rgb.reduce((s,v)=>s+v,0),0);sources.push({r,energy});}
  }
  sources.sort((a,b)=>b.energy-a.energy);this.bounceCount=sources.length;
  for(let i=0;i<2;i++){
   const l=this.bounce[i],source=sources.length===1?sources[0]:sources[i];
   if(!source){l.intensity=0;continue;}
   const r=source.r,rgb=sources.length===1?r.power.halves[i]:r.power.halves[0].map((v,j)=>v+r.power.halves[1][j]),max=Math.max(...rgb);
   l.color.setRGB(...rgb.map(v=>max?v/max:0));l.intensity=max/(2*Math.PI*(1-Math.cos(l.angle)));
   const pos=r.center.clone().addScaledVector(r.normal,.14).addScaledVector(r.tangent,sources.length===1?(i?1:-1)*r.p.width/4:0);
   if(l.position.distanceToSquared(pos)>1e-10){l.position.copy(pos);l.target.position.copy(pos).addScaledVector(r.normal,5);l.shadow.needsUpdate=true;}
  }
 }
 edit(id,patch){
  const r=this.records.get(id);if(!r)return;const next={...r.config,...patch};validateProjection(next);r.config=next;r.item.projection=next;
  if(next.content!=='video')r.video?.pause();else if(r.playing&&this.active)r.video?.play().catch(()=>{});
  this.paint(r,performance.now());this.refreshPower();this.onChange();
 }
 async loadMedia(id,file){
  const r=this.records.get(id);if(!r)return;
  if(!/^(image|video)\//.test(file.type))throw Error('이미지 또는 영상 파일을 선택해 주세요.');
  const ticket=Symbol();r.loadTicket=ticket;
  const video=file.type.startsWith('video/'),url=URL.createObjectURL(file),media=video?document.createElement('video'):new Image();
  if(video){media.muted=true;media.loop=true;media.playsInline=true;media.preload='auto';}
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('미디어를 읽지 못했습니다. 파일 형식과 코덱을 확인해 주세요.')),20000);media[video?'onloadeddata':'onload']=()=>{clearTimeout(timer);resolve();};media.onerror=()=>{clearTimeout(timer);reject(Error('이 브라우저가 읽을 수 없는 미디어입니다. 다른 형식의 파일을 선택해 주세요.'));};media.src=url;if(video)media.load();});}catch(e){URL.revokeObjectURL(url);if(video){media.pause();media.removeAttribute('src');media.load();}throw e;}
  if(this.records.get(id)!==r||r.loadTicket!==ticket){URL.revokeObjectURL(url);if(video){media.pause();media.removeAttribute('src');media.load();}return;}
  r.video?.pause();if(r.url)URL.revokeObjectURL(r.url);r.url=url;r.video=video?media:null;r.image=video?null:media;r.playing=video;
  r.config={...r.config,content:video?'video':'image',mediaName:file.name.slice(0,240),poster:null};r.item.projection=r.config;this.paint(r,performance.now());
  r.config.poster=r.canvas.toDataURL('image/jpeg',.82);if(video){const poster=new Image();poster.src=r.config.poster;r.image=poster;if(this.active)await media.play().catch(()=>{r.playing=false;});}
  this.refreshPower();this.onChange();
 }
 toggleVideo(id){const r=this.records.get(id);if(!r?.video)return;r.playing=!r.playing;if(r.playing)r.video.play().catch(()=>{r.playing=false;});else r.video.pause();this.onChange();}
 tick(now){
  if(!this.active||now-this.lastTick<80)return;this.lastTick=now;let changed=false;
  for(const r of this.records.values())if(r.config.content==='pulse'||r.config.content==='video'&&r.video?.readyState>=2&&r.video.currentTime!==r.frameTime){this.paint(r,now);r.frameTime=r.video?.currentTime;changed=true;}
  if(changed)this.refreshPower();
 }
 invalidateShadows(){for(const l of this.bounce)l.shadow.needsUpdate=true;}
 describe(){return {active:this.active,reflectedSurfaces:this.bounceCount||0,projectors:[...this.records.values()].map(r=>({id:r.item.uid,config:structuredClone(r.config),valid:!!r.p?.valid,center:r.center?.toArray(),area:r.area,colors:r.colors,gain:r.power?.gain,playing:!!r.video&&!r.video.paused})),lights:this.bounce.map(l=>({position:l.position.toArray(),color:l.color.toArray(),intensity:l.intensity}))};}
}
