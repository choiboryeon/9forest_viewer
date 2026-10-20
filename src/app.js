import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {planWalk} from './walk_path.js';
import {floorAt,fitPlacement,canPlace} from './spatial.js';
import {gearModel} from './gear.js';
import {projectionFor} from './projection.js';

const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
const input=JSON.parse($('#layout-data').textContent), spaces=input.spaces;
let library=input.objects,byId=new Map(library.map(o=>[o.id,o]));
let spaceId='nightshift',room=spaces.nightshift,meta=room.metadata,W,D,H,eave,ridgeY,bounds,cx,cy;
const isGear=()=>spaceId==='spacehim';
const spaceName=()=>spaceId==='wess'?'WESS+':isGear()?'공간 힘':'Night Shift';
function setRoomData(id){
 spaceId=id;room=spaces[id];meta=room.metadata;W=meta.width_m;D=meta.depth_m;H=meta.ridge_m;eave=meta.eave_m;ridgeY=meta.ridge_y_m;
 bounds=meta.bounds||{min:[0,0],max:[W,D]};cx=(bounds.min[0]+bounds.max[0])/2;cy=(bounds.min[1]+bounds.max[1])/2;
 library=isGear()?input.equipment:input.objects;byId=new Map(library.map(o=>[o.id,o]));
}
setRoomData(spaceId);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=v=>Math.round(v*100)/100;
const roofZ=y=>meta.roof_type==='flat'?meta.ceiling_m:eave+(H-eave)*(y<=ridgeY?y/ridgeY:(D-y)/(D-ridgeY));
const MODE={floor:'바닥 직접',plinth:'낮은 좌대',rod:'봉 좌대',hang:'천장 행잉',stand:'스피커 스탠드'};
const GEAR_RECS={K8:['stand','삼각 스탠드 포함 · 높이 조절'],MIXER:['floor','믹서 위치와 방향 조절'],PROJECTOR:['floor','투사 벽 가까이 바닥 설치 · 0.3:1']};
const RECS={
 R01:['hang','긴 관을 양쪽에서 받치기'],R02:['plinth','넓은 테두리를 낮게 받치기'],R03:['rod','원통 하부를 봉 위에 거치'],R04:['floor','넓은 원형 바닥으로 놓기'],R05:['plinth','넓은 하부 테두리를 받치기'],
 R06:['rod','원통 중심을 띄워 보기'],R07:['hang','얇은 원형판을 세로로 보이기'],R08:['rod','헤드를 눈높이에 거치'],R09:['hang','코일이 늘어지는 형태 보기'],R10:['plinth','여러 관을 한 면에서 지지'],
 R11:['floor','큰 원통 바닥으로 놓기'],R12:['floor','세로형 용기를 바닥에 놓기'],R13:['hang','호스 고리를 공중에 두기'],R14:['floor','넓은 몸체를 바닥에 놓기'],R15:['hang','넓은 판면을 매달아 보기'],
 R16:['plinth','링 하부를 낮게 받치기'],R17:['plinth','코일을 수평면에 놓기'],R18:['rod','얕은 트레이를 높여 보기'],R19:['floor','바퀴와 포크를 바닥에 놓기'],R20:['plinth','분기관을 낮게 받치기']};
const storageKey=()=>`9forest_layout_${spaceId}_v1`,LEGACY_STORAGE='nightshift_layout_v2';
const memoryLayouts=new Map();
let sequence=0,view='3d',selected=null,items=[],drag=null,selectionBox=null,walkState=null;
const meshes=new Map(),spaceMeshes=[];
let toastTimer;
function toast(message){const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3000);}
const THEME_STORAGE='9forest_theme_v1';
function applyTheme(dark){document.documentElement.dataset.theme=dark?'dark':'light';const button=$('#theme-toggle');button.textContent=dark?'라이트 모드':'다크 모드';button.setAttribute('aria-pressed',String(dark));}
let savedTheme=null;try{savedTheme=localStorage.getItem(THEME_STORAGE)??localStorage.getItem('nightshift_theme_v1');}catch{}
applyTheme(savedTheme==='dark');
$('#theme-toggle').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme!=='dark';applyTheme(dark);try{localStorage.setItem(THEME_STORAGE,dark?'dark':'light');}catch{}});

const renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();const roomGroup=new THREE.Group(),objectGroup=new THREE.Group(),projectionGroup=new THREE.Group();scene.add(roomGroup,objectGroup,projectionGroup);
const pmrem=new THREE.PMREMGenerator(renderer),env=new RoomEnvironment();scene.environment=pmrem.fromScene(env,.06).texture;env.dispose();pmrem.dispose();scene.environmentIntensity=.28;
const ambient=new THREE.HemisphereLight(0xfff7eb,0xb1b6b4,.9);ambient.position.set(0,0,8);scene.add(ambient);
// The D-wall window is frosted in the reference photos: it gives a broad, faint
// wash of daylight rather than a hard sunbeam. Its light still casts soft object
// and mounting shadows onto the floor and adjacent walls.
const windowLight=new THREE.SpotLight(0xdceeff,7.5,9,Math.PI/3,.88,1.6);
windowLight.position.set(-.2,1.45,2.05);windowLight.target.position.set(3.2,2.15,.35);
windowLight.castShadow=true;windowLight.shadow.mapSize.set(2048,2048);windowLight.shadow.camera.near=.12;windowLight.shadow.camera.far=9;windowLight.shadow.normalBias=.012;windowLight.shadow.radius=4;windowLight.shadow.intensity=.46;scene.add(windowLight,windowLight.target);
const galleryLight=new THREE.SpotLight(0xffedcf,3.6,7,Math.PI/2.9,.9,1.4);
galleryLight.position.set(3.1,3.05,2.55);galleryLight.target.position.set(3,2.15,.3);
galleryLight.castShadow=true;galleryLight.shadow.mapSize.set(1024,1024);galleryLight.shadow.camera.near=.1;galleryLight.shadow.camera.far=7;galleryLight.shadow.normalBias=.014;galleryLight.shadow.radius=4;galleryLight.shadow.intensity=.38;scene.add(galleryLight,galleryLight.target);
const fill=new THREE.DirectionalLight(0xfff6e8,.42);fill.position.set(5,4,4);scene.add(fill);
const grid=new THREE.Group();scene.add(grid);
grid.visible=false;

