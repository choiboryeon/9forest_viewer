import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canPlace,fitPlacement,floorAt} from '../src/spatial.js';
const room=JSON.parse(fs.readFileSync(new URL('../data/sunken-room.json',import.meta.url)));
const audit=JSON.parse(fs.readFileSync(new URL('../data/sunken-geometry-audit.json',import.meta.url)));
const meta=room.metadata;
test('Sunken keeps every exported Blender triangle in Blender world metres',()=>{
  assert.equal(audit.exact_triangle_count,true);
  assert.equal(audit.exported_triangles,audit.source_triangles);
  assert.equal(room.meshes.reduce((n,m)=>n+m.faces.length/3,0),audit.source_triangles);
  assert.deepEqual(meta.bounds,{min:[-4,-9],max:[12,4]});
  assert.equal(meta.up_axis,'Z');
  assert(meta.model_bounds.max[2]>10,'The ridge skylight stays above 10 m');
});
test('Sunken walls are split per side for cutaway and the painted brick ends at 3.015 m',()=>{
  for(const wall of ['A','B','C','D'])assert(room.meshes.some(m=>m.wall===wall&&/^v4_brick_shell_upper/.test(m.name)),wall);
  for(const m of room.meshes.filter(m=>/^v4_brick_shell_painted/.test(m.name)))assert(m.bounds.max[2]<=3.016,m.name);
  assert(room.meshes.filter(m=>m.group==='roof').every(m=>m.ceilingElement));
});
test('Work zone is open; catwalk stair, pilasters and the live stage block placement',()=>{
  assert.equal(floorAt(meta,4,-2.5),0);
  assert(canPlace(meta,4,-2.5,.4,.4,.04,{bottom:0,top:2}));
  assert(canPlace(meta,4,-2.5,.3,.3,.04,{bottom:2,top:5.63}),'A hanging object reaches the 5.7 m grid');
  assert(!canPlace(meta,9.3,2.3,.2,.2),'catwalk stair');
  assert(!canPlace(meta,0,-8.8,.1,.1),'south pilaster');
  assert(!canPlace(meta,9.6,-6.6,.3,.3),'live-stage desk');
  assert(canPlace(meta,2,3.3,.2,.2,.04,{bottom:0,top:2}),'floor items fit under the catwalk deck');
  assert(!canPlace(meta,2,3.3,.2,.2,.04,{bottom:2,top:5.63}),'hanging wires cannot pass the catwalk deck');
  const fit=fitPlacement(meta,9.6,-6.6,.3,.3);
  assert(fit&&canPlace(meta,fit.x,fit.y,.3,.3));
});
