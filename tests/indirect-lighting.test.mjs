import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SurfaceBVH,IndirectLighting} from '../src/indirect-lighting.js';
import {defaultLighting,upgradeLighting,validateLighting} from '../src/track-lighting.js';

function room(){
 const meshes=[],mat=new THREE.MeshStandardMaterial({color:'#bbbbbb'});
 const box=(size,position)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...position);meshes.push(m);};
 box([4,4,.1],[2,-2,-.05]);box([4,4,.1],[2,-2,3.05]);box([.1,4,3],[0,-2,1.5]);box([.1,4,3],[4,-2,1.5]);box([4,.1,3],[2,0,1.5]);box([4,.1,3],[2,-4,1.5]);box([.1,4,3],[2,-2,1.5]);
 return meshes;
}
test('Surface BVH returns the nearest face and blocks rays across a partition',()=>{
 const bvh=new SurfaceBVH(room());assert.equal(bvh.count,84);
 assert(Math.abs(bvh.cast([1,-2,2],[0,0,-1])-2)<1e-6);
 assert(Math.abs(bvh.cast([1,-2,1],[1,0,0])- .95)<1e-6);
 assert(Number.isFinite(bvh.cast([1,-2,1],[1,0,0],3,true)));
 assert.equal(bvh.cast([1,-2,1],[-1,0,0],.5,true),Infinity);
});
test('Spatial reflection follows power and temperature without lighting a sealed adjacent room',()=>{
 const rig=new IndirectLighting(),config=defaultLighting();config.fixtures=[{...config.fixtures[8],tilt:0,yaw:0,t:.4}];
 rig.setRoom(room(),{bounds:{min:[0,-4],max:[4,0]},ceiling_m:3});rig.setLighting(config);rig.setActive(true);rig.tick();assert.equal(rig.pending,0);assert(rig.energy>0);
 assert(rig.describe().sources.some(p=>p.secondary),'A ceiling reflection provides a second diffuse bounce');
 const index=p=>rig.probes.reduce((best,v,i)=>v.reduce((s,x,j)=>s+(x-p[j])**2,0)<rig.probes[best].reduce((s,x,j)=>s+(x-p[j])**2,0)?i:best,0);
 const energy=i=>Array.from(rig.accum.slice(i*12,i*12+3)).reduce((s,v)=>s+v,0);
 assert(energy(index([1,-2,1]))>0);assert.equal(energy(index([3,-2,1])),0,'The partition blocks both diffuse bounces');
 const original=rig.energy,cached=rig.cache.get(config.fixtures[0].id).data;
 config.master=50;rig.setLighting(config);rig.tick();assert(Math.abs(rig.energy*2-original)<.001);assert.equal(rig.cache.get(config.fixtures[0].id).data,cached,'Dimming reuses visibility calculations');
 config.fixtures[0].kelvin=2700;rig.setLighting(config);rig.tick();const c=rig.accum.slice(index([1,-2,1])*12,index([1,-2,1])*12+3);assert(c[0]>c[2]);
 config.master=0;rig.setLighting(config);rig.tick();assert.equal(rig.energy,0);assert(rig.accum.every(v=>v===0));
 config.master=100;config.indirect=false;rig.setLighting(config);rig.tick();assert.equal(rig.describe().energy,0);
 rig.texture.dispose();
});
test('Existing angle and colour settings gain default spatial reflection without being reset',()=>{
 const old=defaultLighting();old.version=2;delete old.indirect;delete old.indirectStrength;old.fixtures[0].kelvin=5000;old.fixtures[0].tilt=47;
 const current=upgradeLighting(old);assert.equal(current.version,3);assert.equal(current.indirect,true);assert.equal(current.indirectStrength,100);assert.equal(current.fixtures[0].kelvin,5000);assert.equal(current.fixtures[0].tilt,47);
 assert.throws(()=>validateLighting({...current,indirectStrength:201}));
});
