import * as THREE from 'three';

// Plain table at any size: top 25 mm thick on four 40 mm square legs, inset 30 mm.
// Origin at the floor centre; the top surface is at height h.
export function tableModel(w,d,h){
 const root=new THREE.Group();
 const top=new THREE.MeshStandardMaterial({color:'#e6e2d8',roughness:.62}),frame=new THREE.MeshStandardMaterial({color:'#2b3033',metalness:.45,roughness:.5});
 const put=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
 const t=.025,leg=.04,inset=.03,lh=h-t;
 put(new THREE.BoxGeometry(w,d,t),top,0,0,h-t/2);
 for(const sx of [-1,1])for(const sy of [-1,1])put(new THREE.BoxGeometry(leg,leg,lh),frame,sx*(w/2-inset-leg/2),sy*(d/2-inset-leg/2),lh/2);
 // A shallow apron under the top keeps larger tables from looking like a slab on stilts.
 if(w>.8){for(const sy of [-1,1])put(new THREE.BoxGeometry(w-2*inset-2*leg,.02,.07),frame,0,sy*(d/2-inset-leg/2),h-t-.035);}
 return root;
}

export function gearModel(type){
 const root=new THREE.Group();
 const black=new THREE.MeshStandardMaterial({color:'#161b1d',roughness:.72});
 const cabinet=new THREE.MeshStandardMaterial({color:'#2d3438',roughness:.7});
 const grille=new THREE.MeshStandardMaterial({color:'#121719',metalness:.38,roughness:.65});
 const silver=new THREE.MeshStandardMaterial({color:'#96a6ac',metalness:.66,roughness:.35});
 const blue=new THREE.MeshStandardMaterial({color:'#8cbecc',emissive:'#194454',emissiveIntensity:.45});
 const put=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
 // Open laptop on a 740 mm desk top: keyboard base toward local -Y (the user),
 // screen hinged at the back and tilted ~105°. It is the desk's only display.
 const laptop=(x,y)=>{put(new THREE.BoxGeometry(.34,.24,.018),silver,x,y,.749);put(new THREE.BoxGeometry(.3,.12,.002),black,x,y-.03,.759);
  const lid=new THREE.Group();lid.position.set(x,y+.12,.758);lid.rotation.x=-.26;root.add(lid);
  for(const [geo,mat,z] of [[new THREE.BoxGeometry(.34,.012,.22),silver,.11],[new THREE.BoxGeometry(.31,.002,.19),blue,.11]]){const m=new THREE.Mesh(geo,mat);m.position.set(0,mat===blue?-.007:0,z);m.castShadow=true;m.receiveShadow=true;lid.add(m);}};
 // K8 meshes are the evaluated Blender asset, embedded by tools/build.mjs.
 if(type==='MIXER'){
  put(new THREE.BoxGeometry(.46,.34,.10),cabinet,0,0,0);
  put(new THREE.BoxGeometry(.435,.315,.008),black,0,0,.055);
  for(let row=0;row<2;row++)for(let col=0;col<8;col++){
   const knob=put(new THREE.CylinderGeometry(.009,.009,.012,12),row?silver:blue,-.18+col*.05,-.08+row*.075,.064);knob.rotation.x=Math.PI/2;
  }
  for(let i=0;i<8;i++)put(new THREE.BoxGeometry(.01,.035,.006),silver,-.18+i*.05,.11,.064);
  for(const mesh of root.children)mesh.position.z+=.05;
 }else if(type==='DESK'){
  // 1400 × 700 desk, 25 mm top at 715–740 mm; the user side is local -Y.
  const top=new THREE.MeshStandardMaterial({color:'#e6e2d8',roughness:.62}),frame=new THREE.MeshStandardMaterial({color:'#2b3033',metalness:.45,roughness:.5});
  put(new THREE.BoxGeometry(1.4,.7,.025),top,0,0,.7275);
  for(const x of [-.66,.66])for(const y of [-.3,.3])put(new THREE.BoxGeometry(.04,.04,.715),frame,x,y,.3575);
  put(new THREE.BoxGeometry(1.28,.02,.08),frame,0,.31,.66);
  for(const x of [-.66,.66])put(new THREE.BoxGeometry(.03,.56,.05),frame,x,0,.665);
  // Presentation laptop (its sound out runs to the console, video to the projector).
  laptop(.25,-.05);
 }else if(type==='STREAM_DESK'){
  // 1200 × 600 desk (operator on local -Y): the streaming laptop on the left half;
  // the right half (local x 0.03–0.63) is left free for the audio console.
  const top=new THREE.MeshStandardMaterial({color:'#e6e2d8',roughness:.62}),frame=new THREE.MeshStandardMaterial({color:'#2b3033',metalness:.45,roughness:.5});
  put(new THREE.BoxGeometry(1.2,.6,.025),top,0,0,.7275);
  for(const x of [-.56,.56])for(const y of [-.25,.25])put(new THREE.BoxGeometry(.04,.04,.715),frame,x,y,.3575);
  laptop(-.28,0);
 }else if(type==='CAMERA'){
  // Tripod (three legs, centre column) and a camcorder whose lens points local +Y.
  const legs=new THREE.MeshStandardMaterial({color:'#20262a',metalness:.5,roughness:.45});
  const head=new THREE.Vector3(0,0,1.32);
  for(const a of [Math.PI/2,Math.PI/2+2*Math.PI/3,Math.PI/2+4*Math.PI/3]){const foot=new THREE.Vector3(Math.cos(a)*.3,Math.sin(a)*.3,.01),dir=head.clone().sub(foot),leg=put(new THREE.CylinderGeometry(.011,.014,dir.length(),10),legs,(foot.x+head.x)/2,(foot.y+head.y)/2,(foot.z+head.z)/2);leg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());}
  put(new THREE.CylinderGeometry(.03,.03,.1,16),legs,0,0,1.37).rotation.x=Math.PI/2;
  put(new THREE.BoxGeometry(.12,.28,.14),cabinet,0,.02,1.5);
  put(new THREE.CylinderGeometry(.04,.045,.1,24),black,0,.2,1.5);put(new THREE.CylinderGeometry(.036,.036,.004,24),blue,0,.252,1.5);
  put(new THREE.BoxGeometry(.012,.08,.06),black,.07,-.02,1.52);
  const handle=put(new THREE.CylinderGeometry(.008,.008,.38,8),legs,.12,-.28,1.33);handle.rotation.x=-.9;
 }else if(type==='FOLDING'){
  // Backless round stool: Ø360 mm seat at 450 mm on four splayed legs with a foot ring.
  const seat=new THREE.MeshStandardMaterial({color:'#6d7478',roughness:.72}),steel=new THREE.MeshStandardMaterial({color:'#c3c8ca',metalness:.6,roughness:.38});
  put(new THREE.CylinderGeometry(.18,.17,.035,32),seat,0,0,.4325).rotation.x=Math.PI/2;
  for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2,top=new THREE.Vector3(Math.cos(a)*.11,Math.sin(a)*.11,.415),foot=new THREE.Vector3(Math.cos(a)*.17,Math.sin(a)*.17,.005),d=top.clone().sub(foot);put(new THREE.CylinderGeometry(.011,.011,d.length(),8),steel,(top.x+foot.x)/2,(top.y+foot.y)/2,(top.z+foot.z)/2).quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
  put(new THREE.TorusGeometry(.148,.006,6,32),steel,0,0,.16);
 }else if(type==='GUITAR'){
  // Simple black electric guitar leaning back ~14° on a slim A-frame stand.
  // The face (and output jack, lower right) points local +Y, towards the audience.
  const gloss=new THREE.MeshStandardMaterial({color:'#0d0f10',roughness:.28,metalness:.1}),matte=new THREE.MeshStandardMaterial({color:'#1a1c1e',roughness:.7}),hw=new THREE.MeshStandardMaterial({color:'#5c6266',metalness:.7,roughness:.35});
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(.2,0,.19,.17,.13,.22);shape.bezierCurveTo(.11,.25,.15,.33,.11,.38);shape.bezierCurveTo(.07,.43,.02,.4,0,.37);shape.bezierCurveTo(-.02,.4,-.09,.44,-.12,.37);shape.bezierCurveTo(-.15,.32,-.11,.25,-.13,.22);shape.bezierCurveTo(-.19,.17,-.2,0,0,0);
  const guitar=new THREE.Group();guitar.position.set(0,.06,.1);guitar.rotation.x=.24;root.add(guitar);
  const add=(geo,mat,x,y,z,rx=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.x=rx;m.castShadow=true;m.receiveShadow=true;guitar.add(m);return m;};
  add(new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2,curveSegments:24}).rotateX(Math.PI/2).translate(0,.0225,0),gloss,0,0,0);
  add(new THREE.BoxGeometry(.05,.025,.46),matte,0,.006,.6);
  const head=add(new THREE.BoxGeometry(.075,.018,.17),gloss,0,-.004,.91,.12);
  for(const z of [.11,.17,.24])add(new THREE.BoxGeometry(.075,.012,.024),hw,0,.03,z);
  add(new THREE.CylinderGeometry(.011,.011,.02,12),hw,.11,.03,.06).rotation.x=Math.PI/2;
  // Stand: two splayed front feet with a padded cradle, a back leg and neck yoke.
  const rod=new THREE.MeshStandardMaterial({color:'#2a2d30',metalness:.55,roughness:.45}),rodTo=(a,b,r=.008)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);put(new THREE.CylinderGeometry(r,r,d.length(),8),rod,(A.x+B.x)/2,(A.y+B.y)/2,(A.z+B.z)/2).quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());};
  rodTo([-.14,.16,.01],[0,-.1,.6]);rodTo([.14,.16,.01],[0,-.1,.6]);rodTo([0,-.3,.01],[0,-.1,.6]);
  rodTo([-.12,.09,.1],[.12,.09,.1],.012);rodTo([0,-.1,.6],[0,-.17,.86]);rodTo([-.03,-.18,.86],[.03,-.18,.86],.01);
 }else if(type==='PROJECTOR'){
  put(new THREE.BoxGeometry(.42,.29,.14),cabinet,0,-.015,.08);
  put(new THREE.BoxGeometry(.37,.18,.008),black,0,.015,.156);
  put(new THREE.CylinderGeometry(.037,.037,.022,32),silver,0,.14,.08);
  put(new THREE.CylinderGeometry(.025,.025,.003,32),blue,0,.1585,.08);
  for(const x of [-.15,.15])for(const y of [-.11,.11])put(new THREE.BoxGeometry(.035,.035,.01),black,x,y,.005);
 }
 return root;
}
