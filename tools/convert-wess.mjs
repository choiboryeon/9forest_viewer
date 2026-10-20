import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

// Source OBJ is the architectural-only export, in metres with Z up. No GLB
// axis conversion, rescaling, origin shift or installed artwork is introduced.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'data/wess-source');
const objText=fs.readFileSync(path.join(source,'WESS_Plus_Space.obj'),'utf8');
const mtlText=fs.readFileSync(path.join(source,'WESS_Plus_Space.mtl'),'utf8');
const parameters=JSON.parse(fs.readFileSync(path.join(source,'model_parameters.json'),'utf8'));
const H=parameters.wall_height_m,DH=parameters.door_height_m,WH=parameters.glazing_height_m;
const materials=new Map(); let material;
for(const line of mtlText.split(/\r?\n/)){
  const [key,...values]=line.trim().split(/\s+/);
  if(key==='newmtl'){material={color:'#cccccc',opacity:1};materials.set(values.join(' '),material);}
  if(key==='Kd')material.color='#'+values.map(v=>Math.round(Number(v)*255).toString(16).padStart(2,'0')).join('');
  if(key==='d')material.opacity=Number(values[0]);
}
const positions=[],objects=[]; let object;
for(const line of objText.split(/\r?\n/)){
  const [key,...values]=line.trim().split(/\s+/);
  if(key==='o'){object={name:values.join(' '),triangles:[]};objects.push(object);}
  else if(key==='v')positions.push(values.map(Number));
  else if(key==='g')object.sourceGroup=values.join(' ');
  else if(key==='usemtl')object.material=values.join(' ');
  else if(key==='f'){
    const ids=values.map(value=>{const id=Number(value.split('/')[0]);return id<0?positions.length+id:id-1;});
    for(let i=1;i<ids.length-1;i++)object.triangles.push([ids[0],ids[i],ids[i+1]]);
  }
}
const boundsOf=ids=>{
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const id of ids)for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],positions[id][axis]);max[axis]=Math.max(max[axis],positions[id][axis]);}
  return {min,max};
};
const rectangles=parameters.wall_rectangles.filter(r=>r.bounds[2]-r.bounds[0]>1e-7&&r.bounds[3]-r.bounds[1]>1e-7);
const round=v=>Math.round(v*1e8)/1e8;
const inside=(bounds,x,y,epsilon=0)=>x>=bounds[0]-epsilon&&x<=bounds[2]+epsilon&&y>=bounds[1]-epsilon&&y<=bounds[3]+epsilon;
const exteriorById=new Map([
  ...[0,1,2,3,4,5].map(id=>[id,'A']),
  ...[9,20,39,41].map(id=>[id,'B']),
  ...[24,29,30,31,40].map(id=>[id,'C']),
  ...[6,12,15,16,33,36,38].map(id=>[id,'D']),
]);
const heads=[
  [.314325,3.274483,.714375,4.084117,DH,'D'],
  [7.919508,.2794,8.218958,1.0795,DH,null],
  [10.234083,1.369483,11.034183,1.669992,DH+.03,null],
  [12.034308,4.564592,12.733867,4.964642,DH,'A'],
  [11.3792,.569383,11.678708,1.369483,DH,'B'],
  [8.218958,-.605367,9.769475,-.504825,DH,'C'],
  [.569383,-.40005,4.344458,0,WH,'C'],
  [-.40005,.229658,0,2.614083,WH,'D'],
];
function wallForTriangle(ids){
  const [x,y,z]=[0,1,2].map(axis=>ids.reduce((sum,id)=>sum+positions[id][axis],0)/3);
  const match=rectangles.find(r=>r.id!==17&&r.id!==42&&inside(r.bounds,x,y,.00003));
  if(match)return exteriorById.get(match.id)||'internal';
  const head=heads.find(r=>z>=r[4]-.00003&&inside(r,x,y,.00003));
  return head?.[5]||'internal';
}
function exteriorForObject(object,bounds){
  if(object.name.startsWith('D01'))return 'D';
  if(object.name.startsWith('D04'))return 'A';
  if(object.name.startsWith('D05'))return 'C';
  if(object.name.startsWith('D06'))return 'B';
  if(object.sourceGroup==='04_Glazing'){
    if(bounds.max[0]<.2)return 'D';
    return 'C';
  }
  return null;
}
const meshes=[];
function meshFrom(object,triangles,category){
  const vertices=[],faces=[],mapping=new Map();
  for(const ids of triangles)for(const id of ids){
    if(!mapping.has(id)){mapping.set(id,vertices.length/3);vertices.push(...positions[id]);}
    faces.push(mapping.get(id));
  }
  const bounds=boundsOf(mapping.keys());
  const wall=category||exteriorForObject(object,bounds);
  const group=object.name.startsWith('Floor_')?'floor':object.name.startsWith('Column_')?'structure':object.name.startsWith('Stair_')?'structure':object.name.startsWith('Partition_')||object.name.startsWith('Walls_')?'wall':'opening';
  const m={name:object.name+(category?'__'+category:''),group,sourceObject:object.name,vertices,faces,...materials.get(object.material),bounds};
  if(wall&&wall!=='internal')m.wall=wall;
  else if(group==='wall'||group==='opening')m.internalWall=true;
  if(object.material==='Frame_Aluminum'){m.metalness=.55;m.roughness=.35;}
  if(object.material==='Glass_Clear'){m.glass=true;m.roughness=.1;}
  meshes.push(m);
}
for(const object of objects){
  if(object.name==='Walls_PDF_Outline_With_Assumed_Heads'){
    const chunks=new Map();
    for(const ids of object.triangles){const key=wallForTriangle(ids);if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(ids);}
    for(const [key,triangles] of chunks)meshFrom(object,triangles,key);
  }else meshFrom(object,object.triangles);
}