function clearGroup(group){group.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [o.material].flat())m.dispose();}});group.clear();}
function buildRoom(){
 clearGroup(roomGroup);clearGroup(grid);spaceMeshes.length=0;
 for(const region of meta.floorRegions||[{bounds:[0,0,W,D],z:0}]){
  const [x0,y0,x1,y1]=region.bounds,z=(region.z||0)+.012;
  const line=(a,b)=>grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]),new THREE.LineBasicMaterial({color:0x7a9280,transparent:true,opacity:.19})));
  for(let x=Math.ceil(x0*2)/2;x<=x1;x+=.5)line([x,y0,z],[x,y1,z]);
  for(let y=Math.ceil(y0*2)/2;y<=y1;y+=.5)line([x0,y,z],[x1,y,z]);
 }
 for(const m of room.meshes){
  if(!m.vertices?.length||!m.faces?.length)continue;
  let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(m.vertices,3));g.setIndex(m.faces);const indexed=g;g=g.toNonIndexed();indexed.dispose();g.computeVertexNormals();
  const part=String(m.group||'').toLowerCase(),isFloor=part==='floor',isRoof=part==='roof',isEquipment=part==='equipment',isStructure=part==='structure',isCeiling=isRoof||/Rafter|Eave timber|Timber ridge|Steel beam|light|spotlight|^Beam_|^Track_|^Spot_|^North_spot|^North_track/i.test(String(m.name||'')),isWindowGlass=/D obscure glass|Glass_/i.test(String(m.name||''));
  const mat=new THREE.MeshStandardMaterial({color:isWindowGlass?'#e2edef':m.color||'#dfded7',metalness:isStructure?.2:.03,roughness:isFloor?.98:1,side:THREE.DoubleSide,transparent:(m.opacity??1)<1,opacity:m.opacity??1,depthWrite:(m.opacity??1)>=1,emissive:isWindowGlass?'#cfe7ee':'#000000',emissiveIntensity:isWindowGlass?(spaceId==='wess'?.15:.55):0});
  const mesh=new THREE.Mesh(g,mat);mesh.name=m.name;mesh.castShadow=false;mesh.receiveShadow=!isWindowGlass;
  mesh.userData={category:part,isFloor,isRoof,isCeiling,isEquipment,isStructure,wall:roomWall(m),internalWall:!!m.internalWall};roomGroup.add(mesh);spaceMeshes.push(mesh);
 }
 const wess=spaceId==='wess',him=isGear();
 windowLight.position.set(...(him?[3,1,2.45]:wess?[-.2,1.4,2.2]:[-.2,1.45,2.05]));windowLight.target.position.set(...(him?[6.3,6,.3]:wess?[4.5,2,.2]:[3.2,2.15,.35]));windowLight.intensity=him?1.6:wess?15:7.5;windowLight.distance=him?12:wess?15:9;
 galleryLight.position.set(...(him?[7,7,2.45]:wess?[8.5,1.8,2.55]:[3.1,3.05,2.55]));galleryLight.target.position.set(...(him?[6.4,8.7,.4]:wess?[8.5,1.8,0]:[3,2.15,.3]));galleryLight.intensity=him?8:wess?12:3.6;galleryLight.distance=him?14:wess?15:7;
 ambient.intensity=him?.7:.9;
 windowLight.shadow.camera.far=him?16:wess?16:9;galleryLight.shadow.camera.far=him?16:wess?16:7;windowLight.shadow.camera.updateProjectionMatrix();galleryLight.shadow.camera.updateProjectionMatrix();
 $('#roof').disabled=!spaceMeshes.some(m=>m.userData.isCeiling);$('#structure').disabled=!spaceMeshes.some(m=>m.userData.isStructure);$('#equipment').disabled=!spaceMeshes.some(m=>m.userData.isEquipment);
}

function roomWall(m){if(m.wall)return m.wall;const t=`${m.group||''} ${m.name||''}`,v=t.match(/(?:wall|door|window|opening)[_\s-]*([ABCD])(?:\b|_)/i)||t.match(/^([ABCD])(?:_wall| gable)/i);return v?.[1]?.toUpperCase()||null;}

const camera3=new THREE.PerspectiveCamera(39,1,.03,100);camera3.up.set(0,0,1);
const cameraTop=new THREE.OrthographicCamera(-4,4,4,-4,.03,100);cameraTop.up.set(0,1,0);
const cameraWalk=new THREE.PerspectiveCamera(72,1,.03,100);cameraWalk.up.set(0,0,1);
let camera=camera3,controls;
function setupControls(){controls?.dispose();controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.screenSpacePanning=true;controls.minDistance=.5;controls.maxDistance=60;controls.maxPolarAngle=Math.PI*.498;controls.enableRotate=view!=='top';controls.target.set(cx,cy,.9);controls.addEventListener('change',()=>{updateRoom();});}
function resize(){const stage=$('.stage');if(!stage.clientWidth||!stage.clientHeight)return;renderer.setSize(stage.clientWidth,stage.clientHeight,false);const a=stage.clientWidth/stage.clientHeight;camera3.aspect=a;camera3.updateProjectionMatrix();cameraWalk.aspect=a;cameraWalk.updateProjectionMatrix();const span=Math.max(D,W/a)*.58;cameraTop.left=-span*a;cameraTop.right=span*a;cameraTop.top=span;cameraTop.bottom=-span;cameraTop.updateProjectionMatrix();}
new ResizeObserver(resize).observe($('.stage'));
function updateRoom(){const walls=$('#walls').checked,roof=$('#roof').checked,structure=$('#structure').checked,equipment=$('#equipment').checked;for(const m of spaceMeshes){const u=m.userData;let show=true;if(u.isCeiling&&(!roof||view==='top'))show=false;if(u.isStructure&&!structure)show=false;if(u.isEquipment&&!equipment)show=false;if((u.wall||u.internalWall)&&!walls)show=false;if(u.wall&&view==='3d'&&walls){const normals={A:[0,1],B:[1,0],C:[0,-1],D:[-1,0]},edge={A:[cx,bounds.max[1]],B:[bounds.max[0],cy],C:[cx,bounds.min[1]],D:[bounds.min[0],cy]},n=normals[u.wall],p=edge[u.wall];if(n&&(camera.position.x-p[0])*n[0]+(camera.position.y-p[1])*n[1]>.08)show=false;}m.visible=show;}}
function setView(v){
 if(v==='walk'){startWalk();return;}if(walkState)stopWalk(false);view=v;camera=v==='top'?cameraTop:camera3;setupControls();
 if(v==='top'){camera.position.set(cx,cy,25);controls.target.set(cx,cy,0);cameraTop.zoom=1;}
 else if(v==='3d'){const c=room.cameras?.['3d'];camera.position.set(...(c?.position||[9,-6.7,6.9]));controls.target.set(...(c?.target||[cx,cy,1]));camera3.fov=39;}
 else{const c=room.cameras?.[v];if(c){camera.position.set(...c.position);controls.target.set(...c.target);}else camera.position.set(cx,-1.5,1.8);camera3.fov=70;}
 camera.updateProjectionMatrix();camera.lookAt(controls.target);controls.update();resize();
 if(v==='3d'&&(spaceId==='wess'||isGear())){
  const radius=Math.hypot(W,D,H)/2,vertical=THREE.MathUtils.degToRad(camera3.fov/2),horizontal=Math.atan(Math.tan(vertical)*camera3.aspect);
  const distance=radius/Math.sin(Math.min(vertical,horizontal))*1.08;
  camera.position.sub(controls.target).normalize().multiplyScalar(distance).add(controls.target);controls.update();
 }
 updateRoom();grid.visible=v==='top';
 const names={'3d':'입체 배치',top:'평면 배치',A:'A면 · 정면',B:'B면 · 우측',C:'C면 · 후면',D:'D면 · 좌측',...room.viewLabels};
 for(const b of $$('[data-view]')){b.setAttribute('aria-pressed',String(b.dataset.view===v));if(['A','B','C','D'].includes(b.dataset.view))b.textContent=room.viewLabels?.[b.dataset.view]||`${b.dataset.view}면`;}
 $('#stage-title').textContent=`${spaceName()} · ${names[v]}`;
 $('#stage-subtitle').textContent=spaceId==='wess'?'주실 7.920 × 4.565 m · 중앙실 +30 mm':isGear()?'지하 전시장 · 13.95 × 10.75 m · 천고 2.64 m':`${W.toFixed(1)} × ${D.toFixed(1)} m · ${meta.area_m2.toFixed(2)}㎡`;
 const noun=isGear()?'기자재':'사물';$('#hint').textContent=v==='top'?`${noun} 드래그로 이동 · 휠 확대`:v==='3d'?`${noun} 드래그 · 빈 공간 드래그로 회전 · 휠 확대`:`${noun} 드래그로 이동 · 빈 공간 드래그로 시점 변경`;
}

