import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

// Sunken is the nineforests v5 hall (Blender world metres, Z up). The source JSON
// is written by tools/blender/export_sunken.py; this step only regroups it.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourcePath=path.join(root,'data/sunken-source/sunken_v5_export.json');
const sourceText=fs.readFileSync(sourcePath,'utf8');
const source=JSON.parse(sourceText);
const X0=-4,X1=12,Y0=-9,Y1=4;
const boundsOf=vertices=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<vertices.length;i+=3)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],vertices[i+j]);hi[j]=Math.max(hi[j],vertices[i+j]);}return {min:lo,max:hi};};

// Wall-mounted parts are split per triangle so each side can be cut away on its own.
// A=north (catwalk), B=east (crane end), C=south (sliding door), D=west (gable window).
const WALL_PARTS=/^(v4_brick_shell|v4_steel_windows|v4_window_glazing|v4_concrete_pilasters|v5_downpipes|v5_conduit|v5_switchboard|v5_extinguishers|v5_exit_sign|v5_detail_black)/;
const ROOF=/^(v4_roof_deck|v4_ridge_skylight_glass|v4_skylight_frame)/;
const HIGH_STRUCTURE=/^(v4_steel_trusses|v4_crane_runway|v4_gantry_crane)/;
const RIGGING=/^(v4_rigging_|v4_profile_spot|v4_highbay_|v5_stage_light_bar|v5_stage_profile)/;
const FLOOR={v4_factory_floor_slab:0,room_floor:.001,v5_floor_joints:.0015,v4_floor_tape_grid:.002};
const GLOW=/lens_glow|pendant_glow|exit_sign|laptop_screen|pad_leds|desk_lamp_led/;
const COLORS={v4_seongsu_red_brick:'#93533d',v4_factory_glass:'#cfe0e6',v4_worn_factory_concrete:'#7b7b78',v4_sealed_work_zone_concrete:'#5d5e5c',v4_roof_deck_board:'#b9b6ae'};
function wallOf(cx,cy){
 const d={D:Math.abs(cx-X0),B:Math.abs(cx-X1),C:Math.abs(cy-Y0),A:Math.abs(cy-Y1)};
 const [side,distance]=Object.entries(d).sort((a,b)=>a[1]-b[1])[0];
 return distance<=.95?side:null;
}
function split(mesh){
 const buckets=new Map();
 for(let f=0;f<mesh.faces.length;f+=3){
  const ids=mesh.faces.slice(f,f+3),c=[0,1].map(axis=>ids.reduce((s,i)=>s+mesh.vertices[i*3+axis],0)/3);
  const side=wallOf(...c)||'interior';
  if(!buckets.has(side))buckets.set(side,{map:new Map(),vertices:[],faces:[]});
  const b=buckets.get(side);
  for(const i of ids){if(!b.map.has(i)){b.map.set(i,b.vertices.length/3);b.vertices.push(...mesh.vertices.slice(i*3,i*3+3));}b.faces.push(b.map.get(i));}
 }
 return [...buckets].map(([side,b])=>({...mesh,name:`${mesh.name}__${side}`,vertices:b.vertices,faces:b.faces,side}));
}
function describe(m){
 const name=m.name,base={name,vertices:m.vertices,faces:m.faces,color:COLORS[m.material]||m.color,opacity:m.opacity};
 if(/^v4_brick_shell_painted/.test(name))base.color='#e4e0d6';
 if(GLOW.test(m.material||''))base.emissive=m.color;
 if(name in FLOOR){const lift=FLOOR[name];for(let i=2;i<base.vertices.length;i+=3)if(base.vertices[i]>-.01)base.vertices[i]=Math.round((base.vertices[i]+lift)*10000)/10000;return {...base,group:'floor'};}
 if(m.side){
  const detail=/^v5_/.test(name);
  if(m.side==='interior')return {...base,group:detail?'equipment':'structure'};
  return {...base,group:detail?'equipment':/glazing/.test(name)?'opening':'wall',wall:m.side};
 }
 if(ROOF.test(name))return {...base,group:'roof',ceilingElement:true};
 if(HIGH_STRUCTURE.test(name))return {...base,group:'structure',topHidden:true};
 if(RIGGING.test(name))return {...base,group:'equipment',topHidden:true};
 if(/^v4_north_catwalk|^v4_catwalk_grating/.test(name))return {...base,group:'structure',internalWall:false};
 return {...base,group:'equipment'};
}
const prepared=source.meshes.flatMap(m=>WALL_PARTS.test(m.name)?split(m):[m]);
const meshes=prepared.map(describe).filter(m=>m.faces.length).map(m=>({...m,bounds:boundsOf(m.vertices)}));