// Exact regions from build_wess_model.py. These are slab footprints, including
// the portions under walls; obstacles below provide the usable interior.
const slabRegions=[
  [-.40005,-.40005,8.218958,3.230033],
  [.314325,3.230033,14.658975,4.964642],
  [8.218958,1.369483,14.658975,3.230033],
  [8.218958,-.105833,11.678708,1.369483],
  [7.818967,-1.605492,10.019242,-.105833],
  [11.028892,-1.605492,11.3294,-.405342],
  [11.028892,-.405342,13.179425,-.105833],
];
const raisedRegions=[
  [8.244417,1.669992,11.808892,4.479925],
  [7.919508,2.339975,8.244417,4.039658],
  [10.234083,1.369483,11.034183,1.669992],
];
const floorRegions=[...slabRegions.map((bounds,i)=>({id:'slab-'+i,bounds,z:0})),...raisedRegions.map((bounds,i)=>({id:'raised-'+i,bounds,z:parameters.central_floor_offset_m}))];
const obstacles=rectangles.map(r=>({id:'footprint-'+r.id,kind:r.id===42?'column':r.id===17?'partition':'wall',bounds:r.bounds.map(round),minZ:r.id===17?.03:0,maxZ:H}));
heads.forEach((r,i)=>obstacles.push({id:'head-'+i,kind:'head',bounds:r.slice(0,4),minZ:r[4],maxZ:H}));
for(const object of objects){
  if(!/Leaf_Open90|Window_Mullion_|Window_Glass_/.test(object.name))continue;
  const {min,max}=boundsOf(object.triangles.flat());
  obstacles.push({id:object.name,kind:object.name.includes('Leaf')?'door':'window',bounds:[min[0],min[1],max[0],max[1]],minZ:min[2],maxZ:max[2]});
}
const doorFrames=[
  ['D01',.564092,3.274483,.664633,4.084117,'Y',0],
  ['D02',8.119483,.2794,8.218958,1.0795,'Y',0],
  ['D03',10.234083,1.369483,11.034183,1.470025,'X',.03],
  ['D04',12.034308,4.614333,12.733867,4.714875,'X',0],
  ['D05',8.749183,-.605367,9.769475,-.504825,'X',0],
  ['D06',11.3792,.569383,11.478683,1.369483,'Y',0],
];
for(const [id,x0,y0,x1,y1,axis,z] of doorFrames){
  const jambs=axis==='X'?[[x0,y0,x0+.035,y1],[x1-.035,y0,x1,y1]]:[[x0,y0,x1,y0+.035],[x0,y1-.035,x1,y1]];
  jambs.forEach((bounds,i)=>obstacles.push({id:id+'-jamb-'+i,kind:'frame',bounds:bounds.map(round),minZ:z,maxZ:z+DH}));
  obstacles.push({id:id+'-lintel',kind:'head',bounds:[x0,y0,x1,y1],minZ:z+DH-.035,maxZ:z+DH});
}