function walkPoint(path,t){if(path.length<2)return path[0];const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1])),total=lengths.reduce((a,b)=>a+b,0);let distance=total*t;for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const part=lengths[i]?clamp(distance/lengths[i],0,1):1;return [path[i][0]+(path[i+1][0]-path[i][0])*part,path[i][1]+(path[i+1][1]-path[i][1])*part]}distance-=lengths[i]}return path.at(-1);}
const walkLookMatrix=new THREE.Matrix4(),walkTarget=new THREE.Vector3(),walkRotation=new THREE.Quaternion(),walkDirection=new THREE.Vector3();
const exponentialStep=(dt,tau)=>1-Math.exp(-dt/tau);
function easeExponentialTurn(t){const sigmoid=x=>1/(1+Math.exp(-x)),start=sigmoid(-4),end=sigmoid(4);return (sigmoid(8*(t-.5))-start)/(end-start);}
function setWalkDirection(quaternion,yaw,pitch){walkDirection.set(Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch));walkTarget.copy(cameraWalk.position).add(walkDirection);walkLookMatrix.lookAt(cameraWalk.position,walkTarget,cameraWalk.up);quaternion.setFromRotationMatrix(walkLookMatrix);}
function applyPeek(state,now,dt){const peek=state.peek;if(!peek){cameraWalk.quaternion.copy(state.autoQuaternion);return null;}if(peek.dragging){cameraWalk.quaternion.copy(peek.quaternion);return 'drag';}const elapsed=(now-peek.releasedAt)/1000;if(elapsed<.85){cameraWalk.quaternion.copy(peek.quaternion);return 'hold';}const blend=1-Math.exp(-(elapsed-.85)/.48);walkRotation.copy(peek.origin).slerp(state.autoQuaternion,blend);peek.quaternion.rotateTowards(walkRotation,THREE.MathUtils.degToRad(110)*dt);cameraWalk.quaternion.copy(peek.quaternion);if(blend>.98&&peek.quaternion.angleTo(state.autoQuaternion)<THREE.MathUtils.degToRad(1.5)){state.peek=null;cameraWalk.quaternion.copy(state.autoQuaternion);return null;}return 'return';}
function advanceWalk(dt,now=performance.now()){const state=walkState;if(!state)return;const step=state.paused||state.finished?0:dt;if(step)state.time=Math.min(state.plan.total,state.time+step);let remaining=state.time,index=0,segment=state.plan.segments[0];for(;index<state.plan.segments.length-1&&remaining>segment.duration;index++){remaining-=segment.duration;segment=state.plan.segments[index+1]}const fraction=clamp(remaining/segment.duration,0,1),position=segment.kind==='move'?walkPoint(segment.path,fraction):segment.position,headBob=segment.kind==='move'?.013*Math.sin(state.time*Math.PI*3.4)*Math.sin(Math.PI*fraction):0;cameraWalk.position.set(position[0],position[1],state.plan.eye+floorAt(meta,position[0],position[1])+headBob);
 if(segment.kind==='spin'){if(!state.spinStarted){walkDirection.set(0,0,-1).applyQuaternion(state.autoQuaternion);const horizontal=Math.hypot(walkDirection.x,walkDirection.y);state.spinYaw=horizontal>.001?Math.atan2(walkDirection.y,walkDirection.x):0;state.spinPitch=Math.atan2(walkDirection.z,horizontal);state.spinStarted=true;}const yaw=state.spinYaw+Math.PI*2*easeExponentialTurn(fraction),pitch=state.spinPitch;walkTarget.set(position[0]+Math.cos(yaw)*Math.cos(pitch),position[1]+Math.sin(yaw)*Math.cos(pitch),cameraWalk.position.z+Math.sin(pitch));walkLookMatrix.lookAt(cameraWalk.position,walkTarget,cameraWalk.up);state.autoQuaternion.setFromRotationMatrix(walkLookMatrix);}else{walkTarget.set(...segment.focus);if(segment.kind==='look'){const dx=segment.focus[0]-position[0],dy=segment.focus[1]-position[1],length=Math.hypot(dx,dy)||1,lateral=segment.scanH*Math.sin(Math.PI*2*fraction);walkTarget.x-=dy/length*lateral;walkTarget.y+=dx/length*lateral;walkTarget.z+=segment.scanV*Math.sin(Math.PI*fraction);}if(step){state.gaze.lerp(walkTarget,exponentialStep(step,segment.kind==='move'?.8:.55));walkLookMatrix.lookAt(cameraWalk.position,state.gaze,cameraWalk.up);walkRotation.setFromRotationMatrix(walkLookMatrix);const angle=state.autoQuaternion.angleTo(walkRotation),natural=angle*exponentialStep(step,.85),limit=THREE.MathUtils.degToRad(68)*step;state.autoQuaternion.rotateTowards(walkRotation,Math.min(natural,limit));}}
 const peekPhase=applyPeek(state,now,dt);
 const visited=state.plan.segments.slice(0,index).filter(s=>s.kind==='look').length+1,label=segment.id?byId.get(segment.id)?.title||'':'';$('#walk-step').textContent=segment.kind==='spin'?'공간 한 바퀴':state.plan.visits?`${Math.min(visited,state.plan.visits)}/${state.plan.visits} · ${label}`:'입구';$('#walk-detail').textContent=peekPhase==='drag'?'자유 시선 · 드래그 중':peekPhase==='hold'?'잠시 둘러보는 중':peekPhase==='return'?'원래 시선으로 복귀 중':state.paused?'일시정지 · 눈높이 165cm':segment.kind==='spin'?'360° 둘러보는 중':segment.kind==='move'?'이동 중 · 눈높이 165cm':state.plan.visits?`${isGear()?'기자재 확인':'사물 관람'} · 눈높이 165cm`:'눈높이 165cm';$('#walk-progress').value=state.plan.total?Math.round(state.time/state.plan.total*100):100;
 if(state.time>=state.plan.total){state.finished=true;$('#walk-step').textContent='워킹 완료';$('#walk-detail').textContent='입구부터 전체 경로를 둘러봤습니다';$('#walk-pause').hidden=true;}}
function startWalk(){
 const returnView=walkState?.returnView||view;
 if(walkState)stopWalk(false);
 const objects=items.map(it=>{
  const size=displaySize(it),footprint=foot(it),bottom=it.mode==='floor'?.012:it.mode==='plinth'?.18:it.height;
  return {id:it.type,x:it.x,y:it.y,hx:footprint.hx,hy:footprint.hy,focusZ:floorAt(meta,it.x,it.y)+clamp(bottom+size.height*.55,.6,2.5),scanH:clamp(Math.max(size.width,size.depth)*.22,.05,.17),scanV:clamp(size.height*.11,.035,.11),blocks:bottom<1.9};
 });
 const plan=planWalk({width:W,depth:D,door:meta.door,objects,metadata:meta});
 if(!plan.segments.length){toast(`보행 가능한 공간이 없습니다. ${isGear()?'기자재':'사물'} 간격을 넓혀 주세요.`);return;}
 if(plan.skipped)toast(`접근 경로가 없는 ${isGear()?'기자재':'사물'} ${plan.skipped}${isGear()?'개':'점'}는 워킹에서 제외했습니다`);
 const firstFocus=plan.segments.find(s=>s.focus)?.focus||[cx,cy,plan.eye];
 const roof=$('#roof'),walls=$('#walls');
 walkState={plan,returnView,visibility:{roof:roof.checked,walls:walls.checked,roofDisabled:roof.disabled,wallsDisabled:walls.disabled},time:0,paused:false,finished:false,spinStarted:false,gaze:new THREE.Vector3(...firstFocus),autoQuaternion:new THREE.Quaternion(),pointer:null,peek:null};
 roof.checked=true;walls.checked=true;roof.disabled=true;walls.disabled=true;
 view='walk';camera=cameraWalk;controls.enabled=false;grid.visible=false;
 cameraWalk.position.set(plan.start[0],plan.start[1],plan.eye+floorAt(meta,...plan.start));cameraWalk.lookAt(new THREE.Vector3(...firstFocus));walkState.autoQuaternion.copy(cameraWalk.quaternion);
 if(selectionBox)selectionBox.visible=false;
 $('.stage').dataset.walk='true';$('#walk-panel').hidden=false;$('#walk-pause').hidden=false;$('#walk-pause').textContent='일시정지';$('#walk-start').textContent='다시 시작';$('#walk-start').setAttribute('aria-pressed','true');
 for(const b of $$('[data-view]'))b.setAttribute('aria-pressed','false');
 $('#stage-title').textContent='워킹 시뮬레이션';$('#stage-subtitle').textContent=`165cm 시점 · 입구 → ${isGear()?'기자재':'사물'} ${plan.visits}${isGear()?'개':'점'} → 360°`;$('#hint').textContent='장면을 드래그해 잠시 둘러보기 · 놓으면 원래 시선으로 복귀';
 resize();advanceWalk(0);updateRoom();
}
function stopWalk(restore=true){if(!walkState)return;const state=walkState;if(state.pointer&&renderer.domElement.hasPointerCapture(state.pointer.id))renderer.domElement.releasePointerCapture(state.pointer.id);walkState=null;const roof=$('#roof'),walls=$('#walls');roof.checked=state.visibility.roof;walls.checked=state.visibility.walls;roof.disabled=state.visibility.roofDisabled;walls.disabled=state.visibility.wallsDisabled;$('.stage').dataset.walk='false';$('#walk-panel').hidden=true;$('#walk-start').textContent='워킹 시뮬레이션';$('#walk-start').setAttribute('aria-pressed','false');updateSelectionBox();if(restore)setView(state.returnView);}

