import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canPlace} from '../src/spatial.js';
import {projectionFor} from '../src/projection.js';
import {planWalk} from '../src/walk_path.js';
import {layoutItems,EVENT_SETUP,PRESENTER_SET,STREAM_SET,AUDIENCE,CONSOLE,GUITAR,SPEAKERS,PROJECTOR,IMAGE_CENTRE} from '../src/layout-migration.js';
import {routeFor,planPower,signalRoute} from '../src/power.js';

const room=JSON.parse(fs.readFileSync(new URL('../data/spacehim-room.json',import.meta.url)));

test('Space Him retains the basement geometry and keeps gear on the gallery floor',()=>{
 assert.equal(room.meshes.length,156);
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
 const data={version:4,space_id:'spacehim',items:[{type:'PROJECTOR',x:6.25,y:9.3,rotation:0},{type:'K8',x:3.4,y:8.6,rotation:180}]};
 const result=layoutItems(data);assert.equal(result[0].y,-9.3);assert.equal(result[0].rotation,180);assert.equal(result[1].rotation,0);
 assert.equal(data.items[0].y,9.3);assert.deepEqual(layoutItems({...data,version:5,items:result}),result);
});

test('Space Him layouts before version 10 get the event setup once',()=>{
 const old={version:9,space_id:'spacehim',items:[{type:'PROJECTOR',x:6.25,y:-9.45,rotation:180},{type:'DESK',x:10.2,y:-9.3,rotation:110},{type:'CHAIR',x:10.88,y:-8.68,rotation:110}]};
 const items=layoutItems(old);
 assert.deepEqual(items.map(i=>i.type),['PROJECTOR',...EVENT_SETUP.map(i=>i.type),'GUITAR']);
 assert.equal(items.filter(i=>i.type==='FOLDING').length,20);
 assert.deepEqual(layoutItems({...old,version:11,items}),items);
});

const facingDot=(it,[tx,ty])=>{const f=[-Math.sin(it.rotation*Math.PI/180),Math.cos(it.rotation*Math.PI/180)],to=[tx-it.x,ty-it.y],n=Math.hypot(...to);return f[0]*to[0]/n+f[1]*to[1]/n;};
test('Event setup: image centred on the south wall, presenter desk left of it, everything on the floor plan',()=>{
 const p=projectionFor(PROJECTOR,room.metadata.projectionWalls);
 assert.equal(p.wall,'south');assert(p.valid,p.reason);assert(Math.abs(p.center[0]-IMAGE_CENTRE[0])<.01&&Math.abs(p.width-3.47)<.02);
 const [desk]=PRESENTER_SET;assert(desk.x>7.99,'east of the image = left of the audience');assert.equal(desk.rotation,30);
 for(const it of [...EVENT_SETUP,...SPEAKERS,PROJECTOR,GUITAR,CONSOLE])assert(canPlace(room.metadata,it.x,it.y,.2,.2,.01),`${it.type} at ${it.x},${it.y}`);
 for(const [i,a] of AUDIENCE.entries())for(const b of AUDIENCE.slice(i+1))assert(Math.hypot(a.x-b.x,a.y-b.y)>.58,'audience chairs keep a gap');
 for(const a of AUDIENCE)assert(facingDot(a,IMAGE_CENTRE)>.95,'chairs face the image');
 const cam=EVENT_SETUP.find(i=>i.type==='CAMERA');assert(cam.y>Math.max(...AUDIENCE.map(a=>a.y)),'camera behind the audience');
});

test('Power routes start at plan outlets, hug the walls and stay on the floor plan',()=>{
 const outlets=[{id:'S',label:'S',point:[10.24,-10.73,.3],normal:[0,1],run:[10.24,-10.49]},{id:'W',label:'W',point:[.01,-8.57,.3],normal:[1,0],run:[.26,-8.57]}];
 const routes=planPower(outlets,[{uid:'a',title:'발표 데스크',x:8.5,y:-9.35,rotation:30,sockets:4},{uid:'b',title:'컨트롤 데스크',x:3.6,y:-9.75,rotation:270,sockets:4}],room.metadata);
 assert.deepEqual(routes.map(r=>r.outlet.id),['S','W']);
 for(const r of routes){assert.deepEqual(r.points[0],r.outlet.point);for(const p of r.points.slice(2))assert(p[2]<.05,'cable runs on the floor');}
 // The control desk cable follows the west then south wall instead of crossing the floor.
 const w=routes[1].points.map(p=>p.slice(0,2));assert(w.some(p=>Math.abs(p[1]+10.49)<.02&&p[0]<.3));
 assert.equal(routeFor(outlets[0],[50,50],room.metadata),null);
});