// Ceiling was not specified vertically in the floor plan. The optional roof
// consists of the existing slab footprint at the documented assumed 2.7 m.
function roofMesh(bounds,index){
  const [x0,y0,x1,y1]=bounds,z0=H,z1=H+.06;
  return {name:'Ceiling_Assumed_'+index,group:'roof',assumed:true,color:'#e7e6df',opacity:1,
    vertices:[x0,y0,z0,x1,y0,z0,x1,y1,z0,x0,y1,z0,x0,y0,z1,x1,y0,z1,x1,y1,z1,x0,y1,z1],
    faces:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]};
}
meshes.push(...slabRegions.map(roofMesh));
function unionArea(regions,subtract=[]){
  const all=[...regions,...subtract],xs=[...new Set(all.flatMap(r=>[r[0],r[2]]))].sort((a,b)=>a-b),ys=[...new Set(all.flatMap(r=>[r[1],r[3]]))].sort((a,b)=>a-b);
  let area=0;
  for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++){
    const mx=(xs[x]+xs[x+1])/2,my=(ys[y]+ys[y+1])/2;
    if(regions.some(r=>inside(r,mx,my))&&!subtract.some(r=>inside(r,mx,my)))area+=(xs[x+1]-xs[x])*(ys[y+1]-ys[y]);
  }
  return round(area);
}
const nativeBounds=boundsOf(positions.keys());
const floorBounds={min:[Math.min(...slabRegions.map(r=>r[0])),Math.min(...slabRegions.map(r=>r[1]))],max:[Math.max(...slabRegions.map(r=>r[2])),Math.max(...slabRegions.map(r=>r[3]))]};
const room={
  metadata:{id:'wess',title:'WESS+ · 도면 기반 공간',unit:'m',up_axis:'Z',
    width_m:round(floorBounds.max[0]-floorBounds.min[0]),depth_m:round(floorBounds.max[1]-floorBounds.min[1]),
    bounds:floorBounds,model_bounds:nativeBounds,height_m:H,ridge_m:H,eave_m:H,ridge_y_m:2.5,ceiling_m:H,roof_type:'flat',
    area_m2:unionArea(slabRegions,rectangles.map(r=>r.bounds)),gross_area_m2:unionArea(slabRegions),area_basis:'도면 슬래브 합집합에서 벽·기둥·파티션 바닥 면적을 공제; 계단 제외',
    floorRegions,obstacles,entrance:[9.15,.2],door:{wall:'C',x_m:8.749183,width_m:1.020292,height_m:DH},
    source_file:parameters.source_file,source_sha256:parameters.source_sha256,
    assumptions:['평면 치수는 원본 PDF 벡터 도면과 미터 단위 OBJ를 유지합니다.','벽·천장 높이 2.70 m, 문 높이 2.10 m, 창 높이 2.40 m는 기존 모델의 가정입니다.','중앙 바닥은 +30 mm, 계단은 도면에 표시된 일부이며 단높이 175 mm를 가정합니다.','선택 표시하는 평천장은 바닥 윤곽과 가정 높이로 추가했습니다.'],
  },
  cameras:{
    '3d':{position:[18,-13,12],target:[7.1,1.75,.9]},
    A:{position:[5.5,.65,1.65],target:[5.5,4.56,1.55]},
    B:{position:[.8,2.05,1.65],target:[11.9,2.05,1.55]},
    C:{position:[5.4,3.9,1.65],target:[5.4,0,1.55]},
    D:{position:[7.2,1.8,1.65],target:[0,1.8,1.55]},
  },
  viewLabels:{A:'A면 · 도면 상단',B:'B면 · 도면 우측',C:'C면 · 창문/입구',D:'D면 · 서측 창문'},
  meshes,
};

