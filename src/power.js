import * as THREE from 'three';
import {canPlace} from './spatial.js';
import {english,floorSegments,placeLabels} from './wiring.js';

// Power lines for the tech rider: every item whose equipment entry asks for power
// (`power.sockets`) gets a floor cable from the plan's wall outlet with the
// shortest route. A route drops from the outlet to the floor, runs along that
// wall's base, then turns straight to a power strip under the item.
const RUN=.06,FLOOR_Z=.012,STRIP_Z=.03;
const LETTER={N:'북',S:'남',W:'서',E:'동'};

// Outlets come from the room meshes named Outlet_<N|S|W|E>_plan_blue_dot.
export function findOutlets(meshes,meta){
 const out=[],box=new THREE.Box3(),c=new THREE.Vector3();
 for(const m of meshes){
  const hit=/^Outlet_([NSWE])_plan_blue_dot$/.exec(m.name);if(!hit)continue;
  box.setFromObject(m);box.getCenter(c);
  // Inward normal: the axis direction that reaches walkable floor soonest.
  let best=null;
  for(const n of [[1,0],[-1,0],[0,1],[0,-1]])for(let t=.02;t<=.6;t+=.02){if(canPlace(meta,c.x+n[0]*t,c.y+n[1]*t,0,0,.01)){if(!best||t<best.t)best={n,t};break;}}
  if(!best)continue;
  const face=[c.x+best.n[0]*best.t,c.y+best.n[1]*best.t];
  out.push({id:hit[1],label:`콘센트 ${hit[1]} (${LETTER[hit[1]]}측 벽)`,point:[c.x,c.y,c.z],normal:best.n,run:[face[0]+best.n[0]*RUN,face[1]+best.n[1]*RUN]});
 }
 return out;
}
const len=pts=>pts.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1],p[2]-pts[i][2]),0);
function clearPath(meta,a,b){const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1));for(let i=0;i<=steps;i++){const t=i/steps;if(!canPlace(meta,a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,0,0,.005))return false;}return true;}
// Candidate routes from one outlet: along its own wall then straight to the strip,
// or along its wall to the corner and on along the next wall. Each is scored by
// length with the final run across open floor weighted (trip hazard), so cables
// prefer to hug the walls.
const OPEN_FLOOR_WEIGHT=2.5;
function finish(outlet,runs,strip){
 const p=outlet.point,pts=[[p[0],p[1],p[2]],[outlet.run[0],outlet.run[1],p[2]],...runs.map(([x,y])=>[x,y,FLOOR_Z]),[strip[0],strip[1],FLOOR_Z]];
 const clean=pts.filter((q,i)=>i===0||Math.hypot(q[0]-pts[i-1][0],q[1]-pts[i-1][1],q[2]-pts[i-1][2])>.005),last=runs.at(-1);
 const open=Math.hypot(strip[0]-last[0],strip[1]-last[1]),length=len(clean);
 return {points:clean,length,score:length+open*(OPEN_FLOOR_WEIGHT-1)};
}
export function routeFor(outlet,strip,meta){
 const [ox,oy]=outlet.run,[nx,ny]=outlet.normal,tx=-ny,ty=nx,out=[];
 const along=(strip[0]-ox)*tx+(strip[1]-oy)*ty,foot=[ox+tx*along,oy+ty*along];
 if(clearPath(meta,[ox,oy],foot)&&clearPath(meta,foot,strip))out.push(finish(outlet,[[ox,oy],foot],strip));
 // Corner route: follow the wall towards the strip until the next wall.
 const dir=Math.sign(along)||1;let t=0;
 while(t<20&&canPlace(meta,ox+tx*dir*(t+.02),oy+ty*dir*(t+.02),0,0,.005))t+=.02;
 const reach=Math.max(0,t-RUN),corner=[ox+tx*dir*reach,oy+ty*dir*reach];
 if(reach>.05){
  const along2=(strip[0]-corner[0])*nx+(strip[1]-corner[1])*ny,foot2=[corner[0]+nx*along2,corner[1]+ny*along2];
  if(clearPath(meta,corner,foot2)&&clearPath(meta,foot2,strip))out.push(finish(outlet,[[ox,oy],corner,foot2],strip));
 }
 return out.sort((a,b)=>a.score-b.score)[0]||null;
}
// Consumers: [{uid,title,x,y,rotation,sockets}] → [{consumer,outlet,points,length}]
export function planPower(outlets,consumers,meta){
 return consumers.map(c=>{
  // The strip sits under the desk on the user's side (local -Y).
  const r=c.rotation*Math.PI/180,strip=[c.x+Math.sin(r)*.15,c.y-Math.cos(r)*.15];
  let best=null;for(const o of outlets){const route=routeFor(o,strip,meta);if(route&&(!best||route.score<best.score))best={...route,outlet:o};}
  return best&&{consumer:c,strip,...best};
 }).filter(Boolean);
}

