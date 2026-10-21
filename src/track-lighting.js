import * as THREE from 'three';

export const MAX_LAMPS=12;
// Rail positions follow the existing model's four ceiling tracks (metres, Z up).
export const RAILS=[
 {id:'main-front',label:'주실 · 도면 상단 레일',a:[1,-5.72,2.578],b:[12.75,-5.72,2.578]},
 {id:'main-back',label:'주실 · 도면 하단 레일',a:[1,-9.95,2.578],b:[12.75,-9.95,2.578]},
 {id:'upper-left',label:'상부실 · 좌측 레일',a:[1.2,-.9,2.585],b:[1.2,-3.9,2.585]},
 {id:'upper-right',label:'상부실 · 우측 레일',a:[5.1,-.9,2.585],b:[5.1,-3.9,2.585]},
];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function defaultLighting(){
 const fixtures=[];let index=0;
 for(const rail of RAILS){
  const positions=rail.id.startsWith('main')?[1.6,5,7.6,11.4].map(x=>(x-1)/11.75):[.1,.87];
  for(const t of positions)fixtures.push({id:`L${String(++index).padStart(2,'0')}`,rail:rail.id,t,enabled:true,dimmer:100,lumens:1200,kelvin:6500,beam:65,feather:60,
   yaw:rail.id==='main-front'?180:rail.id==='main-back'?0:rail.id==='upper-left'?270:90,tilt:20});
 }
 return {version:3,master:100,simulation:true,showFixtures:true,showBeams:true,indirect:true,indirectStrength:100,fixtures};
}
export function validateLighting(data){
 if(data==null)return;
 if(typeof data!=='object'||![1,2,3].includes(data.version)||!Array.isArray(data.fixtures)||data.fixtures.length>MAX_LAMPS)throw Error('레일 조명 파일 형식을 확인해 주세요.');
 const numeric=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
 if(!numeric(data.master,0,100)||['simulation','showFixtures','showBeams'].some(k=>typeof data[k]!=='boolean'))throw Error('조명 전체 설정을 확인해 주세요.');
 if(data.version>=3&&(typeof data.indirect!=='boolean'||!numeric(data.indirectStrength,0,200)))throw Error('주변 반사광 설정을 확인해 주세요.');
 const ids=new Set();
 for(const l of data.fixtures){
  if(!l||typeof l.id!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(l.id)||ids.has(l.id)||!RAILS.some(r=>r.id===l.rail)||typeof l.enabled!=='boolean'||
   !numeric(l.t,0,1)||!numeric(l.dimmer,0,100)||!numeric(l.lumens,100,3000)||!numeric(l.kelvin,2700,6500)||!numeric(l.beam,20,90)||!numeric(l.yaw,0,360)||!numeric(l.tilt,0,90)||(data.version>=2&&!numeric(l.feather,0,100)))throw Error('개별 레일 조명 설정을 확인해 주세요.');
  ids.add(l.id);
 }
}
export function upgradeLighting(raw){
 validateLighting(raw);if(raw==null)return defaultLighting();const data=structuredClone(raw);
 if(data.version===1){data.version=2;for(const l of data.fixtures){l.kelvin=6500;l.feather=60;}}
 if(data.version===2){data.version=3;data.indirect=true;data.indirectStrength=100;}
 return data;
}
export function railPoint(id,t){const r=RAILS.find(r=>r.id===id);return r.a.map((v,i)=>v+(r.b[i]-v)*clamp(t,0,1));}
export function railFraction(id,x,y){const r=RAILS.find(r=>r.id===id),dx=r.b[0]-r.a[0],dy=r.b[1]-r.a[1];return clamp(((x-r.a[0])*dx+(y-r.a[1])*dy)/(dx*dx+dy*dy),0,1);}
export function lampDirection(l){const yaw=l.yaw*Math.PI/180,tilt=l.tilt*Math.PI/180;return [-Math.sin(yaw)*Math.sin(tilt),Math.cos(yaw)*Math.sin(tilt),-Math.cos(tilt)];}
export function lampIntensity(l,master){return l.enabled?l.lumens/(2*Math.PI*(1-Math.cos(l.beam*Math.PI/360)))*l.dimmer/100*master/100:0;}
export function effectiveLumens(config){return config.fixtures.reduce((sum,l)=>sum+(l.enabled?l.lumens*l.dimmer/100:0),0)*config.master/100;}
export function kelvinColor(kelvin){
 const t=clamp(kelvin,2700,6500)/100;
 const r=t<=66?255:329.6987*(t-60)**-.1332048,g=t<=66?99.4708*Math.log(t)-161.1196:288.1222*(t-60)**-.0755148,b=t>=66?255:t<=19?0:138.5177*Math.log(t-10)-305.0448;
 return '#'+[r,g,b].map(n=>Math.round(clamp(n,0,255)).toString(16).padStart(2,'0')).join('');
}
export function reflectedColor(config){
 const color=new THREE.Color(0,0,0);let total=0;
 for(const l of config.fixtures){const weight=l.enabled?l.lumens*l.dimmer/100:0;color.add(new THREE.Color(kelvinColor(l.kelvin)).multiplyScalar(weight));total+=weight;}
 return total?color.multiplyScalar(1/total):color.set(0xffffff);
}

