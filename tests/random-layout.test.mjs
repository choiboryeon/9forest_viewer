import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomLayout,normalizeSeed} from '../src/random-layout.js';
import {fitPlacement} from '../src/spatial.js';
const room=JSON.parse(fs.readFileSync(new URL('../data/sunken-room.json',import.meta.url)));
const meta=room.metadata;
const types=Array.from({length:20},(_,i)=>`R${String(i+1).padStart(2,'0')}`);
// A stand-in for the viewer's tryPlace: 0.6 m square objects fitted to the hall,
// kept 0.45 m apart and out of a duct box.
const duct=[1,-4,5,-1];
function tryPlace(c,placed){
  const fit=fitPlacement(meta,c.x,c.y,.3,.3,{bottom:0,top:1.2});if(!fit)return null;
  if(fit.x+.3>duct[0]&&fit.x-.3<duct[2]&&fit.y+.3>duct[1]&&fit.y-.3<duct[3])return null;
  if(placed.some(p=>Math.abs(p.x-fit.x)<.6+.45&&Math.abs(p.y-fit.y)<.6+.45))return null;
  return {type:c.type,x:fit.x,y:fit.y,rotation:c.rotation,heightT:c.heightT};
}
const run=(seed,count=12)=>randomLayout({seed,count,types,regions:meta.floorRegions,tryPlace});
test('Same seed and space give the same layout; another seed differs',()=>{
  assert.deepEqual(run(42),run(42));
  assert.notDeepEqual(run(42).placed,run(43).placed);
});
test('Picks distinct objects up to the requested count and respects the callback',()=>{
  const {placed,skipped}=run(7,12);
  assert.equal(placed.length+skipped.length,12);
  assert.equal(new Set(placed.map(p=>p.type)).size,placed.length);
  assert(placed.length>=10,'a 16 × 13 m hall fits most of twelve objects');
  for(const p of placed){
    assert(!(p.x+.3>duct[0]&&p.x-.3<duct[2]&&p.y+.3>duct[1]&&p.y-.3<duct[3]),'outside the duct box');
    assert.equal(p.rotation%15,0);
    for(const q of placed)if(q!==p)assert(Math.abs(p.x-q.x)>=1.05-1e-9||Math.abs(p.y-q.y)>=1.05-1e-9,'objects keep a walking gap');
  }
});
test('Seeds normalise like the duct generator and counts are clamped',()=>{
  assert.equal(normalizeSeed('abc'),1);assert.equal(normalizeSeed('123'),123);
  assert.equal(run(1,50).placed.length+run(1,50).skipped.length,20);
  assert.equal(run(1,0).placed.length,0);
});