const sourceTriangleCount=objects.reduce((sum,o)=>sum+o.triangles.length,0);
const architecturalMeshes=meshes.filter(m=>!m.assumed);
assert.equal(architecturalMeshes.reduce((sum,m)=>sum+m.faces.length/3,0),sourceTriangleCount,'Source triangles must be conserved');
assert.equal(objects.length,54,'Unexpected source architectural object count');
assert(!objects.some(o=>/Install_|Artwork|NineForest/.test(o.name)),'Installed objects must not enter the room model');
let degenerate=0;
for(const mesh of meshes){
  assert(mesh.vertices.every(Number.isFinite));
  assert(mesh.faces.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.vertices.length/3));
  for(let i=0;i<mesh.faces.length;i+=3){
    const [a,b,c]=mesh.faces.slice(i,i+3).map(j=>mesh.vertices.slice(j*3,j*3+3));
    const u=b.map((v,j)=>v-a[j]),v=c.map((n,j)=>n-a[j]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(Math.hypot(...cross)<1e-12)degenerate++;
  }
}
assert.equal(degenerate,0,'No degenerate output triangles');
const triangleSignature=points=>points.map(p=>p.join(',')).join(';');
const sourceTriangles=objects.flatMap(o=>o.triangles.map(t=>triangleSignature(t.map(id=>positions[id])))).sort();
const exportedTriangles=architecturalMeshes.flatMap(m=>{
  const list=[];
  for(let i=0;i<m.faces.length;i+=3)list.push(triangleSignature(m.faces.slice(i,i+3).map(id=>m.vertices.slice(id*3,id*3+3))));
  return list;
}).sort();
assert.deepEqual(exportedTriangles,sourceTriangles,'Coordinates and winding of every source triangle must survive conversion exactly');
const [ex,ey]=room.metadata.entrance;
assert(floorRegions.some(r=>inside(r.bounds,ex,ey)));
assert(!obstacles.some(o=>o.minZ<1.9&&o.maxZ>0&&inside(o.bounds,ex,ey,.24)),'Entrance must fit a pedestrian');
const audit={source_obj_sha256:crypto.createHash('sha256').update(objText).digest('hex'),source_objects:objects.length,
  source_vertices:positions.length,source_triangles:sourceTriangleCount,exported_architectural_triangles:architecturalMeshes.reduce((s,m)=>s+m.faces.length/3,0),
  architecture_meshes:architecturalMeshes.length,assumed_ceiling_meshes:slabRegions.length,degenerate_triangles:degenerate,native_bounds_m:nativeBounds,
  transform:'identity; metres, Z up; all original vertex values retained',exact_triangle_coordinate_and_winding_match:true,floor_area_m2:room.metadata.area_m2,gross_slab_area_m2:room.metadata.gross_area_m2,
  floor_regions:floorRegions.length,collision_obstacles:obstacles.length,entrance_clearance_m:.24,
  dimensions_m:{main_south_width:7.919508333333334,main_depth:4.564591666666665,column_width:.3503083333333335,column_depth:.5503333333333331},
};
fs.writeFileSync(path.join(root,'data/wess-room.json'),JSON.stringify(room));
fs.writeFileSync(path.join(root,'data/wess-geometry-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit,null,2));
