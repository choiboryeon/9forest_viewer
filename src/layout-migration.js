// Space Him v4 used a mirrored positive-Y plan. v5 restores Blender's X=u,Y=-v.
// A heading must also be reflected, so saved physical placements keep their aim.
// Rotation convention: an item faces (-sin r, cos r); chairs face the way a sitter looks.
const at=(type,x,y,rotation)=>({type,mode:'floor',x,y,height:0,rotation,tiltX:0,tiltY:0});
// Event setup for the tech rider (screen = south long wall, image x 4.51–7.99).
// The audience faces south, so its left is east and its right west:
// - presenter desk + 2 chairs left of the image, turned 30° to the audience.
// - control desk on the audience's right beside the front stools, at 90° to the
//   image; the operators sit with their backs to the west wall.
// - stream camera behind the audience, aimed at the image. It stands west of the
//   2026 entry-return wall (x 5.93–6.08) so that wall stays out of shot.
// - 20 backless round stools in three loose rows (type FOLDING, kept for saved files).
export const IMAGE_CENTRE=[6.25,-10.65];
export const PRESENTER_SET=[at('DESK',8.5,-9.35,30),at('CHAIR',9.18,-9.83,30),at('CHAIR',8.57,-10.18,30)];
export const STREAM_SET=[at('STREAM_DESK',2.7,-6.5,270),at('CHAIR',2,-6.8,270),at('CHAIR',2,-6.2,270),at('CAMERA',5,-5.45,193)];
export const AUDIENCE=[[3.7,-7.86,222],[4.55,-7.89,208],[5.28,-7.79,204],[5.9,-7.75,190],[6.65,-7.77,167],[7.42,-7.88,158],[8.27,-7.65,146],
 [3.87,-7.04,220],[4.77,-6.81,205],[5.51,-6.98,188],[6.38,-7.1,186],[7.11,-7.02,160],[7.85,-7.07,157],[8.6,-6.85,154],
 [3.72,-6.12,203],[4.74,-6.19,198],[5.61,-6.29,180],[6.37,-6.24,182],[7.3,-6.3,170],[8.22,-6.12,158]].map(([x,y,r])=>at('FOLDING',x,y,r));
// Guitar on its stand right of the image (audience view), facing the audience.
export const GUITAR=at('GUITAR',4.05,-10.05,0);
export const EVENT_SETUP=[...PRESENTER_SET,...STREAM_SET,...AUDIENCE];
// The audio console (MIXER) sits on the right half of the control desk top
// (desk-local x +0.33, y -0.02).
export const CONSOLE=at('MIXER',2.68,-6.83,270);
// Speakers in the order audience right, audience left.
export const SPEAKERS=[{...at('K8',3.5,-8.6,0),mode:'stand',height:1.25},{...at('K8',9,-8.6,0),mode:'stand',height:1.25}];
export const PROJECTOR=at('PROJECTOR',6.25,-9.45,180);
const OLD_CONSOLES=[[10.2,-6.3],[3.58,-10.08]];
// Camera default before the 2026 entry-return wall: that wall now hides part of the image.
const OLD_CAMERA=[5.6,-5.45];
const DEFAULTS=[...SPEAKERS,CONSOLE,PROJECTOR,...EVENT_SETUP,GUITAR];
// Defaults of the two east-wall setups (versions 15 and 16), in the order of DEFAULTS.
const EAST_AUDIENCE=[[11.06,-9.15],[11.09,-8.3],[10.99,-7.57],[10.95,-6.95],[10.97,-6.2],[11.08,-5.43],[10.85,-4.58],
 [10.24,-8.98],[10.01,-8.08],[10.18,-7.34],[10.3,-6.47],[10.22,-5.74],[10.27,-5],[10.05,-4.25],
 [9.32,-9.13],[9.39,-8.11],[9.49,-7.24],[9.44,-6.48],[9.5,-5.55],[9.32,-4.63]].map(([x,y])=>['FOLDING',x,y]);
const EAST15=[['K8',11.8,-9.75],['K8',11.8,-4.25],['MIXER',10.03,-9.77],['PROJECTOR',12.65,-7],['DESK',12.55,-5.05],['CHAIR',13.03,-4.37],['CHAIR',13.38,-4.98],
 ['STREAM_DESK',9.7,-9.75],['CHAIR',9.4,-10.35],['CHAIR',10,-10.35],['CAMERA',8.65,-8.25],...EAST_AUDIENCE,['GUITAR',13.05,-9.15]];
const EAST16=[['K8',10.75,-10.15],['K8',11.8,-4.25],['MIXER',8.33,-9.77],['PROJECTOR',12.65,-7],['DESK',12.2,-9],['CHAIR',12.88,-9.14],['CHAIR',12.38,-9.66],
 ['STREAM_DESK',8,-9.75],['CHAIR',7.7,-10.35],['CHAIR',8.3,-10.35],['CAMERA',8.65,-8.25],...EAST_AUDIENCE,['GUITAR',12.9,-4.7]];
// Items still at one of those defaults (the app may have nudged them a few
// centimetres on load) move to the matching current default; moved items stay.
function moveDefaults(items,from){
 const used=new Set();
 return items.map(it=>{
  const i=from.findIndex(([type,x,y],k)=>!used.has(k)&&type===it.type&&Math.hypot(Number(it.x)-x,Number(it.y)-y)<.12);
  if(i<0)return it;used.add(i);const n=DEFAULTS[i];return {...it,x:n.x,y:n.y,rotation:n.rotation};
 });
}
const EVENT_TYPES=new Set(EVENT_SETUP.map(it=>it.type));
export function layoutItems(data){
 if(data.space_id!=='spacehim')return data.items;
 const items=Number(data.version)>=5?data.items:mirrorV4(data.items);
 // Layouts saved before version 12 predate this event setup: replace any earlier
 // desk/chair placement with it once, and move a console still at an old default
 // onto the control desk (a console the user moved stays). Version 12+ files are
 // kept as saved.
 const version=Number(data.version);
 let out=version<12?[...items.filter(it=>!EVENT_TYPES.has(it.type)&&it.type!=='GUITAR'),...EVENT_SETUP.map(it=>({...it})),{...GUITAR}]:items;
 if(version<12)out=out.map(it=>it.type==='MIXER'&&OLD_CONSOLES.some(([x,y])=>Math.hypot(Number(it.x)-x,Number(it.y)-y)<.05)?{...it,...CONSOLE}:it);
 // Version 13 adds the guitar once to layouts that do not have one.
 if(version<13&&!out.some(it=>it.type==='GUITAR'))out=[...out,{...GUITAR}];
 // Version 14 (2026 revised plan) moves a stream camera still at the old default
 // west of the new wall; a camera the user placed elsewhere stays.
 if(version<14){const cam=STREAM_SET.at(-1);out=out.map(it=>it.type==='CAMERA'&&Math.hypot(Number(it.x)-OLD_CAMERA[0],Number(it.y)-OLD_CAMERA[1])<.05?{...it,x:cam.x,y:cam.y,rotation:cam.rotation}:it);}
 // Versions 15 and 16 had the screen on the east wall; version 17 brings it back to
 // the centre of the south wall.
 if(version===15)out=moveDefaults(out,EAST15);
 else if(version===16)out=moveDefaults(out,EAST16);
 return out;
}
function mirrorV4(items){
 return items.map(it=>({...it,y:-Number(it.y),rotation:((180-Number(it.rotation||0))%360+360)%360,tiltX:0,tiltY:0}));
}
