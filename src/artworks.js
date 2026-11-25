import * as THREE from 'three';

// Wall-hung flat artworks (WESS+). An artwork is a set of paper panels stacked
// vertically on one wall point. Local frame of the built group: origin on the wall
// surface at floor level, +Y = out of the wall towards the viewer, +Z = up, +X =
// the viewer's right. `rotation` (deg) is the world angle of the wall normal.
export const ARRANGE={both:'상단 + 하단',top:'상단만',bottom:'하단만'};
export const WALL_OFFSET=.004; // paper sits ~4 mm proud of the wall (pins / tape)

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const textures=new Map(),shadows=new Map();

function texture(src){
 if(textures.has(src))return textures.get(src);
 const t=new THREE.TextureLoader().load(src);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;textures.set(src,t);return t;
}
// A soft, darkened copy of the cut-out outline: the paper's contact shadow on the wall.
// The canvas gets its final size up front (from the panel's physical aspect) so the
// GPU texture is never re-allocated when the image arrives.
const SHADOW_W=512,SHADOW_PAD=24;
function shadowTexture(src,aspect){
 if(shadows.has(src))return shadows.get(src);
 const canvas=document.createElement('canvas'),w=SHADOW_W,h=Math.max(8,Math.round(SHADOW_W/aspect));canvas.width=w+SHADOW_PAD*2;canvas.height=h+SHADOW_PAD*2;
 const t=new THREE.CanvasTexture(canvas);t.userData.pad=SHADOW_PAD/w;
 const img=new Image();img.onload=()=>{const c=canvas.getContext('2d');c.filter='blur(7px)';c.drawImage(img,SHADOW_PAD,SHADOW_PAD,w,h);c.filter='none';c.globalCompositeOperation='source-in';c.fillStyle='#1d2420';c.fillRect(0,0,canvas.width,canvas.height);t.needsUpdate=true;};img.src=src;
 shadows.set(src,t);return t;
}

export function partsOf(def,art){return def.parts.filter(p=>art.arrange==='both'||p.id===art.arrange);}
// Total composition height, and each panel's centre (local z above the floor).
export function artworkLayout(def,art){
 const parts=partsOf(def,art),gap=parts.length>1?art.gap:0;
 const total=parts.reduce((s,p)=>s+p.height_m,0)+gap*(parts.length-1),width=Math.max(...parts.map(p=>p.width_m));
 let top=art.center+total/2;
 const panels=parts.map(p=>{const z=top-p.height_m/2;top-=p.height_m+gap;return {...p,z};});
 return {panels,total,width,bottom:art.center-total/2,top:art.center+total/2};
}

export function buildArtwork(def,art){
 const root=new THREE.Group(),{panels}=artworkLayout(def,art);
 for(const p of panels){
  // PlaneGeometry faces +Z: stand it up (X 90°) and turn it to face +Y (Z 180°) so the
  // image is upright and its right edge is on the viewer's right (local -X).
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(p.width_m,p.height_m).rotateX(Math.PI/2).rotateZ(Math.PI),new THREE.MeshStandardMaterial({map:texture(p.image),alphaTest:.5,roughness:.93,metalness:0,side:THREE.FrontSide}));
  paper.position.set(0,WALL_OFFSET,p.z);paper.castShadow=true;paper.receiveShadow=true;paper.name=`${def.id}_${p.id}`;paper.userData.artPanel=p.id;
  const shade=shadowTexture(p.image,p.width_m/p.height_m),pad=shade.userData.pad;
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(p.width_m*(1+pad*2),p.height_m+p.width_m*pad*2).rotateX(Math.PI/2).rotateZ(Math.PI),new THREE.MeshBasicMaterial({map:shade,transparent:true,opacity:.34,depthWrite:false}));
  contact.position.set(0,.0012,p.z-.008);contact.renderOrder=1;contact.raycast=()=>{};contact.userData.viewerOnly=true;
  root.add(contact,paper);
 }
 // Plan-view marker: a strip on the floor in front of the wall (the panels are only
 // millimetres deep seen from above). Shown and pickable only in plan view.
 const width=Math.max(...panels.map(p=>p.width_m)),marker=new THREE.Mesh(new THREE.PlaneGeometry(width,.12),new THREE.MeshBasicMaterial({color:0xa45b37,transparent:true,opacity:.85,depthWrite:false}));
 marker.position.set(0,.07,.02);marker.renderOrder=3;marker.visible=false;marker.userData.planMarker=true;marker.userData.viewerOnly=true;
 marker.raycast=function(r,i){if(this.visible)THREE.Mesh.prototype.raycast.call(this,r,i);};root.add(marker);
 return root;
}

// Wall picking. `walls` are the visible wall/column meshes; returns the hit point
// and the horizontal wall normal facing the ray origin, or null.
const ray=new THREE.Raycaster(),normal=new THREE.Vector3(),matrix=new THREE.Matrix3();
function wallNormal(hit,dir){
 if(!hit.face)return null;normal.copy(hit.face.normal).applyMatrix3(matrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
 if(Math.abs(normal.z)>.3)return null;if(normal.dot(dir)>0)normal.negate();normal.z=0;normal.normalize();return normal.clone();
}
export function wallFromRay(walls,origin,dir,far=Infinity){
 ray.set(origin,dir);ray.far=far;
 for(const hit of ray.intersectObjects(walls,false)){
  // The first surface decides: a wall top or a non-wall part means no hanging spot.
  if(/glass|window|frame|leaf|pull|rail/i.test(hit.object.name))return null;
  const n=wallNormal(hit,dir);return n?{point:hit.point.clone(),normal:n,object:hit.object}:null;
 }
 return null;
}
// Nearest wall around a point at a fixed height (used in plan view).
export function nearestWall(walls,x,y,z,reach=1.6){
 let best=null;const origin=new THREE.Vector3(x,y,z),dir=new THREE.Vector3();
 for(let i=0;i<32;i++){const a=i/32*Math.PI*2;dir.set(Math.cos(a),Math.sin(a),0);const hit=wallFromRay(walls,origin,dir,reach);if(hit&&(!best||hit.point.distanceTo(origin)<best.point.distanceTo(origin)))best=hit;}
 return best;
}
// Every panel edge must land on flat wall (no corner overhang, no window/door).
export function wallFit(walls,def,art,floorZ){
 const {panels}=artworkLayout(def,art),a=art.rotation*Math.PI/180,n=new THREE.Vector3(Math.cos(a),Math.sin(a),0),t=new THREE.Vector3(Math.sin(a),-Math.cos(a),0),origin=new THREE.Vector3(),back=n.clone().negate();
 for(const p of panels)for(const u of [-.5,-.25,0,.25,.5])for(const v of [-.45,0,.45]){
  origin.set(art.x,art.y,floorZ+p.z+v*p.height_m).addScaledVector(t,u*p.width_m*.98).addScaledVector(n,.06);
  const hit=wallFromRay(walls,origin,back,.12);if(!hit||Math.abs(hit.point.distanceTo(origin)-.06)>.03)return false;
 }
 return true;
}
export function clampCenter(def,art,ceiling){
 const parts=partsOf(def,art),total=parts.reduce((s,p)=>s+p.height_m,0)+(parts.length>1?art.gap:0)*(parts.length-1);
 return clamp(art.center,total/2+.05,Math.max(total/2+.05,ceiling-total/2-.05));
}