function modelFor(type){if(meshes.has(type))return meshes.get(type).clone(true);const o=byId.get(type),root=isGear()?gearModel(type):new THREE.Group();for(const m of o.meshes||[]){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(m.vertices,3));g.setIndex(m.faces);if(m.flat)g=g.toNonIndexed();g.computeVertexNormals();const mat=new THREE.MeshStandardMaterial({color:m.color||'#9a9f98',metalness:m.metalness??.4,roughness:m.roughness??.6,side:THREE.DoubleSide,flatShading:!!m.flat});const mesh=new THREE.Mesh(g,mat);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}meshes.set(type,root);return root.clone(true);}
function orientation(item){const s=byId.get(item.type).dimensions_m,base=item.type==='R07'&&item.mode==='hang'?90:0,euler=new THREE.Euler((item.tiltX+base)*Math.PI/180,item.tiltY*Math.PI/180,item.rotation*Math.PI/180,'ZYX'),quaternion=new THREE.Quaternion().setFromEuler(euler),box=new THREE.Box3().makeEmpty();for(const x of [-s.width/2,s.width/2])for(const y of [-s.depth/2,s.depth/2])for(const z of [-s.height/2,s.height/2])box.expandByPoint(new THREE.Vector3(x,y,z).applyQuaternion(quaternion));return {quaternion,size:{width:box.max.x-box.min.x,depth:box.max.y-box.min.y,height:box.max.z-box.min.z}};}
function displaySize(item){return orientation(item).size;}
function foot(item){const s=displaySize(item);return item.type==='K8'&&item.mode==='stand'?{hx:.37,hy:.37}:{hx:s.width/2,hy:s.depth/2};}
function signedAngle(value){const n=Number(value);return Number.isFinite(n)?((n+180)%360+360)%360-180:0;}
function normalize(item){
 const o=byId.get(item.type);if(!o)return null;
 item.mode=isGear()?(item.type==='K8'&&item.mode==='stand'?'stand':'floor'):(MODE[item.mode]&&item.mode!=='stand'?item.mode:RECS[item.type]?.[0]||'floor');item.rotation=Number.isFinite(+item.rotation)?((+item.rotation%360)+360)%360:0;item.tiltX=signedAngle(item.tiltX);item.tiltY=signedAngle(item.tiltY);
 const size=displaySize(item),{hx,hy}=foot(item),supportPad=item.mode==='plinth'?.07:0;
 const x=Number.isFinite(+item.x)?+item.x:cx,y=Number.isFinite(+item.y)?+item.y:cy;
 const preliminaryMax=Math.max(.30,roofZ(y)-floorAt(meta,x,y)-size.height-.20);
 item.height=round(clamp(Number(item.height)||1.15,isGear()?.75:.30,preliminaryMax));
 const bottom=item.mode==='floor'?.012:item.mode==='plinth'?.18:item.height;
 // Include plinths/rods down to the floor and hanging wires up to the ceiling.
 const vertical={bottom:item.mode==='hang'?bottom:0,top:item.mode==='hang'?roofZ(y)-floorAt(meta,x,y)-.07:bottom+size.height};
 const fit=fitPlacement(meta,x,y,hx+supportPad,hy+supportPad,vertical);if(!fit)return null;
 item.x=fit.x;item.y=fit.y;
 const max=Math.max(.30,roofZ(item.y)-floorAt(meta,item.x,item.y)-size.height-.20);
 item.height=round(clamp(Number(item.height)||1.15,isGear()?.75:.30,max));return item;
}
const shadowPixels=new Uint8Array(64*64*4);
for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4,r=Math.hypot((x+.5)/32-1,(y+.5)/32-1),a=Math.max(0,1-r);shadowPixels[i]=31;shadowPixels[i+1]=37;shadowPixels[i+2]=35;shadowPixels[i+3]=Math.round(255*a*a*(3-2*a));}
const contactShadowTexture=new THREE.DataTexture(shadowPixels,64,64,THREE.RGBAFormat);contactShadowTexture.needsUpdate=true;contactShadowTexture.magFilter=THREE.LinearFilter;
function fixture(item,s){const w=s.width,d=s.depth,group=new THREE.Group(),mode=item.mode,z=item.mode==='floor'?.012:item.mode==='plinth'?.18:item.height;
const dark=new THREE.MeshStandardMaterial({color:'#3d4e46',metalness:.63,roughness:.52}),soft=new THREE.MeshStandardMaterial({color:'#687668',metalness:.2,roughness:.72});
const put=(g,m,x,y,z0)=>{const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z0);if(g.type==='CylinderGeometry')mesh.rotation.x=Math.PI/2;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
const lift=mode==='hang'?.65:mode==='rod'?.35:.28,shadow=new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.45,w+lift),Math.max(.45,d+lift)),new THREE.MeshBasicMaterial({map:contactShadowTexture,transparent:true,depthWrite:false,opacity:mode==='hang'?.13:mode==='rod'?.19:.23}));
shadow.position.set(mode==='hang'?.15:.035,.035,.006);shadow.renderOrder=1;shadow.raycast=()=>{};group.add(shadow);
if(isGear()){const ring=new THREE.Mesh(new THREE.RingGeometry(item.type==='K8'?.32:.23,item.type==='K8'?.35:.26,40),new THREE.MeshBasicMaterial({color:item.type==='PROJECTOR'?0x81c8df:item.type==='MIXER'?0x93c9a4:0xe4ae78,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));ring.position.z=.014;ring.renderOrder=2;group.add(ring);}
if(mode==='plinth'){put(new THREE.BoxGeometry(w+.10,d+.10,.14),soft,0,0,.08);put(new THREE.BoxGeometry(w+.14,d+.14,.018),dark,0,0,.014);}
if(mode==='rod'){const r=clamp(Math.max(w,d)*.25,.11,.25);put(new THREE.CylinderGeometry(r,r,.035,40),dark,0,0,.018);put(new THREE.CylinderGeometry(.015,.015,Math.max(.02,z-.035),16),dark,0,0,z/2+.015);put(new THREE.CylinderGeometry(clamp(Math.min(w,d)*.25,.08,.17),clamp(Math.min(w,d)*.25,.08,.17),.025,40),soft,0,0,z-.014);}
if(mode==='stand'){put(new THREE.CylinderGeometry(.023,.023,Math.max(.05,z-.18),12),dark,0,0,z/2+.09);put(new THREE.CylinderGeometry(.032,.032,.22,12),soft,0,0,z-.13);for(const a of [0,2*Math.PI/3,4*Math.PI/3]){const end=new THREE.Vector3(Math.cos(a)*.32,Math.sin(a)*.32,.03),start=new THREE.Vector3(0,0,.52),dir=end.clone().sub(start),leg=put(new THREE.CylinderGeometry(.014,.017,dir.length(),10),dark,(end.x+start.x)/2,(end.y+start.y)/2,(end.z+start.z)/2);leg.rotation.setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));}}
if(mode==='hang'){const top=z+s.height,anchor=roofZ(item.y)-floorAt(meta,item.x,item.y)-.07,span=w>.65?clamp(w*.25,.15,.38):0,lines=span?[-span,span]:[0];for(const x of lines){const h=Math.max(.03,anchor-top);put(new THREE.CylinderGeometry(.0035,.0035,h,8),dark,x,0,top+h/2);put(new THREE.SphereGeometry(.018,10,8),dark,x,0,anchor);}}
return {group,bottom:z};}
function updateProjections(){
 clearGroup(projectionGroup);if(!isGear())return;
 for(const it of items.filter(x=>x.type==='PROJECTOR')){
  const p=projectionFor(it,meta.projectionWalls),itZ=floorAt(meta,it.x,it.y);if(!p)continue;
  const a=p.wallA,b=p.wallB,len=Math.hypot(b[0]-a[0],b[1]-a[1]),tx=(b[0]-a[0])/len,ty=(b[1]-a[1])/len;
  const width=Math.min(p.width,6),height=Math.min(p.height,2.5),cx0=p.center[0]+(it.x-p.center[0])*.012,cy0=p.center[1]+(it.y-p.center[1])*.012;
  const z0=.22,z1=z0+height,vertices=[cx0-tx*width/2,cy0-ty*width/2,z0,cx0+tx*width/2,cy0+ty*width/2,z0,cx0+tx*width/2,cy0+ty*width/2,z1,cx0-tx*width/2,cy0-ty*width/2,z1];
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();
  const color=p.valid?0xafd8e5:0xe8a178,screen=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}));screen.raycast=()=>{};projectionGroup.add(screen);
  const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:p.valid?0x76afc4:0xc6754b,transparent:true,opacity:.9}));lines.raycast=()=>{};projectionGroup.add(lines);
  const angle=it.rotation*Math.PI/180,lens=new THREE.Vector3(it.x-Math.sin(angle)*.175,it.y+Math.cos(angle)*.175,itZ+.17);
  for(const i of [0,1,2,3]){const endpoint=new THREE.Vector3(...vertices.slice(i*3,i*3+3));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([lens,endpoint]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.28}));line.raycast=()=>{};projectionGroup.add(line);}
 }
}
function drawItem(item){if(walkState)stopWalk();if(item.root){const oldFixture=item.root.children[0];oldFixture?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});objectGroup.remove(item.root);}item.root=new THREE.Group();item.root.name=item.uid;item.root.userData.uid=item.uid;const {quaternion,size}=orientation(item),f=fixture(item,size),pivot=new THREE.Group(),model=modelFor(item.type);model.position.z=-byId.get(item.type).dimensions_m.height/2;pivot.quaternion.copy(quaternion);pivot.position.z=f.bottom+size.height/2;pivot.add(model);item.model=pivot;item.root.add(f.group,pivot);item.root.position.set(item.x,item.y,floorAt(meta,item.x,item.y));objectGroup.add(item.root);if(selected===item.uid)updateSelectionBox();updateProjections();}
function updateSelectionBox(){if(walkState){if(selectionBox)selectionBox.visible=false;return;}const it=items.find(x=>x.uid===selected);if(!it){if(selectionBox)selectionBox.visible=false;return;}it.root.updateMatrixWorld(true);if(!selectionBox){selectionBox=new THREE.BoxHelper(it.model,0xa45b37);selectionBox.material.transparent=true;selectionBox.material.opacity=.62;selectionBox.material.depthTest=false;selectionBox.renderOrder=50;scene.add(selectionBox);}else{selectionBox.visible=true;selectionBox.setFromObject(it.model);}}
function syncItem(item){if(walkState)stopWalk();if(!normalize(item)){toast(isGear()?"기자재가 공간에 들어가지 않습니다":"사물이 공간에 들어가지 않습니다");return;}drawItem(item);if(selected===item.uid){renderInspector();renderPlaced();}persist();}
function serializeLayout(){return {title:`9FOREST · ${spaceName()} 공간 배치`,version:4,space_id:spaceId,room_m:{width:W,depth:D,height:H},items:items.map(({type,mode,x,y,height,rotation,tiltX,tiltY})=>({type,mode,x,y,height,rotation,tiltX,tiltY}))};}
function persist(){const layout=serializeLayout();memoryLayouts.set(spaceId,layout);try{localStorage.setItem(storageKey(),JSON.stringify(layout));localStorage.setItem('9forest_active_space_v1',spaceId);}catch{}}
function recommended(type){return (isGear()?GEAR_RECS:RECS)[type]||['floor',''];}
function defaultPosition(index,type){if(isGear()){const count=items.filter(i=>i.type===type).length;return type==='K8'?(count%2?[9,8.6]:[3.5,8.6]):type==='PROJECTOR'?[6.25,9.4]:[10.2,6.3];}const spots=spaceId==='wess'?[[1.6,1],[3.4,1],[5.4,1],[7,1.3],[1.6,3.4],[3.4,3.5],[5.9,3.5],[9.5,2.8],[13.3,3.6]]:[[1.05,1.06],[2.55,1.03],[4.2,1.05],[1.15,3.08],[2.7,3.05],[4.3,3.05],[1.8,2],[3.75,2]];return spots[index%spots.length];}
function addItem(type,from=null){if(walkState)stopWalk();const o=byId.get(type);if(!o)return;if(items.length>=100){toast('한 공간에 최대 100개까지 배치할 수 있습니다');return;}const [x,y]=from?[from.x+.3,from.y+.3]:defaultPosition(items.length,type),mode=from?.mode||recommended(type)[0];const item=normalize({uid:'item-'+Date.now().toString(36)+'-'+(++sequence),type,mode,x,y,height:from?.height??1.25,rotation:from?.rotation??0,tiltX:from?.tiltX??0,tiltY:from?.tiltY??0});if(!item){toast('이 장비를 배치할 수 있는 공간이 없습니다');return;}items.push(item);drawItem(item);select(item.uid);renderCatalog();persist();toast(o.title+' 배치됨');}
function removeItem(uid){if(walkState)stopWalk();const i=items.findIndex(x=>x.uid===uid);if(i<0)return;items[i].root.children[0]?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});objectGroup.remove(items[i].root);items.splice(i,1);updateProjections();selected=null;updateSelectionBox();renderPlaced();renderInspector();persist();toast('배치에서 제거했습니다');}
function select(uid){selected=uid;updateSelectionBox();renderPlaced();renderInspector();}
function selectedItem(){return items.find(x=>x.uid===selected);}
function renderPlaced(){const el=$('#placed-list');$('#placed-count').textContent=items.length+(isGear()?'개':'점');if(!items.length){el.innerHTML=`<p class="empty">왼쪽 아래에서 ${isGear()?'기자재':'사물'}를 추가하세요.</p>`;return;}el.innerHTML=items.map((it,i)=>`<button class="placed-row" data-uid="${esc(it.uid)}" aria-current="${selected===it.uid}"><span><strong>${esc(byId.get(it.type).title)}</strong><small>${esc(MODE[it.mode])} · ${round(it.x).toFixed(2)}, ${round(it.y).toFixed(2)} m</small></span><span class="idx">${String(i+1).padStart(2,'0')}</span></button>`).join('');for(const b of el.querySelectorAll('button'))b.addEventListener('click',()=>select(b.dataset.uid));}
function renderCatalog(){const q=$('#search').value.trim().toLowerCase();const filtered=library.filter(o=>(o.title+o.id).toLowerCase().includes(q));$('#catalog').innerHTML=filtered.map(o=>`<div class="catalog-item">${o.photo?`<img src="${o.photo}" alt="">`:''}<div><strong>${esc(o.title)}</strong><small>${esc(o.id)} · ${esc(MODE[recommended(o.id)[0]])}</small></div><button data-add="${esc(o.id)}" aria-label="${esc(o.title)} 추가">추가</button></div>`).join('')||'<p class="empty">검색 결과가 없습니다.</p>';for(const b of $('#catalog').querySelectorAll('[data-add]'))b.addEventListener('click',()=>addItem(b.dataset.add));}
function occupied(item){const a=foot(item);return items.filter(other=>other!==item).some(other=>{const b=foot(other);return Math.abs(item.x-other.x)<a.hx+b.hx-.03&&Math.abs(item.y-other.y)<a.hy+b.hy-.03;});}
function renderInspector(){
 if(isGear()){renderGearInspector();return;}
 const el=$('#inspector'),it=selectedItem();
 if(!it){el.innerHTML='<div class="right-empty"><h3>사물을 선택하세요</h3><ol><li>왼쪽 목록에서 사물을 추가합니다.</li><li>공간 안에서 끌어 위치를 바꿉니다.</li><li>거치 방식과 회전 방향을 설정합니다.</li></ol><p class="mini-note">마지막 배치는 이 브라우저에 자동 저장됩니다. 다른 컴퓨터로 옮길 때는 상단의 배치 저장을 사용하세요.</p></div>';return;}
 const o=byId.get(it.type),rec=recommended(it.type),mounted=it.mode==='rod'||it.mode==='hang';
 const max=round(Math.max(.30,roofZ(it.y)-floorAt(meta,it.x,it.y)-displaySize(it).height-.20));
 const axes=[['rotation','수평 Z',0,360],['tiltX','앞뒤 X',-180,180],['tiltY','좌우 Y',-180,180]];
 const rotationRows=axes.map(([key,label,min,maxAngle])=>`<div class="axis-row"><label for="${key}">${label}</label><input id="${key}-range" type="range" min="${min}" max="${maxAngle}" step="5" value="${round(it[key])}" aria-label="${label} 회전"><input id="${key}" type="number" min="${min}" max="${maxAngle}" step="1" value="${round(it[key])}" aria-label="${label} 각도"></div>`).join('');
 el.innerHTML=`<div class="inspector"><img class="object-photo" src="${o.photo||''}" alt="${esc(o.title)} 참고 사진"><div class="object-title"><h3>${esc(o.title)}</h3><span class="badge">${esc(o.id)}</span></div><span class="control-label">거치 방식</span><div class="mode-grid">${Object.entries(MODE).map(([k,v])=>`<button data-mode="${k}" aria-pressed="${it.mode===k}">${v}</button>`).join('')}</div><p class="recommend"><strong>추천: ${esc(MODE[rec[0]])}</strong> · ${esc(rec[1])}</p><div class="rule"></div><div class="rotation-head"><span class="control-label">사물 회전 (°)</span><button id="reset-rotation">초기화</button></div><div class="rotation-controls">${rotationRows}</div><div class="rule"></div><div class="coord-grid"><div class="field"><label for="pos-x">좌우 X (m)</label><input id="pos-x" type="number" min="${bounds.min[0]}" max="${bounds.max[0]}" step="0.05" value="${round(it.x).toFixed(2)}"></div><div class="field"><label for="pos-y">앞뒤 Y (m)</label><input id="pos-y" type="number" min="${bounds.min[1]}" max="${bounds.max[1]}" step="0.05" value="${round(it.y).toFixed(2)}"></div><div class="field full"><label for="height">바닥 위 하단 높이 (m)</label><input id="height" type="number" min="0.30" max="${max}" step="0.05" value="${round(it.height).toFixed(2)}" ${mounted?'':'disabled'}></div>${mounted?`<div class="field full"><input id="height-range" class="range" type="range" min="0.30" max="${max}" step="0.01" value="${round(it.height).toFixed(2)}"></div>`:''}</div><p id="collision-note" class="micro" style="color:#a15e3f" ${occupied(it)?'':'hidden'}>다른 사물과 바닥 면적이 겹칩니다.</p><div class="row-actions"><button id="duplicate">복제</button><button id="remove" class="danger">배치에서 제거</button></div><p class="mini-note">모델 크기 ${o.dimensions_m.width.toFixed(2)} × ${o.dimensions_m.depth.toFixed(2)} × ${o.dimensions_m.height.toFixed(2)} m · 위치는 공간 안쪽 기준</p></div>`;
 for(const b of el.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{it.mode=b.dataset.mode;syncItem(it);});
 for(const [id,key] of [['pos-x','x'],['pos-y','y'],['height','height']]){const inp=$('#'+id);inp?.addEventListener('change',()=>{it[key]=Number(inp.value);syncItem(it);});}
 $('#height-range')?.addEventListener('input',e=>{it.height=Number(e.target.value);normalize(it);drawItem(it);$('#height').value=it.height.toFixed(2);});
 $('#height-range')?.addEventListener('change',()=>syncItem(it));
 for(const [key] of axes){
  const number=$('#'+key),range=$('#'+key+'-range');
  const preview=value=>{it[key]=Number(value);normalize(it);drawItem(it);number.value=round(it[key]);range.value=round(it[key]);$('#pos-x').value=it.x.toFixed(2);$('#pos-y').value=it.y.toFixed(2);$('#height').value=it.height.toFixed(2);const warning=$('#collision-note');if(warning)warning.hidden=!occupied(it);persist();};
  number.addEventListener('input',()=>{if(number.value!=='')preview(number.value);});
  number.addEventListener('change',()=>{preview(number.value);syncItem(it);});
  range.addEventListener('input',()=>preview(range.value));
  range.addEventListener('change',()=>syncItem(it));
 }
 $('#reset-rotation').addEventListener('click',()=>{it.rotation=0;it.tiltX=0;it.tiltY=0;syncItem(it);});
 $('#duplicate').addEventListener('click',()=>addItem(it.type,it));$('#remove').addEventListener('click',()=>removeItem(it.uid));
}
function renderGearInspector(){
 const el=$('#inspector'),it=selectedItem();
 if(!it){el.innerHTML='<div class="right-empty"><h3>기자재를 선택하세요</h3><ol><li>QSC K8 한 조와 스탠드, 믹서, 프로젝터를 배치합니다.</li><li>평면 또는 입체에서 끌어 위치를 바꿉니다.</li><li>프로젝터의 투사 크기와 벽면 적합성을 확인합니다.</li></ol><p class="mini-note">배치는 자동 저장됩니다. 공연 실행 전에는 현장 치수와 전원·케이블 동선을 확인하세요.</p></div>';return;}
 const o=byId.get(it.type),speaker=it.type==='K8',projector=it.type==='PROJECTOR',mounted=speaker&&it.mode==='stand';
 const max=round(Math.max(.75,roofZ(it.y)-floorAt(meta,it.x,it.y)-o.dimensions_m.height-.2));
 const p=projector?projectionFor(it,meta.projectionWalls):null;
 const projectionNote=projector?`<div id="projection-info" class="projection-info"><strong>0.3:1 투사 미리보기 · 16:9</strong>${p?`<span>${esc(p.label)} · 렌즈–벽 ${p.distance.toFixed(2)} m</span><span>예상 화면 ${p.width.toFixed(2)} × ${p.height.toFixed(2)} m</span><span class="${p.valid?'ok':'warn'}">${p.valid?'벽면에 들어가는 배치입니다.':esc(p.reason)}</span>`:'<span class="warn">프로젝터 앞쪽에 투사 가능한 벽이 없습니다. 방향을 바꿔 주세요.</span>'}</div>`:'';
 el.innerHTML=`<div class="inspector"><div class="object-title"><h3>${esc(o.title)}</h3><span class="badge">${esc(o.id)}</span></div><p class="micro">${esc(o.note)}</p>${speaker?`<div class="rule"></div><span class="control-label">설치 방식</span><div class="mode-grid"><button data-mode="stand" aria-pressed="${mounted}">삼각 스탠드</button><button data-mode="floor" aria-pressed="${!mounted}">바닥 직접</button></div>`:''}<div class="rule"></div><div class="rotation-head"><span class="control-label">방향 (°)</span><button id="reset-rotation">초기화</button></div><div class="axis-row"><label for="rotation">수평 Z</label><input id="rotation-range" type="range" min="0" max="360" step="1" value="${round(it.rotation)}" aria-label="기자재 방향"><input id="rotation" type="number" min="0" max="360" step="1" value="${round(it.rotation)}" aria-label="기자재 방향 각도"></div><div class="rule"></div><div class="coord-grid"><div class="field"><label for="pos-x">좌우 X (m)</label><input id="pos-x" type="number" min="${bounds.min[0]}" max="${bounds.max[0]}" step="0.05" value="${round(it.x).toFixed(2)}"></div><div class="field"><label for="pos-y">앞뒤 Y (m)</label><input id="pos-y" type="number" min="${bounds.min[1]}" max="${bounds.max[1]}" step="0.05" value="${round(it.y).toFixed(2)}"></div>${mounted?`<div class="field full"><label for="height">스피커 하단 높이 (m)</label><input id="height" type="number" min="0.75" max="${max}" step="0.05" value="${it.height.toFixed(2)}"></div><div class="field full"><input id="height-range" class="range" type="range" min="0.75" max="${max}" step="0.01" value="${it.height.toFixed(2)}" aria-label="스피커 스탠드 높이"></div>`:''}</div>${projectionNote}<p id="collision-note" class="micro" style="color:#a15e3f" ${occupied(it)?'':'hidden'}>다른 기자재와 바닥 면적이 겹칩니다.</p><div class="row-actions"><button id="duplicate">복제</button><button id="remove" class="danger">배치에서 제거</button></div><p class="mini-note">${speaker?'K8 본체 0.28 × 0.269 × 0.45 m (QSC 사양). 스탠드 형상은 배치용 모형입니다.':projector?'렌즈 위치와 광학 오프셋은 기종마다 다릅니다. 표시 화면은 기하학적 예측입니다.':'믹서 기종 미지정 · 크기는 배치용 예시입니다.'}</p></div>`;
 for(const b of el.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{it.mode=b.dataset.mode;syncItem(it);});
 for(const [id,key] of [['pos-x','x'],['pos-y','y'],['height','height']])$('#'+id)?.addEventListener('change',e=>{it[key]=Number(e.target.value);syncItem(it);});
 $('#height-range')?.addEventListener('input',e=>{it.height=Number(e.target.value);normalize(it);drawItem(it);$('#height').value=it.height.toFixed(2);persist();});
 $('#height-range')?.addEventListener('change',()=>syncItem(it));
 const turn=value=>{it.rotation=Number(value);normalize(it);drawItem(it);$('#rotation').value=round(it.rotation);$('#rotation-range').value=round(it.rotation);$('#pos-x').value=it.x.toFixed(2);$('#pos-y').value=it.y.toFixed(2);persist();};
 $('#rotation').addEventListener('input',e=>{if(e.target.value!=='')turn(e.target.value);});
 $('#rotation').addEventListener('change',e=>{turn(e.target.value);syncItem(it);});
 $('#rotation-range').addEventListener('input',e=>turn(e.target.value));$('#rotation-range').addEventListener('change',()=>syncItem(it));
 $('#reset-rotation').addEventListener('click',()=>{it.rotation=0;syncItem(it);});
 $('#duplicate').addEventListener('click',()=>addItem(it.type,it));$('#remove').addEventListener('click',()=>removeItem(it.uid));
}

