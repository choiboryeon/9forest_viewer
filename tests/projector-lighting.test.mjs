import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProjection,validateProjection,frameColors,projectorPower} from '../src/projector-lighting.js';

test('Projector frames are averaged in linear light and preserve left/right colours',()=>{
 assert.deepEqual(frameColors(new Uint8ClampedArray([255,255,255,255,0,0,0,255]),2,1),[[1,1,1],[0,0,0]]);
 const rgb=frameColors(new Uint8ClampedArray([128,0,0,255,0,0,255,255]),2,1);
 assert(rgb[0][0]>.21&&rgb[0][0]<.22);assert.equal(rgb[0][1],0);assert.equal(rgb[1][2],1);
});
test('Screen spill vanishes on black or power off, and follows dimming and image area',()=>{
 const c=defaultProjection(),white=[[1,1,1],[1,1,1]],black=[[0,0,0],[0,0,0]];validateProjection(c);
 assert(projectorPower(c,4,white).gain>projectorPower(c,8,white).gain);
 assert.deepEqual(projectorPower(c,4,black).halves,black);
 assert.equal(projectorPower({...c,enabled:false},4,white).gain,0);
 assert.deepEqual(projectorPower({...c,brightness:0},4,white).halves,black);
 assert.equal(projectorPower({...c,brightness:50},4,white).halves[0][0]*2,projectorPower(c,4,white).halves[0][0]);
 for(const patch of [{lumens:Infinity},{brightness:-1},{poster:'javascript:alert(1)'},{poster:'data:text/html;base64,AA=='},{content:'unknown'}])assert.throws(()=>validateProjection({...c,...patch}));
});
