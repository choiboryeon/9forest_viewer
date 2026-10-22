import test from 'node:test';
import assert from 'node:assert/strict';
import {planDuct,normalizeDuctParams} from '../src/duct.js';
const params={seed:780,complexity:8,type:'mix',mode:'floor',W:8,D:5,H:5.7};
test('Same seed and parameters give the same ducts',()=>{
  const a=planDuct(params),b=planDuct(params);
  assert.deepEqual(a.stats,b.stats);
  assert.deepEqual(a.samples,b.samples);
  assert(a.totals.ducts>0&&a.totals.length>1);
});
test('Duct centrelines stay inside their W×D×H region',()=>{
  for(const mode of ['floor','wall','ceiling','mixed'])for(const seed of [1,2,3]){
    const p=planDuct({...params,mode,seed});
    for(const [x,y,z,r] of p.samples){
      assert(x-r>=-params.W/2-1e-6&&x+r<=params.W/2+1e-6,`x ${mode}`);
      // Wall and ceiling ends run into the back face / top face they connect to.
      assert(z>=-params.D/2-1e-6&&z+r<=params.D/2+1e-6,`z ${mode}`);
      assert(y>=-1e-6&&y<=params.H+1e-6,`y ${mode}`);
    }
  }
});
test('Placed objects inside the region are avoided when generating',()=>{
  const box={x0:-1,x1:1,y0:0,y1:1.5,z0:-1,z1:1};
  const hits=p=>p.samples.filter(([x,y,z,r])=>x>box.x0-r&&x<box.x1+r&&y>box.y0-r&&y<box.y1+r&&z>box.z0-r&&z<box.z1+r).length;
  let without=0,withObstacle=0;
  for(let seed=1;seed<=12;seed++){without+=hits(planDuct({...params,seed,avoid:false},[box]));withObstacle+=hits(planDuct({...params,seed,avoid:true},[box]));}
  assert(without>0,'the test box lies on duct routes when ignored');
  assert(withObstacle<without/4,`avoidance should remove most hits (${withObstacle} vs ${without})`);
});
test('Parameters are clamped to the simulator ranges',()=>{
  const p=normalizeDuctParams({complexity:40,diameter:0,count:3.6,W:1,type:'bad',seed:'abc'});
  assert.equal(p.complexity,10);assert.equal(p.diameter,.2);assert.equal(p.count,4);assert.equal(p.W,2);assert.equal(p.type,'auto');assert.equal(p.seed,1);
});
