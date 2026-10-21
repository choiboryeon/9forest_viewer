import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'data/spacehim-source');
const obj=fs.readFileSync(path.join(source,'Space_Him_Basement.obj'),'utf8');
const mtl=fs.readFileSync(path.join(source,'Space_Him_Basement.mtl'),'utf8');
const notes=JSON.parse(fs.readFileSync(path.join(source,'model_notes.json'),'utf8'));
const materials=new Map();let current;
const linearToSRGB=c=>c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;
for(const line of mtl.split(/\r?\n/)){
 const [key,...v]=line.trim().split(/\s+/);
 if(key==='newmtl'){current={color:'#cccccc',opacity:1};materials.set(v.join(' '),current);}
 if(key==='Kd'&&current)current.color='#'+v.map(n=>Math.round(linearToSRGB(Number(n))*255).toString(16).padStart(2,'0')).join('');
 if(key==='d'&&current)current.opacity=Number(v[0]);
}
// Restore Blender's right-handed (u,-v,Z) coordinates. The OBJ exporter rotated
// both horizontal axes by 180 degrees. Flipping only X mirrors the floor plan.
const points=[],objects=[];let part;
for(const line of obj.split(/\r?\n/)){
 const [key,...v]=line.trim().split(/\s+/);
 if(key==='o'){part={name:v.join(' '),faces:[]};objects.push(part);}
 else if(key==='v')points.push([-Number(v[0]),-Number(v[1]),Number(v[2])]);
 else if(key==='usemtl'&&part)part.material=v.join(' ');
 else if(key==='f'&&part){const ids=v.map(s=>Number(s.split('/')[0])-1);for(let i=1;i<ids.length-1;i++)part.faces.push([ids[0],ids[i],ids[i+1]]);}
}
const wallNames=/^W_|^Partition_|^Plan_panel_|^Service_notch_|^Storage_.*(?:front|partition|west|north)|^Stair_(?:West|North_return|front)|^Door_/i;
const boundsOf=vertices=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<vertices.length;i+=3)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],vertices[i+j]);hi[j]=Math.max(hi[j],vertices[i+j]);}return {min:lo,max:hi};};
function category(name){
 if(/^Ceiling_/.test(name))return 'roof';
 if(/^(Foundation_|Gallery_carpet|Carpet_joint|North_carpet|Stair_lobby_floor|Storage_.*_floor)/.test(name))return 'floor';
 if(/^(Beam_|Stair_tread|Stair_nosing)/.test(name))return 'structure';
 if(/^(Lighting_|Track_|North_track|North_spot|Spot_|Pipe_|Vent_|Outlet_|Exit_)/.test(name))return 'equipment';
 return wallNames.test(name)?'wall':'opening';
}
const meshes=objects.filter(p=>p.faces.length).map(p=>{
 const vertices=[],faces=[],seen=new Map();for(const tri of p.faces)for(const id of tri){if(!seen.has(id)){seen.set(id,vertices.length/3);vertices.push(...points[id]);}faces.push(seen.get(id));}
 const group=category(p.name),bounds=boundsOf(vertices),m={name:p.name,group,vertices,faces,...materials.get(p.material),bounds};
 m.unconfirmed=/^Plan_panel_/.test(p.name);
 m.topHidden=/lintel/.test(p.name);
 m.ceilingElement=/^Ceiling_|^Beam_|^Lighting_|^Track_|^Spot_|^North_track|^North_spot|^Exposed_pipe|^Pipe_hanger/.test(p.name);
 if(group==='wall'||group==='opening'){
  if(/^W_Exterior|^W_Entry/.test(p.name)){
   const index=Number(p.name.match(/^W_Exterior_(\d+)/)?.[1])-1;
   const poly=notes.outer_inner_face_polygon_uv;
   const a=Number.isInteger(index)&&index>=0?poly[index]:[0,0],b=Number.isInteger(index)&&index>=0?poly[(index+1)%poly.length]:[0,10.75];
   const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
   m.cutaway={point:[(a[0]+b[0])/2,-(a[1]+b[1])/2],normal:[-dy/len,-dx/len]};
   m.internalWall=true;
  }else m.internalWall=true;
 }
 return m;
});
// Rectangular interior bands follow the plan's gallery polygon. The diagonal
// south-east edge is conservatively stepped so equipment cannot leave the slab.
const floorRegions=[
 {id:'north-gallery',bounds:[.18,.18,5.84,4.86],z:0},
 {id:'north-return',bounds:[5.84,.18,7.62,2.13],z:0},
 {id:'main-gallery',bounds:[.18,4.86,12.27,10.57],z:0},
 {id:'main-east',bounds:[12.27,4.86,13.77,9.01],z:0},
 {id:'entry-link',bounds:[6.05,4.69,7.81,5.18],z:0},
];
for(let i=0;i<12;i++){
 const y0=9.01+i*1.56/12,y1=9.01+(i+1)*1.56/12;
 const x1=13.77-(y1-9.01)*(1.5/1.56);
 if(x1>12.27)floorRegions.push({id:`diagonal-${i}`,bounds:[12.27,y0,x1,y1],z:0});
}
for(const region of floorRegions){const [x0,v0,x1,v1]=region.bounds;region.bounds=[x0,-v1,x1,-v0];}
const obstacleNames=/^Partition_Central|^Plan_panel_|^Stair_West|^Stair_North_return|^Service_notch_/;
const obstacles=meshes.filter(m=>obstacleNames.test(m.name)&&!m.unconfirmed).map(m=>({id:m.name,kind:'wall',bounds:[m.bounds.min[0],m.bounds.min[1],m.bounds.max[0],m.bounds.max[1]],minZ:0,maxZ:2.64}));
const room={
 metadata:{id:'spacehim',title:'공간 힘 · 지하',unit:'m',up_axis:'Z',width_m:14.46,depth_m:10.75,
  coordinate_revision:2,coordinates:'Blender X=u, Y=-v, Z=up; drawing top-left (0,0)',
  bounds:{min:[0,-10.75],max:[14.46,0]},model_bounds:boundsOf(points.flat()),height_m:2.64,ridge_m:2.64,eave_m:2.64,ridge_y_m:-5.375,ceiling_m:2.64,roof_type:'flat',
  area_m2:notes.gallery_gross_floor_m2,area_basis:'도면과 사진을 바탕으로 재구성한 갤러리 면적',floorRegions,obstacles,entrance:[7.2,-5.35],door:{wall:'C',x_m:7.05,width_m:.91,height_m:2.07},
  projectionWalls:[{id:'south',label:'도면 하단 긴 벽',a:[.2,-10.65],b:[12.28,-10.65],height:2.28},{id:'west',label:'도면 좌측 벽',a:[.2,-5.08],b:[.2,-10.65],height:2.28}],
  source_file:'Space_Him_Basement.obj',source_sha256:crypto.createHash('sha256').update(obj).digest('hex'),
  assumptions:['도면과 현장 사진에 따른 공간 재구성이며 실측 및 시공 도면이 아닙니다.','7800 표기와 그림 비례가 충돌해 중앙 가벽의 정확한 위치는 현장 확인이 필요합니다.','천고 2.64 m 및 보 하부 2.28 m는 원본 모델의 가정입니다.','투사 화면은 0.3:1 투사비와 16:9 화면을 이용한 기하학적 예측입니다. 실제 기기 렌즈 오프셋과 장애물은 현장에서 확인해야 합니다.']},
 cameras:{'3d':{position:[17,-15,13],target:[7,-5.5,1]},A:{position:[6.8,-6.2,1.65],target:[6.8,-10.65,1.4]},B:{position:[6,-7.5,1.65],target:[13.7,-7.5,1.4]},C:{position:[4,-8.7,1.65],target:[4,-.2,1.4]},D:{position:[10,-7.5,1.65],target:[.2,-7.5,1.4]}},
 viewLabels:{A:'A면 · 도면 하단',B:'B면 · 도면 우측',C:'C면 · 도면 상단',D:'D면 · 도면 좌측'},meshes,
};
assert.equal(meshes.reduce((n,m)=>n+m.faces.length/3,0),objects.reduce((n,o)=>n+o.faces.length,0));
assert(meshes.every(m=>m.vertices.every(Number.isFinite)&&m.faces.every(i=>i>=0&&i<m.vertices.length/3)));
const signature=triangle=>triangle.map(p=>p.join(',')).join(';');
const sourceTriangles=objects.flatMap(o=>o.faces.map(face=>signature(face.map(i=>points[i])))).sort();
const exportedTriangles=meshes.flatMap(m=>{const list=[];for(let i=0;i<m.faces.length;i+=3)list.push(signature(m.faces.slice(i,i+3).map(k=>m.vertices.slice(k*3,k*3+3))));return list;}).sort();
assert.deepEqual(exportedTriangles,sourceTriangles,'Every source triangle must survive the coordinate transform');
const audit={source_sha256:room.metadata.source_sha256,source_objects:objects.length,source_triangles:sourceTriangles.length,exported_meshes:meshes.length,exported_triangles:exportedTriangles.length,
 transform:'x=-OBJ.x, y=-OBJ.y, z=OBJ.z; 180-degree rotation; original winding retained; Blender coordinates restored',exact_triangle_match:true,
 material_conversion:'MTL Kd linear RGB -> sRGB hex',coordinate_revision:2,unconfirmed_panels_hidden_by_default:meshes.filter(m=>m.unconfirmed).length,
 floor_regions:floorRegions.length,obstacles:obstacles.length,ceiling_m:room.metadata.ceiling_m,beam_soffit_m:notes.inferred.beam_soffit};
fs.writeFileSync(path.join(root,'data/spacehim-room.json'),JSON.stringify(room));
fs.writeFileSync(path.join(root,'data/spacehim-geometry-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(`Space Him: ${objects.length} OBJ objects, ${meshes.length} meshes, ${room.metadata.floorRegions.length} floor regions`);
