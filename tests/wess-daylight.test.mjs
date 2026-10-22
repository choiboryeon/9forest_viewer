import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {WessDaylight,defaultDaylight,validateDaylight,upgradeDaylight} from '../src/wess-daylight.js';

function model(){
 const room=JSON.parse(fs.readFileSync(new URL('../data/wess-room.json',import.meta.url))),opaque=[],glass=[];
 for(const m of room.meshes){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(m.vertices,3));g.setIndex(m.faces);
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:m.color}));mesh.name=m.name;
  (/^Window_Glass_/.test(m.name)?glass:opaque).push(mesh);
 }
 return {room,opaque,glass};
}
test('WESS daylight uses both window faces and preserves shadowed enclosed rooms',()=>{
 const {room,opaque,glass}=model(),rig=new WessDaylight(new THREE.Scene());rig.setRoom(opaque,room.metadata,glass);rig.setActive(true);rig.setDynamic(new THREE.Group());
 assert.equal(rig.windows.length,9);assert.equal(rig.windows.filter(w=>w.axis===1).length,4);assert.equal(rig.config.artificial,60);assert.equal(rig.lamps.length,11);assert.equal(rig.auxiliaryLamps.length,4);assert.equal(rig.strips.length,3);
 rig.edit({artificial:0});
 for(let i=0;i<15;i++)rig.tick();assert.equal(rig.volume.pending,0);assert(rig.volume.energy>0);
 const nearest=p=>rig.volume.probes.reduce((best,v,i)=>v.reduce((s,x,j)=>s+(x-p[j])**2,0)<rig.volume.probes[best].reduce((s,x,j)=>s+(x-p[j])**2,0)?i:best,0);
 const energy=p=>Array.from(rig.volume.accum.slice(nearest(p)*12,nearest(p)*12+3)).reduce((s,v)=>s+v,0);
 assert(energy([2,1,.5])>energy([7,3,.5])*2,'Skylight falls off away from glazing');assert.equal(energy([13,2,.5]),0,'An enclosed east room receives no fake ambient fill');
 const cached=rig.volume.cache.get('Window_Glass_00').direct,withBounce=rig.volume.energy;
 rig.edit({bounce:false,sun:0});rig.tick();assert(rig.volume.energy<withBounce);assert.equal(rig.volume.cache.get('Window_Glass_00').direct,cached,'Dimming reuses visibility');
 rig.edit({sky:0,sun:0,artificial:0});rig.tick();assert.equal(rig.volume.energy,0);assert.equal(rig.sun.visible,false);assert(rig.lamps.every(l=>!l.visible));assert(rig.auxiliaryLamps.every(l=>!l.visible));
 rig.edit({artificial:12});for(let i=0;i<3;i++)rig.tick();assert(rig.lamps.every(l=>l.intensity>0));assert(rig.auxiliaryLamps.every(l=>l.visible&&l.intensity>0));
 rig.restore();assert.deepEqual(rig.toJSON(),defaultDaylight());rig.setActive(false);assert.equal(rig.volume.uniforms.nfIndirectStrength.value,0);
});
test('WESS daylight accepts legacy layouts and rejects invalid imported settings',()=>{
 validateDaylight(undefined);validateDaylight(defaultDaylight());
 for(const data of [[],{...defaultDaylight(),sky:-1},{...defaultDaylight(),sun:Infinity},{...defaultDaylight(),artificial:151},{...defaultDaylight(),bounce:'true'},{...defaultDaylight(),version:3}])assert.throws(()=>validateDaylight(data));
 assert.deepEqual(upgradeDaylight({version:1,sky:100,sun:35,artificial:0,bounce:true}),defaultDaylight(),'Old saved defaults receive the guide-photo lighting');
 assert.deepEqual(upgradeDaylight({version:1,sky:0,sun:0,artificial:0,bounce:false}),{version:2,sky:0,sun:0,artificial:0,bounce:false},'User-edited blackouts stay dark');
});
