import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RAILS,TrackLighting,defaultLighting,validateLighting,railPoint,railFraction,lampDirection,lampIntensity,effectiveLumens,kelvinColor} from '../src/track-lighting.js';

test('Track plan has twelve valid fixtures constrained to the four model rails',()=>{
 const data=defaultLighting();validateLighting(data);assert.equal(data.fixtures.length,12);
 assert.deepEqual(new Set(data.fixtures.map(l=>l.rail)),new Set(RAILS.map(r=>r.id)));
 const r=RAILS[0];assert.equal(railFraction(r.id,-100,r.a[1]),0);assert.equal(railFraction(r.id,100,r.a[1]),1);
 assert.deepEqual(railPoint(r.id,-10),r.a);assert.deepEqual(railPoint(r.id,10),r.b);
 const invalid=defaultLighting();invalid.fixtures[0].lumens=Infinity;assert.throws(()=>validateLighting(invalid));
 invalid.fixtures[0].lumens=1000;invalid.fixtures[1].id=invalid.fixtures[0].id;assert.throws(()=>validateLighting(invalid));
});
test('Blackout has zero lamp energy; dimming is linear and narrower beams concentrate light',()=>{
 const c=defaultLighting(),l=c.fixtures[0];assert.equal(effectiveLumens(c),14400);
 c.master=0;assert.equal(effectiveLumens(c),0);assert.equal(lampIntensity(l,0),0);
 assert.equal(lampIntensity({...l,enabled:false},100),0);
 assert(Math.abs(lampIntensity(l,50)*2-lampIntensity(l,100))<1e-8);
 assert(lampIntensity({...l,beam:25},100)>lampIntensity({...l,beam:70},100));
 for(const yaw of [0,90,180,270]){const dir=lampDirection({...l,yaw,tilt:40});assert(Math.abs(Math.hypot(...dir)-1)<1e-8);assert(dir[2]<0);}
 assert.notEqual(kelvinColor(2700),kelvinColor(6500));
});
test('Live rig restores saved power, aim, rail positions, and isolated copies',()=>{
 const rig=new TrackLighting(new THREE.Scene());rig.setActive(true);const id=rig.selected;
 rig.edit(id,{rail:'upper-right',t:.65,yaw:75,tilt:35,kelvin:5000});rig.setGlobal({master:37});
 const saved=rig.toJSON();saved.fixtures[0].lumens=2000;assert.equal(rig.selectedLamp.lumens,1200);
 const restored=new TrackLighting(new THREE.Scene());restored.restore(saved);
 assert.equal(restored.config.master,37);assert.equal(restored.selectedLamp.rail,'upper-right');assert.equal(restored.selectedLamp.t,.65);
 assert.equal(restored.nodes.get(id).light.intensity,lampIntensity(saved.fixtures[0],37));
 restored.preset('blackout');assert([...restored.nodes.values()].every(n=>n.light.intensity===0));
 assert.equal(restored.add(),false);restored.remove(id);assert.equal(restored.add('main-back'),true);
 validateLighting(restored.toJSON());rig.clear();restored.clear();
});