test('Stream desk sits beside the image at 90°, monitors facing the west wall, two operators',()=>{
 const desk=EVENT_SETUP.find(i=>i.type==='STREAM_DESK'),r=desk.rotation*Math.PI/180,facing=[-Math.sin(r),Math.cos(r)];
 assert(desk.x<4.51,'right of the image (west of it) as the audience sees it');
 assert(Math.abs(facing[1])<1e-9&&facing[0]>0,'operators face east, the image is 90° to their side; monitors face the west wall');
 const chairs=EVENT_SETUP.filter(i=>i.type==='CHAIR'&&Math.hypot(i.x-desk.x,i.y-desk.y)<1);assert.equal(chairs.length,2);
 for(const c of chairs)assert(c.x<desk.x&&c.rotation===desk.rotation,'chairs on the wall side, facing the desk');
});

test('Before version 11 the console moves from its old floor default onto the control desk',()=>{
 const items=layoutItems({version:10,space_id:'spacehim',items:[{type:'MIXER',x:10.2,y:-6.3,rotation:0},{type:'MIXER',x:.5,y:-2,rotation:0}]});
 assert.deepEqual([items[0].x,items[0].y,items[0].rotation],[CONSOLE.x,CONSOLE.y,CONSOLE.rotation]);
 assert.equal(items[1].x,.5,'a console the user moved stays put');
 const desk=EVENT_SETUP.find(i=>i.type==='STREAM_DESK'),r=desk.rotation*Math.PI/180,dx=CONSOLE.x-desk.x,dy=CONSOLE.y-desk.y;
 assert(Math.abs(dx*Math.cos(r)+dy*Math.sin(r))<.6&&Math.abs(-dx*Math.sin(r)+dy*Math.cos(r))<.3,'console lies on the control desk top');
});

test('Power for the event setup comes from the nearest wall outlets',()=>{
 const outlets=[{id:'S',label:'S',point:[10.24,-10.73,.3],normal:[0,1],run:[10.24,-10.49]},{id:'W',label:'W',point:[.01,-8.57,.3],normal:[1,0],run:[.26,-8.57]},
  {id:'E',label:'E',point:[13.935,-6.81,.3],normal:[-1,0],run:[13.71,-6.81]},{id:'N',label:'N',point:[1.97,-.015,.3],normal:[0,-1],run:[1.97,-.24]}];
 const stream=EVENT_SETUP.find(i=>i.type==='STREAM_DESK');
 const routes=planPower(outlets,[{uid:'a',title:'발표 데스크',...PRESENTER_SET[0],sockets:4},{uid:'b',title:'컨트롤 데스크',...stream,sockets:4}],room.metadata);
 assert.deepEqual(routes.map(r=>r.outlet.id),['S','W']);
});

test('The 2026 revised plan adds a 1.96 m wall on the stair-west line, west of the stair entry',()=>{
 const wall=room.meshes.find(m=>m.name==='Partition_Entry_return_2026');
 assert(wall&&wall.group==='wall');
 assert(Math.abs((wall.bounds.min[0]+wall.bounds.max[0])/2-6)<.01);
 assert(Math.abs(wall.bounds.min[1]+6.82)<.01&&wall.bounds.max[1]>-4.95);
 assert(wall.bounds.max[0]<room.metadata.door.x_m-.45,'stair entry stays clear');
 const box=room.metadata.obstacles.find(o=>o.id===wall.name);assert(box);
 const [x0,y0,x1,y1]=box.bounds;
 for(const it of [...EVENT_SETUP,GUITAR,CONSOLE])assert(!(it.x>x0-.2&&it.x<x1+.2&&it.y>y0-.2&&it.y<y1+.2),`${it.type} clear of the new wall`);
});

test('2026 revision: the lower storage room is open to the gallery, stairs kept, sink removed',()=>{
 for(const re of [/^Service_notch_/,/^Sink_/,/^Storage_south_front$/,/^Storage_south_floor$/])assert(!room.meshes.some(m=>re.test(m.name)),String(re));
 for(const n of ['Storage_partition_W','Storage_West_return','Stair_front_860','Stair_front_closure'])assert(room.meshes.some(m=>m.name===n),n);
 assert(room.meshes.some(m=>/^Stair_tread/.test(m.name)),'stairs kept');
 assert(canPlace(room.metadata,11,-4.2,.2,.2,.01),'former storage floor is placeable');
 assert(!canPlace(room.metadata,11,-3.3,.2,.2,.01),'upper storage stays closed');
 const outline=JSON.parse(fs.readFileSync(new URL('../data/spacehim-source/model_notes.json',import.meta.url))).outer_inner_face_polygon_uv;
 assert(!outline.some(([u,v])=>Math.abs(u-13.45)<.01||Math.abs(v-4.96)<.01),'east-end jog removed');
});

test('The stream camera sees the whole projected image past the 2026 wall',()=>{
 const cam=STREAM_SET.at(-1),walls=room.metadata.obstacles;
 for(const tx of [4.51,6.25,7.99])for(let t=0;t<=1;t+=.005){const x=cam.x+(tx-cam.x)*t,y=cam.y+(-10.65-cam.y)*t;assert(!walls.some(({bounds:[x0,y0,x1,y1]})=>x>x0&&x<x1&&y>y0&&y<y1),`sightline to x=${tx}`);}
 assert(facingDot(cam,IMAGE_CENTRE)>.999,'aimed at the image centre');
});

