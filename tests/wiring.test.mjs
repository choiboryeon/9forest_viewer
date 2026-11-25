import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spreadLanes,floorSegments,sharedLength,placeLabels,english} from '../src/wiring.js';

const room=JSON.parse(fs.readFileSync(new URL('../data/spacehim-room.json',import.meta.url)));
const z=.012,run=(...p)=>({points:[[...p[0],.8],...p.map(q=>[...q,z]),[...p.at(-1),.8]],length:0});

test('Cables on the same path get their own lanes, keep their ends and stay on the floor',()=>{
 const routes=[run([3,-8],[3,-10.4],[9,-10.4],[9,-9]),run([3.1,-8],[3.1,-10.4],[8.8,-10.4],[8.8,-9.2]),run([3,-8.5],[3,-10.4],[7,-10.4],[7,-9.5])];
 const out=spreadLanes(routes,room.metadata),segs=out.map(r=>floorSegments(r.points));
 for(let i=0;i<3;i++){
  for(let j=i+1;j<3;j++)assert(sharedLength(segs[i],segs[j])<.03,`${i}/${j} apart`);
  assert.deepEqual(out[i].points[0],routes[i].points[0]);assert.deepEqual(out[i].points.at(-1),routes[i].points.at(-1));
  for(let k=1;k<out[i].points.length;k++){const [a,b]=[out[i].points[k-1],out[i].points[k]];assert(Math.abs(a[0]-b[0])<1e-6||Math.abs(a[1]-b[1])<1e-6,'right angles');}
 }
});

test('A cable with its own path is left alone',()=>{
 const r=[run([3,-8],[3,-9]),run([9,-8],[9,-9])];assert.deepEqual(spreadLanes(r,room.metadata),r);
});

test('Cable labels do not overlap each other or fixed labels',()=>{
 const segments=[{axis:0,v:-9,lo:2,hi:9}],fixed=[[5,-9.2,6,-8.8]];
 const labels=[0,1,2].map(id=>({id,width:1.6,height:.12,segments,up:a=>a?[-1,0]:[0,1],readable:()=>true}));
 const {spots,overlaps}=placeLabels(labels,{cables:[{...segments[0],id:0}],fixed});assert.equal(overlaps,0);
 const boxes=[...[...spots.values()].map(s=>s.b),...fixed];
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(!(a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1]));}
});

test('Wiring names are English',()=>{
 for(const t of ['콘솔','스피커 좌','스피커 우','스피커 3','발표 노트북','기타','송출 카메라','컨트롤 노트북','프로젝터','발표 데스크','컨트롤 데스크'])assert(!/[가-힣]/.test(english(t)),t);
});