function moveSelected(it,x,y){it.x=x;it.y=y;normalize(it);drawItem(it);const ix=$('#pos-x'),iy=$('#pos-y');if(ix)ix.value=it.x.toFixed(2);if(iy)iy.value=it.y.toFixed(2);const warning=$('#collision-note');if(warning)warning.hidden=!occupied(it);}
const caster=new THREE.Raycaster(),mouse=new THREE.Vector2(),floorPlane=new THREE.Plane(new THREE.Vector3(0,0,1),0),hitPoint=new THREE.Vector3();
function pointer(e){const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);caster.setFromCamera(mouse,camera);}
function beginWalkPointer(e){if(e.button!==0||walkState.pointer)return;walkState.pointer={id:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);e.preventDefault();}
function moveWalkPointer(e){const state=walkState,p=state?.pointer;if(!p||e.pointerId!==p.id)return;const dx=e.clientX-p.lastX,dy=e.clientY-p.lastY;if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>4&&!state.peek?.dragging){cameraWalk.getWorldDirection(walkDirection);state.peek={dragging:true,yaw:Math.atan2(walkDirection.y,walkDirection.x),pitch:Math.atan2(walkDirection.z,Math.hypot(walkDirection.x,walkDirection.y)),quaternion:cameraWalk.quaternion.clone(),releasedAt:0};}if(state.peek?.dragging){state.peek.yaw-=dx*.004;state.peek.pitch=clamp(state.peek.pitch-dy*.0032,-1.2,1.2);setWalkDirection(state.peek.quaternion,state.peek.yaw,state.peek.pitch);cameraWalk.quaternion.copy(state.peek.quaternion);}p.lastX=e.clientX;p.lastY=e.clientY;e.preventDefault();}
function endWalkPointer(e){const state=walkState,p=state?.pointer;if(!p||e.pointerId!==p.id)return false;state.pointer=null;if(state.peek?.dragging){state.peek.dragging=false;state.peek.origin=state.peek.quaternion.clone();state.peek.releasedAt=performance.now();}return true;}
renderer.domElement.addEventListener('pointerdown',e=>{if(walkState){beginWalkPointer(e);return;}if(e.button!==0)return;pointer(e);const hit=caster.intersectObjects(items.map(i=>i.root),true)[0];if(!hit)return;let node=hit.object;while(node.parent&&node.parent!==objectGroup)node=node.parent;const it=items.find(x=>x.uid===node.userData.uid);if(!it)return;select(it.uid);if(caster.ray.intersectPlane(floorPlane,hitPoint)){drag={uid:it.uid,dx:it.x-hitPoint.x,dy:it.y-hitPoint.y,pointer:e.pointerId};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{if(walkState){moveWalkPointer(e);return;}if(!drag||e.pointerId!==drag.pointer)return;pointer(e);if(caster.ray.intersectPlane(floorPlane,hitPoint)){const it=items.find(x=>x.uid===drag.uid);if(it)moveSelected(it,hitPoint.x+drag.dx,hitPoint.y+drag.dy);}});
function stopDrag(){if(!drag)return;const uid=drag.uid;drag=null;controls.enabled=true;renderPlaced();persist();const it=items.find(x=>x.uid===uid);if(it)renderInspector();}
renderer.domElement.addEventListener('pointerup',e=>{if(!endWalkPointer(e))stopDrag();});renderer.domElement.addEventListener('pointercancel',e=>{if(!endWalkPointer(e))stopDrag();});renderer.domElement.addEventListener('lostpointercapture',e=>{if(!endWalkPointer(e))stopDrag();});
renderer.domElement.addEventListener('keydown',e=>{if(walkState)return;const it=selectedItem();if(!it)return;const step=e.shiftKey?.10:.05;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')it.x-=step;if(e.key==='ArrowRight')it.x+=step;if(e.key==='ArrowUp')it.y+=step;if(e.key==='ArrowDown')it.y-=step;syncItem(it);}});

function download(content,name,mime){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function validateLayout(data){
 if(!data||!Array.isArray(data.items)||data.items.length>100)throw Error('배치 파일 형식을 확인해 주세요.');
 const id=data.space_id??'nightshift';if(!Object.hasOwn(spaces,id))throw Error('지원하지 않는 공간입니다.');
 if(data.version!=null&&![2,3,4].includes(data.version))throw Error('지원하지 않는 배치 파일 버전입니다.');
 const validTypes=new Set((id==='spacehim'?input.equipment:input.objects).map(o=>o.id));
 for(const r of data.items){if(!r||!validTypes.has(r.type)||['x','y','height','rotation','tiltX','tiltY'].some(k=>r[k]!=null&&!Number.isFinite(Number(r[k]))))throw Error('배치 위치나 종류를 확인해 주세요.');}
 return id;
}
function loadItems(raw){if(walkState)stopWalk();if(!Array.isArray(raw)||raw.length>100)throw Error('배치 파일 형식을 확인해 주세요.');const fresh=[];for(const r of raw){if(!r||!byId.has(r.type))continue;const it=normalize({uid:'item-'+Date.now().toString(36)+'-'+(++sequence),type:r.type,mode:r.mode,x:Number(r.x),y:Number(r.y),height:Number(r.height),rotation:Number(r.rotation),tiltX:Number(r.tiltX??0),tiltY:Number(r.tiltY??0)});if(it)fresh.push(it);}for(const it of items){it.root.children[0]?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});objectGroup.remove(it.root);}items=fresh;for(const it of items)drawItem(it);updateProjections();selected=items[0]?.uid||null;updateSelectionBox();renderPlaced();renderInspector();persist();}
const demo=[['R01','hang',1.25,1.02,1.65,0],['R03','rod',2.70,1.08,1.15,0],['R05','plinth',4.45,1.25,.18,0],['R04','floor',1.24,3.22,0,0],['R07','hang',3.13,3.18,1.8,0]];
function restoreItems(){
 let stored=memoryLayouts.get(spaceId);try{stored??=JSON.parse(localStorage.getItem(storageKey())||(spaceId==='nightshift'?localStorage.getItem(LEGACY_STORAGE):null)||'null');}catch{}
 const gearDefault=[['K8','stand',3.5,8.6,1.25,180],['K8','stand',9,8.6,1.25,180],['MIXER','floor',10.2,6.3,0,180],['PROJECTOR','floor',6.25,9.4,0,0]];
 const fallback=(spaceId==='nightshift'?demo:isGear()?gearDefault:[]).map(([type,mode,x,y,height,rotation])=>({type,mode,x,y,height,rotation,tiltX:0,tiltY:0}));
 try{if(stored&&validateLayout({...stored,space_id:stored.space_id??spaceId})===spaceId)loadItems(stored.items);else loadItems(fallback);}catch{loadItems(fallback);}
}
function setSpace(id,{initial=false}={}){
 if(!Object.hasOwn(spaces,id))throw Error('지원하지 않는 공간입니다.');
 if(!initial&&id===spaceId)return;
 if(walkState)stopWalk(false);if(drag){const p=drag.pointer;stopDrag();if(renderer.domElement.hasPointerCapture(p))renderer.domElement.releasePointerCapture(p);}
 if(!initial)persist();
 for(const it of items){clearGroup(it.root.children[0]);objectGroup.remove(it.root);}items=[];selected=null;
 setRoomData(id);buildRoom();clearGroup(projectionGroup);$('#space-select').value=id;$('#search').value='';
 $('#space-note').textContent=isGear()?'도면·사진 기반 지하 모델 · 천고 2.64 m · 배치 자동 저장':id==='wess'?'도면 기반 · 층고 2.70 m 가정 · 공간별 배치 자동 저장':'사진 기반 공간 복원 · 공간별 배치 자동 저장';
 $('#library-eyebrow').textContent=isGear()?'PERFORMANCE GEAR / 4 UNITS':'OBJECT LIBRARY / 20';
 $('#library-title').textContent=isGear()?'기자재 선택':'사물 선택';
 $('#library-intro').textContent=isGear()?'K8 스피커 2대와 스탠드, 믹서, 단초점 프로젝터를 이동해 공연 배치를 검토하세요.':'사물을 추가한 뒤 공간 안에서 끌어 놓으세요.';
 $('#catalog-title').textContent=isGear()?'공연 기자재':'사물 20점';$('#search').placeholder=isGear()?'기자재 검색':'사물 검색';
 $('.left').dataset.gear=String(isGear());$('.left').setAttribute('aria-label',isGear()?'기자재 목록':'사물 목록');$('.right').setAttribute('aria-label',isGear()?'선택한 기자재 설정':'선택한 사물 설정');$('.stage').setAttribute('aria-label',isGear()?'기자재 배치 공간':'사물 배치 공간');
 $('#settings-eyebrow').textContent=isGear()?'GEAR SETTINGS':'OBJECT SETTINGS';$('#settings-title').textContent='배치 설정';
 $('#footer-help').textContent=isGear()?'위치, 방향, 스탠드 높이를 조정하세요. 투사 화면은 설계 검토용이며 실제 설치 전 현장 치수와 전원·케이블 동선을 확인하세요.':'위치와 거치 높이는 화면에서 바로 조정할 수 있습니다. 설치 전에는 실제 치수와 하중을 확인하세요.';
 document.title=`9FOREST Viewer · ${spaceName()} 공간`;
 setView('3d');restoreItems();renderCatalog();
}
function importLayout(data){const id=validateLayout(data);setSpace(id);loadItems(data.items);return serializeLayout();}
renderCatalog();$('#search').addEventListener('input',renderCatalog);
$('#space-select').addEventListener('change',e=>{setSpace(e.target.value);toast(`${spaceName()} 공간을 불러왔습니다`);});
$('#save-layout').addEventListener('click',()=>{download(JSON.stringify(serializeLayout(),null,2),`9forest_${spaceId}_layout.json`,'application/json');toast('배치 파일을 저장했습니다');});
$('#load-layout').addEventListener('click',()=>$('#layout-file').click());$('#layout-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{importLayout(JSON.parse(await file.text()));toast(`${spaceName()} 배치를 불러왔습니다`);}catch(err){toast(err.message||'배치 파일을 읽지 못했습니다');}e.target.value='';});
$('#clear-layout').addEventListener('click',()=>{loadItems([]);toast('배치를 비웠습니다');});
$('#export-png').addEventListener('click',()=>{renderer.render(scene,camera);const src=renderer.domElement,c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');const dark=document.documentElement.dataset.theme==='dark';ctx.fillStyle=dark?'#17211d':'#e7ece5';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(src,0,0);ctx.fillStyle=dark?'#e8eee7':'#273c32';ctx.font='600 17px sans-serif';ctx.fillText(`9FOREST · ${spaceName()} 공간 배치`,25,34);const url=c.toDataURL('image/png');$('#export-image').src=url;$('#export-download').href=url;$('#export-download').download=`9forest_${spaceId}_layout.png`;$('#export-modal').hidden=false;});
$('#close-modal').addEventListener('click',()=>$('#export-modal').hidden=true);$('#export-modal').addEventListener('click',e=>{if(e.target.id==='export-modal')e.target.hidden=true;});document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#export-modal').hidden=true;});
for(const b of $$('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));for(const id of ['roof','structure','equipment','walls'])$('#'+id).addEventListener('change',updateRoom);
$('#walk-start').addEventListener('click',startWalk);$('#walk-stop').addEventListener('click',()=>stopWalk());$('#walk-pause').addEventListener('click',()=>{if(!walkState||walkState.finished)return;walkState.paused=!walkState.paused;$('#walk-pause').textContent=walkState.paused?'계속':'일시정지';$('#walk-detail').textContent=walkState.paused?'일시정지 · 눈높이 165cm':'이동 중 · 눈높이 165cm';});
$('#zoom-in').addEventListener('click',()=>{if(camera.isOrthographicCamera){camera.zoom*=1.2;camera.updateProjectionMatrix();}else camera.position.sub(controls.target).multiplyScalar(.82).add(controls.target);controls.update();});
$('#zoom-out').addEventListener('click',()=>{if(camera.isOrthographicCamera){camera.zoom/=1.2;camera.updateProjectionMatrix();}else camera.position.sub(controls.target).multiplyScalar(1.2).add(controls.target);controls.update();});$('#reset-view').addEventListener('click',()=>setView('3d'));
let initialSpace='nightshift';try{const q=new URL(location.href).searchParams.get('space'),saved=localStorage.getItem('9forest_active_space_v1');initialSpace=Object.hasOwn(spaces,q)?q:Object.hasOwn(spaces,saved)?saved:initialSpace;}catch{}
setSpace(initialSpace,{initial:true});$('#status').hidden=true;
let lastFrame=performance.now();function animate(now){requestAnimationFrame(animate);const dt=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;if(walkState)advanceWalk(dt,now);else controls.update();renderer.render(scene,camera);}animate(lastFrame);
window.nineforestLayout=window.nightshiftLayout={state:()=>({spaceId,view,selected,walking:!!walkState,walkProgress:walkState?walkState.time/walkState.plan.total:null,walkPeek:walkState?.peek?(walkState.peek.dragging?'dragging':'returning'):null,walkForward:walkState?cameraWalk.getWorldDirection(new THREE.Vector3()).toArray():null,walkAutoForward:walkState?new THREE.Vector3(0,0,-1).applyQuaternion(walkState.autoQuaternion).toArray():null,items:items.map(({type,mode,x,y,height,rotation,tiltX,tiltY,root})=>({type,mode,x,y,height,rotation,tiltX,tiltY,floorZ:root.position.z})),roomMeshes:spaceMeshes.length,renderTriangles:renderer.info.render.triangles}),add:addItem,select:(uid)=>select(uid),setView,setSpace,startWalk,stopWalk,clear:()=>loadItems([]),exportLayout:serializeLayout,importLayout,projectSelected:()=>{const it=selectedItem();if(!it)return null;const v=new THREE.Box3().setFromObject(it.model).getCenter(new THREE.Vector3()).project(camera),r=renderer.domElement.getBoundingClientRect();return {x:r.left+(v.x*.5+.5)*r.width,y:r.top+(-v.y*.5+.5)*r.height};}};