test('Version 17 brings items still at an east-wall default back to the south-wall setup; moved items stay',()=>{
 const moved={type:'CHAIR',mode:'floor',x:1,y:-1,height:0,rotation:0};
 const cases={15:[['K8',11.8,-9.75],['PROJECTOR',12.65,-7],['DESK',12.55,-5.05],['STREAM_DESK',9.7,-9.75],['CHAIR',9.4,-10.28],['FOLDING',11.06,-9.15],['GUITAR',13.05,-9.15]],
  16:[['K8',10.75,-10.15],['PROJECTOR',12.65,-7],['DESK',12.2,-8.996],['STREAM_DESK',8,-9.75],['CHAIR',7.7,-10.28],['FOLDING',11.06,-9.15],['GUITAR',12.9,-4.7]]};
 const want=[SPEAKERS[0],PROJECTOR,PRESENTER_SET[0],STREAM_SET[0],STREAM_SET[1],AUDIENCE[0],GUITAR].map(i=>[i.x,i.y,i.rotation]);
 for(const [version,list] of Object.entries(cases)){
  const items=[...list.map(([type,x,y])=>({type,mode:'floor',x,y,height:0,rotation:77})),moved];
  assert.deepEqual(layoutItems({version:+version,space_id:'spacehim',items}).map(i=>[i.x,i.y,i.rotation]),[...want,[1,-1,0]],`version ${version}`);
  assert.deepEqual(layoutItems({version:17,space_id:'spacehim',items}),items);
 }
});

test('Earlier stage lighting presets are recognised so they can follow the stage',async()=>{
 const {stageLighting,isLegacyStageLighting,defaultLighting}=await import('../src/track-lighting.js');
 assert(!isLegacyStageLighting(stageLighting()));assert(!isLegacyStageLighting(defaultLighting()));assert(!isLegacyStageLighting(undefined));
});

test('Version 14 moves a camera left at the old default; a moved camera stays',()=>{
 const old={type:'CAMERA',mode:'floor',x:5.6,y:-5.45,height:0,rotation:187,tiltX:0,tiltY:0},moved={...old,x:3,y:-5.6};
 const cam=STREAM_SET.at(-1);
 assert.deepEqual(layoutItems({version:13,space_id:'spacehim',items:[old]}),[{...old,x:cam.x,y:cam.y,rotation:cam.rotation}]);
 assert.deepEqual(layoutItems({version:13,space_id:'spacehim',items:[moved]}),[moved]);
 assert.deepEqual(layoutItems({version:14,space_id:'spacehim',items:[old]}),[old]);
});

test('The wall line behind the audience cuts away when the camera is north of it',()=>{
 const names=room.meshes.filter(m=>m.cutaway&&m.cutaway.point[1]===-4.95).map(m=>m.name);
 for(const n of ['Partition_Central_free_end','Stair_front_860','Stair_front_closure'])assert(names.includes(n),n);
});

test('XLR runs are right-angled and keep out of the audience seating',()=>{
 const seats=AUDIENCE.map(a=>[a.x,a.y]),consolePt=[CONSOLE.x,CONSOLE.y,.86];
 for(const target of [...SPEAKERS.map(k=>[k.x,k.y,1.25]),[GUITAR.x,GUITAR.y,.44],[PRESENTER_SET[0].x,PRESENTER_SET[0].y,.76]]){
  const r=signalRoute(consolePt,target,room.metadata,seats),floor=r.points.filter(p=>p[2]<.05);
  for(let i=1;i<floor.length;i++)assert(Math.abs(floor[i][0]-floor[i-1][0])<1e-6||Math.abs(floor[i][1]-floor[i-1][1])<1e-6,'axis-aligned floor run');
  for(const p of floor)for(const s of seats)assert(Math.hypot(p[0]-s[0],p[1]-s[1])>.3,'corner away from seats');
 }
});

test('Stage lighting preset: valid, stage fixtures on, north rooms dark',async()=>{
 const {stageLighting,validateLighting:valid}=await import('../src/track-lighting.js');
 const c=stageLighting();valid(c);assert.equal(c.fixtures.length,12);
 assert(c.fixtures.filter(l=>l.rail.startsWith('upper')).every(l=>!l.enabled),'north rooms stay dark');
 assert(c.fixtures.filter(l=>l.rail==='main-back'&&l.enabled).length>=2,'stage rail lit');
});

test('Guitar: right of the image facing the audience, added once to version 12 layouts',()=>{
 const g=layoutItems({version:12,space_id:'spacehim',items:[{type:'PROJECTOR',x:6.25,y:-9.45,rotation:180}]});
 assert.deepEqual(g.map(i=>i.type),['PROJECTOR','GUITAR']);const guitar=g[1];
 assert(guitar.x<4.51,'west of the image = right of the audience');assert.equal(guitar.rotation,0,'faces north, the audience');
 assert(canPlace(room.metadata,guitar.x,guitar.y,.2,.23,.01));
 assert.deepEqual(layoutItems({version:17,space_id:'spacehim',items:g}),g);
});
