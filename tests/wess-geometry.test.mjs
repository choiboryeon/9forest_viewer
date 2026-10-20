import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const room=JSON.parse(fs.readFileSync(new URL('../data/wess-room.json',import.meta.url)));
const audit=JSON.parse(fs.readFileSync(new URL('../data/wess-geometry-audit.json',import.meta.url)));
const {floorRegions,obstacles}=room.metadata;
const inside=(r,x,y)=>x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3];
function floor(x,y){const regions=floorRegions.filter(r=>inside(r.bounds,x,y));return regions.length?Math.max(...regions.map(r=>r.z)):null;}
function blocked(x,y,margin=.24,height=1.9){
  const z=floor(x,y);
  if(z===null)return true;
  return obstacles.some(o=>o.minZ<z+height&&o.maxZ>z+.01&&x>o.bounds[0]-margin&&x<o.bounds[2]+margin&&y>o.bounds[1]-margin&&y<o.bounds[3]+margin);
}
test('WESS architectural OBJ geometry is preserved without axis or scale changes',()=>{
  assert.equal(audit.source_objects,54);
  assert.equal(audit.source_triangles,5588);
  assert.equal(audit.exported_architectural_triangles,5588);
  assert.equal(audit.exact_triangle_coordinate_and_winding_match,true);
  assert.equal(audit.degenerate_triangles,0);
  assert.equal(room.metadata.up_axis,'Z');
  assert(room.metadata.bounds.min[1]<-1.6);
});
test('Real rooms and negative-Y lobby have usable floors; stair void does not',()=>{
  for(const point of [[3,2],[9.2,.2],[9.15,-.35],[13.2,2.25],[13.2,3.9]]){
    assert.equal(floor(...point),0,String(point));
    assert.equal(blocked(...point),false,String(point));
  }
  assert.equal(floor(9.4,3),.03);
  assert.equal(floor(10.52,1.50),.03);
  assert.equal(floor(10.5,-1),null,'The stair run is not an exhibition floor');
  assert.equal(floor(3,-1),null,'Outside main facade is not an exhibition floor');
});
test('Door jambs and heads retain pedestrian passage while solid obstacles block',()=>{
  for(const point of [[8.17,.67],[8.4,.67],[10.6,1.42],[12.36,3.22],[8.1,3.2]])assert.equal(blocked(...point),false,String(point));
  for(const point of [[5.04,2.89],[11.01,3.1],[9.5,4.7],[8.6,1.054],[11.008,.9]])assert.equal(blocked(...point),true,String(point));
  assert.equal(blocked(8.17,.67,.1,2.3),true,'The assumed door head limits tall objects');
});
test('Ceilings remain optional assumptions and building walls can be cut away independently',()=>{
  assert.equal(room.meshes.filter(m=>m.group==='roof').length,7);
  assert(room.meshes.filter(m=>m.group==='roof').every(m=>m.assumed));
  assert.deepEqual([...new Set(room.meshes.filter(m=>m.wall).map(m=>m.wall))].sort(),['A','B','C','D']);
  assert(room.meshes.some(m=>m.group==='wall'&&m.internalWall));
  assert(room.meshes.every(m=>!m.name.startsWith('Install_')));
});
