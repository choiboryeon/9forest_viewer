import {canPlace} from './spatial.js';

// Floor wiring layout: cables that share a path run side by side, and the cable
// labels are kept apart from each other at the current zoom.
export const LANE=.09; // spacing between parallel cables (m)
const FLOOR=.05,eps=1e-6;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const pathLength=p=>p.slice(1).reduce((s,q,i)=>s+Math.hypot(q[0]-p[i][0],q[1]-p[i][1],q[2]-p[i][2]),0);

// English names for the wiring labels (the rest of the interface stays Korean).
const EN={'콘솔':'Console','스피커 좌':'Speaker L','스피커 우':'Speaker R','발표 노트북':'Presentation laptop','기타':'Guitar','송출 카메라':'Stream camera','컨트롤 노트북':'Control laptop','프로젝터':'Projector','발표 데스크':'Presentation desk','컨트롤 데스크':'Control desk'};
export const english=t=>EN[t]??t.replace(/^스피커 /,'Speaker ');

// Splits a route into its device ends and axis-aligned floor lines.
// A line has `axis` (0 = runs along x) and `value`, its fixed coordinate.
function parse(points){
 let i=0,j=points.length-1;while(i<=j&&points[i][2]>=FLOOR)i++;while(j>=i&&points[j][2]>=FLOOR)j--;
 const floor=points.slice(i,j+1),lines=[];
 for(let k=1;k<floor.length;k++){
  const a=floor[k-1],b=floor[k];if(dist(a,b)<.005)continue;
  const axis=Math.abs(b[1]-a[1])<1e-4?0:Math.abs(b[0]-a[0])<1e-4?1:-1;if(axis<0)return null;
  const last=lines.at(-1);if(last&&last.axis===axis)continue;
  lines.push({axis,value:a[1-axis],offset:0});
 }
 return lines.length?{head:points.slice(0,i),tail:points.slice(j+1),start:floor[0],end:floor.at(-1),lines}:null;
}
function corners(r){
 const z=r.start[2],pts=[r.start],at=(axis,along,v)=>axis===0?[along,v,z]:[v,along,z];
 const first=r.lines[0];pts.push(at(first.axis,r.start[first.axis],first.value+first.offset));
 for(let k=1;k<r.lines.length;k++){const a=r.lines[k-1],b=r.lines[k];pts.push(at(a.axis,b.value+b.offset,a.value+a.offset));}
 const l=r.lines.at(-1);pts.push(at(l.axis,r.end[l.axis],l.value+l.offset),r.end);
 return pts.filter((p,i)=>i===0||dist(p,pts[i-1])>.004);
}
export function floorSegments(points){
 const out=[];for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k];if(a[2]>=FLOOR||b[2]>=FLOOR||dist(a,b)<.004)continue;const axis=Math.abs(b[1]-a[1])<=Math.abs(b[0]-a[0])?0:1;out.push({axis,v:a[1-axis],lo:Math.min(a[axis],b[axis]),hi:Math.max(a[axis],b[axis])});}
 return out;
}
// Length over which two routes run closer together than a lane.
export function sharedLength(A,B,gap=LANE*.9){
 let s=0;for(const a of A)for(const b of B)if(a.axis===b.axis&&Math.abs(a.v-b.v)<gap)s+=Math.max(0,Math.min(a.hi,b.hi)-Math.max(a.lo,b.lo));
 return s;
}
function clear(meta,pts){for(let k=1;k<pts.length;k++){const a=pts[k-1],b=pts[k],n=Math.max(1,Math.ceil(dist(a,b)/.15));for(let i=0;i<=n;i++)if(!canPlace(meta,a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n,0,0,.005))return false;}return true;}
// Moves whole straight runs sideways, one lane at a time, until no two routes lie
// on the same line. Devices stay where they are; short jogs join them to the lanes.
// `seats`: lanes avoid passing closer than .22 m to a seat when they can.
export function spreadLanes(routes,meta,seats=[]){
 const model=routes.map(r=>parse(r.points)),segs=routes.map((r,i)=>model[i]?floorSegments(corners(model[i])):floorSegments(r.points));
 const seatCost=list=>{let c=0;for(const s of list)for(const p of seats){const along=Math.max(s.lo,Math.min(s.hi,p[s.axis]));if(Math.hypot(p[s.axis]-along,p[1-s.axis]-s.v)<.22)c+=.4;}return c;};
 const clash=(i,list)=>segs.reduce((c,o,j)=>j===i?c:c+sharedLength(list,o),0);
 const tries=[0];for(let n=1;n<=5;n++)tries.push(n*LANE,-n*LANE);
 for(let pass=0;pass<8;pass++){
  let moved=false;
  for(let i=0;i<model.length;i++){const m=model[i];if(!m)continue;
   for(const line of m.lines){
    if(clash(i,segs[i])<.02)break;
    const before=line.offset,options=tries.map(o=>{line.offset=o;const pts=corners(m),list=floorSegments(pts);return {o,pts,list,cost:clash(i,list)+seatCost(list)+Math.abs(o)*.15+m.lines.reduce((s,l)=>s+Math.abs(l.offset)*.05,0)};}).sort((a,b)=>a.cost-b.cost);
    const pick=options.find(x=>x.o===before||clear(meta,x.pts))??options.find(x=>x.o===before);
    line.offset=pick.o;segs[i]=pick.list;if(pick.o!==before)moved=true;
   }
  }
  if(!moved)break;
 }
 return routes.map((r,i)=>{const m=model[i];if(!m||m.lines.every(l=>l.offset===0))return r;const points=[...m.head,...corners(m),...m.tail];return {...r,points,length:pathLength(points)};});
}