// Placement obstacles: connected parts that stand on the floor or hang low enough
// to meet an object. Touching parts are merged so drag fitting stays fast.
function components(m){
 const parent=Array.from({length:m.vertices.length/3},(_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;};
 for(let f=0;f<m.faces.length;f+=3){const a=find(m.faces[f]);for(const i of [m.faces[f+1],m.faces[f+2]])parent[find(i)]=a;}
 const boxes=new Map();
 for(let i=0;i<parent.length;i++){const r=find(i),b=boxes.get(r)||{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(let j=0;j<3;j++){b.min[j]=Math.min(b.min[j],m.vertices[i*3+j]);b.max[j]=Math.max(b.max[j],m.vertices[i*3+j]);}boxes.set(r,b);}
 return [...boxes.values()];
}
const OBSTACLE_SOURCES=/^(v4_concrete_pilasters|v4_north_catwalk|v4_catwalk_grating|v5_downpipes|v5_extinguishers|v5_switchboard|v5_stage_(alu|black|tolex|ply|cone|panel|knob))/;
let boxes=source.meshes.filter(m=>OBSTACLE_SOURCES.test(m.name)).flatMap(components)
 .filter(b=>(b.max[0]-b.min[0])*(b.max[1]-b.min[1])>.0004)
 .map(b=>({bounds:[Math.max(X0,b.min[0]),Math.max(Y0,b.min[1]),Math.min(X1,b.max[0]),Math.min(Y1,b.max[1])],minZ:Math.max(0,b.min[2]),maxZ:b.max[2]}));
// Parts starting below the catwalk brackets (Z 3.0) never merge with the raised deck.
const near=(a,b,gap)=>(a.minZ<3)===(b.minZ<3)&&a.bounds[0]<=b.bounds[2]+gap&&b.bounds[0]<=a.bounds[2]+gap&&a.bounds[1]<=b.bounds[3]+gap&&b.bounds[1]<=a.bounds[3]+gap&&a.minZ<=b.maxZ+.3&&b.minZ<=a.maxZ+.3;
for(let merged=true;merged;){
 merged=false;
 outer:for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(near(boxes[i],boxes[j],.12)){
  const a=boxes[i],b=boxes[j];a.bounds=[Math.min(a.bounds[0],b.bounds[0]),Math.min(a.bounds[1],b.bounds[1]),Math.max(a.bounds[2],b.bounds[2]),Math.max(a.bounds[3],b.bounds[3])];a.minZ=Math.min(a.minZ,b.minZ);a.maxZ=Math.max(a.maxZ,b.maxZ);boxes.splice(j,1);merged=true;break outer;
 }
}
const inside=(a,b)=>a!==b&&a.bounds[0]>=b.bounds[0]-.01&&a.bounds[1]>=b.bounds[1]-.01&&a.bounds[2]<=b.bounds[2]+.01&&a.bounds[3]<=b.bounds[3]+.01&&a.minZ>=b.minZ-.01&&a.maxZ<=b.maxZ+.01;
boxes=boxes.filter(a=>!boxes.some(b=>inside(a,b)));
const round3=v=>Math.round(v*1000)/1000;
const obstacles=boxes.filter(b=>b.bounds[2]>b.bounds[0]&&b.bounds[3]>b.bounds[1]).map((b,i)=>({id:`sunken-${i}`,kind:'fixed',bounds:b.bounds.map(round3),minZ:round3(b.minZ),maxZ:round3(b.maxZ)}));

const room={
 metadata:{id:'sunken',title:'Sunken · 고천장 공장형 전시장',unit:'m',up_axis:'Z',width_m:16,depth_m:13,
  coordinates:'Blender world X/Y/Z (m). 작품 구역 X 0–8, Y −5–0. A=북(y 4), B=동(x 12), C=남(y −9), D=서(x −4)',
  bounds:{min:[X0,Y0],max:[X1,Y1]},model_bounds:boundsOf(meshes.flatMap(m=>m.vertices)),
  height_m:10.15,ridge_m:10.15,eave_m:7.2,ridge_y_m:-2.5,ceiling_m:5.7,roof_type:'flat',
  area_m2:208,area_basis:'벽 안쪽 16 × 13 m (필라스터·캣워크 계단 포함)',
  floorRegions:[{id:'hall',bounds:[X0,Y0,X1,Y1],z:0}],obstacles,
  entrance:[2,-8.55],door:{wall:'C',x_m:.7,width_m:2.6,height_m:4.2},
  hang_basis:'행잉 상단은 리깅 파이프 그리드 Z 5.7 m 기준입니다. 트러스 하현재는 7.2 m입니다.',
  source_file:source.source_file,source_sha256:source.source_sha256,export_sha256:crypto.createHash('sha256').update(sourceText).digest('hex'),
  assumptions:['실측 건물이 아닌 콘셉트 공간(nineforests v5)이며 구조 계산을 거친 시공 설계가 아닙니다.','v2 아홉 작품, 거치대, 음향 케이블과 대기 헤이즈는 웹 뷰어에서 제외했습니다.','행잉 높이는 리깅 그리드 5.7 m 기준으로 계산합니다.']},
 cameras:{'3d':{position:[22,-24,17],target:[4,-2.5,2.4]},A:{position:[4,-6.5,1.65],target:[4,4,2.8]},B:{position:[-1,-2.5,1.65],target:[12,-2.5,2.8]},C:{position:[4,1.5,1.65],target:[4,-9,2.8]},D:{position:[9,-2.5,1.65],target:[-4,-2.5,2.8]}},
 viewLabels:{A:'A면 · 북측 캣워크',B:'B면 · 동측 크레인',C:'C면 · 남측 출입문',D:'D면 · 서측 박공창'},
 meshes,
};

const sourceTriangles=source.meshes.reduce((n,m)=>n+m.faces.length/3,0),exportedTriangles=meshes.reduce((n,m)=>n+m.faces.length/3,0);
assert.equal(exportedTriangles,sourceTriangles,'Splitting walls must keep every triangle');
assert(meshes.every(m=>m.vertices.every(Number.isFinite)&&m.faces.every(i=>i>=0&&i<m.vertices.length/3)));
assert(obstacles.length<=60,`Too many obstacles for interactive fitting: ${obstacles.length}`);
const audit={source_file:source.source_file,source_sha256:source.source_sha256,export_sha256:room.metadata.export_sha256,blender:source.blender,
 source_meshes:source.meshes.length,exported_meshes:meshes.length,source_triangles:sourceTriangles,exported_triangles:exportedTriangles,exact_triangle_count:true,
 groups:Object.fromEntries(['floor','wall','opening','roof','structure','equipment'].map(g=>[g,meshes.filter(m=>m.group===g).length])),
 walls:Object.fromEntries(['A','B','C','D'].map(w=>[w,meshes.filter(m=>m.wall===w).length])),
 obstacles:obstacles.length,hall_m:[X1-X0,Y1-Y0],hang_reference_m:room.metadata.ceiling_m,paint_line_z:source.paint_line_z,curve_resolution:source.curve_resolution};
fs.writeFileSync(path.join(root,'data/sunken-room.json'),JSON.stringify(room));
fs.writeFileSync(path.join(root,'data/sunken-geometry-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(`Sunken: ${meshes.length} meshes, ${exportedTriangles} triangles, ${obstacles.length} obstacles`);
