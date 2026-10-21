import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canPlace} from '../src/spatial.js';
import {projectionFor} from '../src/projection.js';
import {planWalk} from '../src/walk_path.js';
import {layoutItems} from '../src/layout-migration.js';

const room=JSON.parse(fs.readFileSync(new URL('../data/spacehim-room.json',import.meta.url)));

test('Space Him retains the basement geometry and keeps gear on the gallery floor',()=>{
 assert.equal(room.meshes.length,167);
 assert.equal(room.metadata.ceiling_m,2.64);
 assert(room.meshes.some(m=>m.name==='Gallery_carpet'));
 assert(room.meshes.some(m=>m.name==='Ceiling_gallery'));
 assert(canPlace(room.metadata,3.5,-8.6,.37,.37,.04,{bottom:0,top:1.7}));
 assert(canPlace(room.metadata,6.25,-9.45,.21,.16,.04,{bottom:0,top:.16}));
 assert(!canPlace(room.metadata,7.2,-3.5,.2,.2));
 const route=planWalk({width:room.metadata.width_m,depth:room.metadata.depth_m,door:room.metadata.door,metadata:room.metadata,objects:[{id:'north',x:1.5,y:-2,hx:.2,hy:.2,focusZ:1.1,blocks:true},{id:'south',x:6,y:-8,hx:.2,hy:.2,focusZ:1.1,blocks:true}]});
 assert.equal(route.visits,2);
});

test('0.3:1 projector estimates a screen on the south wall and flags invalid aim',()=>{
 const walls=room.metadata.projectionWalls;
 const p=projectionFor({x:6.25,y:-9.45,rotation:180},walls);
 assert.equal(p.wall,'south');assert(p.valid);
 assert(Math.abs(p.distance-1.04)<1e-6);
 assert(Math.abs(p.width-p.distance/.3)<1e-6);
 assert(Math.abs(p.height-p.width*9/16)<1e-6);
 assert.equal(projectionFor({x:6.25,y:-9.45,rotation:0},walls),null);
 assert.equal(projectionFor({x:6.25,y:-9.45,rotation:145},walls).valid,false);
});

test('Reviewed Space Him has the source plan orientation and separates uncertain panels',()=>{
 assert.deepEqual(room.metadata.bounds,{min:[0,-10.75],max:[14.46,0]});
 const panels=room.meshes.filter(m=>m.unconfirmed);assert.equal(panels.length,2);
 assert(panels.every(m=>!room.metadata.obstacles.some(o=>o.id===m.name)));
 const front=room.meshes.find(m=>m.name==='W_Exterior_01');assert(front.cutaway.normal[1]<-.99);
 const floor=room.meshes.find(m=>m.name==='Gallery_carpet');assert.equal(floor.color,'#5b5f61');
});

test('Legacy Space Him layouts retain physical position and aim without double migration',()=>{
 const data={version:4,space_id:'spacehim',items:[{type:'PROJECTOR',x:6.25,y:9.4,rotation:0},{type:'K8',x:3.5,y:8.6,rotation:180}]};
 const result=layoutItems(data);assert.equal(result[0].y,-9.4);assert.equal(result[0].rotation,180);assert.equal(result[1].rotation,0);
 assert.equal(data.items[0].y,9.4);assert.deepEqual(layoutItems({...data,version:5,items:result}),result);
});