// --- labels -------------------------------------------------------------------
const overlap=(a,b,pad=0)=>a[0]<b[2]+pad&&a[2]>b[0]-pad&&a[1]<b[3]+pad&&a[3]>b[1]-pad;
const box=(x,y,w,h,vertical)=>vertical?[x-h/2,y-w/2,x+h/2,y+w/2]:[x-w/2,y-h/2,x+w/2,y+h/2];
const segBox=s=>s.axis===0?[s.lo,s.v,s.hi,s.v]:[s.v,s.lo,s.v,s.hi];
// labels: [{id,width,height,segments,up:axis=>[ux,uy],readable:axis=>bool,current}],
// sizes already scaled. fixed: boxes no label may touch. Returns {spots, overlaps}.
export function placeLabels(labels,{cables,fixed=[],gear=[],inside=()=>true}){
 const placed=[],spots=new Map();let overlaps=0;
 for(const l of [...labels].sort((a,b)=>b.width-a.width)){
  let best=null;const total=l.segments.reduce((s,q)=>s+q.hi-q.lo,0)||1;let run=0;
  for(const s of l.segments){
   const len=s.hi-s.lo,up=l.up(s.axis),vertical=s.axis===1,n=Math.max(1,Math.ceil(len/.2));
   for(let i=0;i<=n;i++)for(const side of [1,-1])for(let row=0;row<5;row++){
    const t=s.lo+len*i/n,off=side*(l.height/2+.02+row*l.height*.55);
    const x=(s.axis===0?t:s.v)+up[0]*off,y=(s.axis===0?s.v:t)+up[1]*off,b=box(x,y,l.width,l.height,vertical);
    const over=Math.max(0,s.lo-(t-l.width/2))+Math.max(0,t+l.width/2-s.hi);
    let cost=row*.7+(side<0?.1:0)+over*2.5+Math.abs((run+len*i/n)/total-.5)*.5+(l.readable(s.axis)?0:.9);
    if(l.current){const d=Math.hypot(x-l.current[0],y-l.current[1]);if(d>.3)cost+=.5;}
    if(best&&cost>=best.cost)continue;
    let hits=0;for(const p of [...placed,...fixed])if(overlap(b,p,.015))hits++;cost+=hits*200;
    if(best&&cost>=best.cost)continue;
    for(const c of cables)if(overlap(b,segBox(c),-.004))cost+=c.id===l.id?4:2.2;
    for(const g of gear)if(g[0]+g[2]>b[0]&&g[0]-g[2]<b[2]&&g[1]+g[2]>b[1]&&g[1]-g[2]<b[3])cost+=2;
    if(best&&cost>=best.cost)continue;
    for(const [px,py] of [[b[0],b[1]],[b[2],b[1]],[b[0],b[3]],[b[2],b[3]]])if(!inside(px,py))cost+=12;
    if(!best||cost<best.cost)best={cost,hits,x,y,axis:s.axis,b};
   }
   run+=len;
  }
  if(best){placed.push(best.b);spots.set(l.id,best);if(best.hits)overlaps++;}
 }
 return {spots,overlaps};
}