export class TrackLighting{
 constructor(scene,onChange=()=>{}){
  this.root=new THREE.Group();this.root.name='Space_Him_Proposed_Track_Lighting';scene.add(this.root);
  this.models=new THREE.Group();this.root.add(this.models);this.nodes=new Map();this.active=false;this.onChange=onChange;this.restore();
 }
 get selectedLamp(){return this.config.fixtures.find(l=>l.id===this.selected);}
 get pickables(){return this.active&&this.config.showFixtures?[...this.nodes.values()].map(n=>n.model):[];}
 toJSON(){return structuredClone(this.config);}
 restore(raw){
  this.config=upgradeLighting(raw);this.selected=this.config.fixtures[0]?.id||null;this.rebuild();
 }
 clear(){
  this.root.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of [o.material].flat())m.dispose();if(o.isSpotLight)o.dispose();});
  this.root.clear();this.nodes.clear();this.models=new THREE.Group();this.root.add(this.models);
 }
 rebuild(){
  this.clear();
  const railMat=new THREE.MeshStandardMaterial({color:'#c1c6c2',metalness:.55,roughness:.5});
  for(const r of RAILS){const p=new THREE.Vector3(...r.a),q=new THREE.Vector3(...r.b),bar=new THREE.Mesh(new THREE.BoxGeometry(p.distanceTo(q),.033,.035),railMat);bar.position.copy(p).add(q).multiplyScalar(.5);bar.rotation.z=Math.atan2(q.y-p.y,q.x-p.x);this.models.add(bar);}
  for(const l of this.config.fixtures){
   const model=new THREE.Group();model.userData.lampId=l.id;this.models.add(model);
   const casing=new THREE.MeshStandardMaterial({color:'#525b5b',metalness:.55,roughness:.46});
   const add=(geo,mat,p)=>{const o=new THREE.Mesh(geo,mat);o.position.set(...p);model.add(o);return o;};
   add(new THREE.BoxGeometry(.075,.05,.035),casing,[0,0,-.014]);
   const stem=add(new THREE.CylinderGeometry(.009,.009,.1,10),casing,[0,0,-.075]);stem.rotation.x=Math.PI/2;
   const head=new THREE.Group();head.position.z=-.145;model.add(head);
   const body=new THREE.Mesh(new THREE.CylinderGeometry(.052,.052,.16,24),casing);head.add(body);
   const lensMat=new THREE.MeshStandardMaterial({color:'#e3e4cf',emissive:'#fff1cf',emissiveIntensity:1,roughness:.4});
   const lens=new THREE.Mesh(new THREE.CircleGeometry(.044,24),lensMat);lens.rotation.x=-Math.PI/2;lens.position.y=.081;head.add(lens);
   const selection=add(new THREE.TorusGeometry(.069,.004,5,24),new THREE.MeshBasicMaterial({color:'#e6ad61',toneMapped:false}),[0,0,-.03]);
   const light=new THREE.SpotLight('#fff0d4',1,0,Math.PI/6,.6,2);light.name=`Rail_${l.id}`;light.castShadow=true;
   light.shadow.mapSize.set(512,512);light.shadow.camera.near=.04;light.shadow.camera.far=20;light.shadow.camera.layers.enable(1);light.shadow.normalBias=.012;light.shadow.bias=-.00015;light.shadow.autoUpdate=false;
   this.root.add(light,light.target);
   const guide=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#e2bb78',transparent:true,opacity:.4,depthWrite:false,toneMapped:false}));guide.raycast=()=>{};this.root.add(guide);
   this.nodes.set(l.id,{model,head,lens,selection,light,guide});this.syncLamp(l);
  }
  this.syncVisibility();
 }
 syncLamp(l){
  const n=this.nodes.get(l.id),point=new THREE.Vector3(...railPoint(l.rail,l.t)),dir=new THREE.Vector3(...lampDirection(l));
  n.model.position.copy(point);n.head.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  const emitter=point.clone().add(new THREE.Vector3(0,0,-.145)).addScaledVector(dir,.087);
  n.light.position.copy(emitter);n.light.target.position.copy(emitter).addScaledVector(dir,6);n.light.angle=l.beam*Math.PI/360;n.light.penumbra=l.feather/100;this.syncPower(l);n.light.shadow.needsUpdate=true;
  const length=Math.min(9,emitter.z/Math.max(.2,-dir.z)),radius=length*Math.tan(n.light.angle),rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),dir),lines=[];
  const rim=i=>new THREE.Vector3(radius*Math.cos(i*Math.PI/16),radius*Math.sin(i*Math.PI/16),-length).applyQuaternion(rotation).add(emitter);
  for(let i=0;i<32;i++){lines.push(rim(i),rim(i+1));if(i%8===0)lines.push(emitter.clone(),rim(i));}
  const innerRadius=length*Math.tan(n.light.angle*(1-n.light.penumbra));
  const inner=i=>new THREE.Vector3(innerRadius*Math.cos(i*Math.PI/16),innerRadius*Math.sin(i*Math.PI/16),-length).applyQuaternion(rotation).add(emitter);
  if(l.feather>0)for(let i=0;i<32;i+=2)lines.push(inner(i),inner(i+1));
  n.guide.geometry.dispose();n.guide.geometry=new THREE.BufferGeometry().setFromPoints(lines);
 }
 syncPower(l){const n=this.nodes.get(l.id);n.light.color.set(kelvinColor(l.kelvin));n.light.intensity=lampIntensity(l,this.config.master);n.lens.material.emissive.copy(n.light.color);n.lens.material.emissiveIntensity=n.light.intensity>0?10:0;}
 syncVisibility(){
  this.root.visible=this.active;this.models.visible=this.config.showFixtures;
  for(const l of this.config.fixtures){const n=this.nodes.get(l.id);n.selection.visible=this.selected===l.id;n.guide.visible=this.config.showBeams&&this.selected===l.id&&l.enabled&&l.dimmer>0&&this.config.master>0;}
 }
 setActive(active){this.active=active;this.syncVisibility();if(active)this.invalidateShadows();}
 select(id){if(!this.nodes.has(id))return;this.selected=id;this.syncVisibility();}
 setGlobal(patch){
  const next={...this.toJSON(),...patch};validateLighting(next);this.config=next;
  for(const l of this.config.fixtures)this.syncPower(l);this.syncVisibility();this.onChange();
 }
 edit(id,patch){
  const next=this.toJSON(),l=next.fixtures.find(l=>l.id===id);if(!l)return;Object.assign(l,patch);validateLighting(next);this.config=next;
  if(['rail','t','beam','yaw','tilt','feather'].some(k=>Object.hasOwn(patch,k)))this.syncLamp(l);else this.syncPower(l);this.syncVisibility();this.onChange();
 }
 editAll(patch){
  const next=this.toJSON();for(const l of next.fixtures)Object.assign(l,patch);validateLighting(next);this.config=next;
  for(const l of this.config.fixtures)this.syncLamp(l);this.syncVisibility();this.onChange();
 }
 move(id,x,y){const l=this.config.fixtures.find(l=>l.id===id);if(l)this.edit(id,{t:railFraction(l.rail,x,y)});}
 add(rail){
  if(this.config.fixtures.length>=MAX_LAMPS)return false;
  let i=1;while(this.config.fixtures.some(l=>l.id===`L${String(i).padStart(2,'0')}`))i++;
  const id=`L${String(i).padStart(2,'0')}`,template=this.selectedLamp||defaultLighting().fixtures[0];
  this.config.fixtures.push({...template,id,rail:rail||template.rail,t:.5});this.selected=id;this.rebuild();this.onChange();return true;
 }
 remove(id){this.config.fixtures=this.config.fixtures.filter(l=>l.id!==id);this.selected=this.config.fixtures[0]?.id||null;this.rebuild();this.onChange();}
 preset(name){
  this.config.master=name==='blackout'?0:name==='performance'?18:100;
  for(const l of this.config.fixtures){l.enabled=true;l.dimmer=100;this.syncPower(l);}this.syncVisibility();this.onChange();
 }
 invalidateShadows(){for(const n of this.nodes.values())n.light.shadow.needsUpdate=true;}
 describe(){return {...this.toJSON(),selected:this.selected,active:this.active,lamps:this.config.fixtures.map(l=>{const n=this.nodes.get(l.id);return {id:l.id,position:n.light.position.toArray(),direction:n.light.target.position.clone().sub(n.light.position).normalize().toArray(),beam:n.light.angle*360/Math.PI,feather:n.light.penumbra*100,intensity:n.light.intensity};})};}
}