// Signal runs (audio XLR, video SDI/HDMI) between two pieces of gear: either straight across the floor
// or out to the nearest wall, along it, and back in; scored like power runs so
// long cables follow the walls. They keep a little further off the wall (SIGNAL_RUN)
// than power so the two kinds of line stay apart.
const SIGNAL_RUN=.14;
function wallLines(meta,p){
 const out=[];
 for(const n of [[1,0],[-1,0],[0,1],[0,-1]]){let t=0;while(t<16&&canPlace(meta,p[0]+n[0]*(t+.02),p[1]+n[1]*(t+.02),0,0,.005))t+=.02;if(t<16&&t>SIGNAL_RUN)out.push({axis:n[0]?0:1,value:p[n[0]?0:1]+(n[0]||n[1])*(t-SIGNAL_RUN)});}
 return out;
}
// Every floor segment is axis-aligned (right angles), like the power runs:
// along one wall, around a corner along two walls, or as a plain L.
// `avoid`: seat positions [[x,y],...]; floor runs passing within SEAT_CLEAR of a
// seat cost extra (trip hazard in the audience), so equal routes go around seats.
const SEAT_CLEAR=.38,SEAT_PENALTY=3;
function seatCost(legs,avoid){let cost=0;for(let i=1;i<legs.length;i++){const a=legs[i-1],b=legs[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1));for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,y=a[1]+(b[1]-a[1])*k/n;if(avoid.some(p=>Math.hypot(p[0]-x,p[1]-y)<SEAT_CLEAR))cost+=.1*SEAT_PENALTY;}}return cost;}
export function signalRoute(a,b,meta,avoid=[]){
 const cands=[],A=[a[0],a[1]],B=[b[0],b[1]];
 const push=(runs,open)=>{const legs=[A,...runs,B];for(let i=1;i<legs.length;i++)if(!clearPath(meta,legs[i-1],legs[i]))return;
  const pts=[a,[a[0],a[1],FLOOR_Z],...runs.map(([x,y])=>[x,y,FLOOR_Z]),[b[0],b[1],FLOOR_Z],b];const clean=pts.filter((q,i)=>i===0||Math.hypot(q[0]-pts[i-1][0],q[1]-pts[i-1][1],q[2]-pts[i-1][2])>.005),length=len(clean);cands.push({points:clean,length,score:length+open*(OPEN_FLOOR_WEIGHT-1)+seatCost(legs,avoid)});};
 const at=(p,axis,value)=>{const q=[...p];q[axis]=value;return q;};
 const la=wallLines(meta,A),lb=wallLines(meta,B);
 for(const L of [...la,...lb]){const pa=at(A,L.axis,L.value),pb=at(B,L.axis,L.value);push([pa,pb],Math.abs(pa[L.axis]-A[L.axis])+Math.abs(pb[L.axis]-B[L.axis]));}
 for(const La of la)for(const Lb of lb){if(La.axis===Lb.axis)continue;const pa=at(A,La.axis,La.value),corner=at(pa,Lb.axis,Lb.value),pb=at(B,Lb.axis,Lb.value);push([pa,corner,pb],Math.abs(pa[La.axis]-A[La.axis])+Math.abs(pb[Lb.axis]-B[Lb.axis]));}
 // A plain right-angle L competes too: it wins for short hops, while its open-floor
 // weight sends long runs to the walls instead of across the audience.
 for(const k of [[B[0],A[1]],[A[0],B[1]]])push([k],Math.abs(B[0]-A[0])+Math.abs(B[1]-A[1]));
 return cands.sort((x,y)=>x.score-y.score)[0]||null;
}
// links: [{from:{title,point},to:{title,point},kind}] → routes with points/length
export function planSignals(links,meta,avoid=[]){return links.map(l=>{const r=signalRoute(l.from.point,l.to.point,meta,avoid);return r&&{...l,...r};}).filter(Boolean);}
// Cable colours (also the legend in the view bar): power orange, audio blue,
// video violet. Audio = XLR and instrument (TS) cables; video = HDMI/SDI.
export const SIGNAL_COLORS={XLR:'#2f86ff',TS:'#2f86ff',SDI:'#b065ff',HDMI:'#b065ff'};
export const AUDIO_KINDS=new Set(['XLR','TS']);
// A polyline as one tube whose corners are filleted (rounded) with radius up to
// FILLET, clipped to half of each adjoining segment.
const FILLET=.14;
function filletPath(points,maxRadius=FILLET){
 const v=points.map(p=>new THREE.Vector3(...p)),path=new THREE.CurvePath();let from=v[0];
 for(let i=1;i<v.length-1;i++){
  const a=v[i-1],b=v[i],c=v[i+1],r=Math.min(maxRadius,a.distanceTo(b)/2,b.distanceTo(c)/2);
  if(r<.004){path.add(new THREE.LineCurve3(from,b));from=b;continue;}
  const p1=b.clone().addScaledVector(a.clone().sub(b).normalize(),r),p2=b.clone().addScaledVector(c.clone().sub(b).normalize(),r);
  if(from.distanceTo(p1)>1e-4)path.add(new THREE.LineCurve3(from,p1));
  path.add(new THREE.QuadraticBezierCurve3(p1,b.clone(),p2));from=p2;
 }
 path.add(new THREE.LineCurve3(from,v.at(-1)));return path;
}
function cableMesh(points,radius,material){
 const path=filletPath(points),n=Math.max(8,Math.ceil(path.getLength()*24));
 return new THREE.Mesh(new THREE.TubeGeometry(path,n,radius,8,false),material);
}
// Point halfway along the polyline's length, with the direction of the floor run
// it lies on. If the halfway point falls on a vertical riser, the middle of the
// longest floor run is used instead.
function midpoint(points){
 const total=len(points);let left=total/2;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  if(left<=d){const t=d?left/d:0,flat=Math.hypot(b[0]-a[0],b[1]-a[1]);if(flat>d*.9)return {point:a.map((v,k)=>v+(b[k]-v)*t),dir:[(b[0]-a[0])/flat,(b[1]-a[1])/flat]};break;}left-=d;}
 let best=null;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],flat=Math.hypot(b[0]-a[0],b[1]-a[1]);if(Math.abs(b[2]-a[2])<.01&&(!best||flat>best.flat))best={flat,point:a.map((v,k)=>(v+b[k])/2),dir:[(b[0]-a[0])/(flat||1),(b[1]-a[1])/(flat||1)]};}
 return best||{point:points.at(-1),dir:[1,0]};
}
// Small text with no box, laid flat (on the floor along a cable, or on a desk top)
// with a dark outline for legibility. It is turned to read from the audience side
// (behind the audience, looking towards the image): the text's top always points
// away from that viewer (along READ_FROM), so it is never upside down from there.
// READ_FROM is the audience's viewing direction turned 26.8° clockwise, so labels
// running straight towards the image still pick a consistent side.
// `beside`: shift it off the anchor by half its height (cable labels sit next to
// the line). Size is in metres at LABEL_REF metres from the camera; see
// updateLabelScale for how it follows the camera.
let READ_FROM=[.89,-.45];const CABLE_TEXT=.5; // cable labels: 0.8 × the earlier 0.62
const SKEW=-26.8*Math.PI/180;
// `looking`: unit vector the audience looks along (towards the image).
export function setLabelReadDirection([x,y]){READ_FROM=[x*Math.cos(SKEW)-y*Math.sin(SKEW),x*Math.sin(SKEW)+y*Math.cos(SKEW)];}
function readAngle(dir){let a=Math.atan2(dir[1],dir[0]);if(-Math.sin(a)*READ_FROM[0]+Math.cos(a)*READ_FROM[1]<0)a+=Math.PI;return a;}
function flatText(text,color,{point,dir},{size=.62,beside=true,lift=.012}={}){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),font='700 34px "Apple SD Gothic Neo","Noto Sans KR",sans-serif';
 ctx.font=font;const w=Math.ceil(ctx.measureText(text).width)+24,h=52;canvas.width=w;canvas.height=h;
 ctx.font=font;ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=7;ctx.strokeStyle='rgba(10,14,18,.85)';ctx.strokeText(text,12,h/2);ctx.fillStyle=color;ctx.fillText(text,12,h/2);
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
 const width=size*w/512,height=size*h/512,mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
 const angle=readAngle(dir);
 mesh.rotation.z=angle;mesh.renderOrder=61;mesh.raycast=()=>{};
 mesh.userData.flatLabel={anchor:[point[0],point[1],point[2]+lift],up:[-Math.sin(angle),Math.cos(angle)],width,height,beside,text};placeLabel(mesh,1);
 return mesh;
}
function placeLabel(mesh,k){
 const {anchor,up,height,beside}=mesh.userData.flatLabel,off=beside?height*k/2+.02:0;
 mesh.scale.set(k,k,1);mesh.position.set(anchor[0]+up[0]*off,anchor[1]+up[1]*off,anchor[2]);
}
// Labels keep a near-constant, slightly growing size on screen: their world size
// grows with camera distance to the power LABEL_DAMP (screen size ∝ d^(LABEL_DAMP-1)),
// so they stay small but legible from afar and only grow a little when zooming in.
const LABEL_REF=3,LABEL_DAMP=.78;
const _p=new THREE.Vector3();
// Cable labels are laid out again whenever their size step, or the visible lines,
// change, so that none of them overlap at that zoom. `site`: {gear:[[x,y,r]], inside}.
const STEP=1.12,MIN=.4;
let laidOut='';
export function resetLabelLayout(){laidOut='';}
export function updateLabelScale(groups,camera,site={}){
 const labels=[],cables=[];
 const visit=o=>{if(!o.visible)return;if(o.userData.flatLabel)labels.push(o);if(o.userData.cable)cables.push(...o.userData.cable);for(const c of o.children)visit(c);};
 for(const g of groups)if(g)visit(g);
 const ks=labels.map(o=>{const a=o.userData.flatLabel.home??o.userData.flatLabel.anchor;
  const d=camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom*.55:camera.position.distanceTo(_p.set(a[0],a[1],a[2]));
  return Math.min(4,Math.max(.6,STEP**Math.round(Math.log(Math.max(.01,(d/LABEL_REF)**LABEL_DAMP))/Math.log(STEP))));});
 const key=labels.map((o,i)=>o.uuid+ks[i].toFixed(3)).join();
 if(key===laidOut)return;laidOut=key;
 const runs=[],fixed=[];
 labels.forEach((o,i)=>{const f=o.userData.flatLabel;if(f.segments?.length){runs.push([o,f,ks[i]]);return;}
  placeLabel(o,ks[i]);const w=f.width*ks[i]/2,h=f.height*ks[i]/2,c=Math.abs(f.up[1]),n=Math.abs(f.up[0]);fixed.push([o.position.x-w*c-h*n,o.position.y-w*n-h*c,o.position.x+w*c+h*n,o.position.y+w*n+h*c]);});
 const up=axis=>{const a=readAngle(axis===0?[1,0]:[0,1]);return [-Math.sin(a),Math.cos(a)];},readable=axis=>{const u=up(axis);return u[0]*READ_FROM[0]+u[1]*READ_FROM[1]>.7;};
 let result=null,shrink=1;
 for(shrink of [1,.85,.72,.6]){
  result=placeLabels(runs.map(([o,f,k])=>{const q=Math.max(MIN,k*shrink);return {id:o.uuid,width:f.width*q,height:f.height*q,segments:f.segments,up,readable,current:f.spot};}),{cables:cables.map(c=>({...c})),fixed,gear:site.gear,inside:site.inside});
  if(!result.overlaps)break;
 }
 for(const [o,f,k] of runs){const spot=result.spots.get(o.uuid),q=Math.max(MIN,k*shrink);if(!spot)continue;
  o.scale.set(q,q,1);o.rotation.z=readAngle(spot.axis===0?[1,0]:[0,1]);o.position.set(spot.x,spot.y,f.anchor[2]);f.spot=[spot.x,spot.y];f.home??=f.anchor;}
}
// Ties a label to its cable: where it may sit, and what other labels must avoid.
function label(mesh,points){const segments=floorSegments(points);mesh.userData.flatLabel.segments=segments;mesh.userData.cable=segments.map(s=>({...s,id:mesh.uuid}));return mesh;}
export function buildSignals(routes){
 const g=new THREE.Group();g.name='signal-lines';const audio=new THREE.Group(),video=new THREE.Group();audio.name='audio-lines';video.name='video-lines';g.add(audio,video);
 for(const r of routes){
  const target=AUDIO_KINDS.has(r.kind)?audio:video,add=o=>{o.userData.viewerOnly=true;o.raycast=()=>{};target.add(o);return o;};
  const color=SIGNAL_COLORS[r.kind]||SIGNAL_COLORS.XLR,cable=new THREE.MeshBasicMaterial({color,toneMapped:false});
  add(cableMesh(r.points,.007,cable));
  for(const end of [r.points[0],r.points.at(-1)])add(new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.05,12),cable)).position.set(...end);
  label(add(flatText(`${r.kind} · ${english(r.from.title)} → ${english(r.to.title)}`,color,midpoint(r.points),{size:CABLE_TEXT})),r.points);
 }
 return g;
}
const CABLE=0xff8a1f;
export function buildPower(routes,outlets){
 const g=new THREE.Group();g.name='power-lines';
 // Space Him renders at a very low exposure for its rail-light simulation, so
 // these markers skip tone mapping to stay legible in every lighting state.
 const cable=new THREE.MeshBasicMaterial({color:CABLE,toneMapped:false}),used=new Set(routes.map(r=>r.outlet.id));
 const add=o=>{o.userData.viewerOnly=true;o.raycast=()=>{};g.add(o);return o;};
 for(const r of routes){
  add(cableMesh(r.points,.009,cable));
  label(add(flatText(`Outlet ${r.outlet.id} → ${english(r.consumer.title)}`,'#ff9a3d',midpoint(r.points),{size:CABLE_TEXT})),r.points);
  const strip=add(new THREE.Mesh(new THREE.BoxGeometry(.36,.07,.04),new THREE.MeshBasicMaterial({color:0x2a2a2a,toneMapped:false})));strip.position.set(r.strip[0],r.strip[1],STRIP_Z);strip.rotation.z=r.consumer.rotation*Math.PI/180;
  for(let i=0;i<r.consumer.sockets;i++){const s=add(new THREE.Mesh(new THREE.BoxGeometry(.045,.04,.006),cable));s.position.set(-.12+i*.08,0,.022);strip.add(s);}
  // The desk's name, lying on its top along the long side, on the free strip at
  // the far edge from the user (outlet and cable length live in the inspector).
  if(r.consumer.tag){const c=r.consumer,rot=c.rotation*Math.PI/180,edge=c.depth/2-.07;
   add(flatText(r.consumer.tag,'#f4f1ea',{point:[c.x-Math.sin(rot)*edge,c.y+Math.cos(rot)*edge,.742],dir:[Math.cos(rot),Math.sin(rot)]},{size:.55,beside:false,lift:.015}));}
 }
 for(const o of outlets){
  const on=used.has(o.id),mark=add(new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.12),new THREE.MeshBasicMaterial({color:on?CABLE:0x9aa4a8,transparent:true,opacity:on?.95:.6,toneMapped:false})));
  mark.position.set(o.point[0]+o.normal[0]*.04,o.point[1]+o.normal[1]*.04,o.point[2]);
 }
 return g;
}
export function disposePower(g){g?.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});g?.parent?.remove(g);}
