import * as THREE from 'three';

export function gearModel(type){
 const root=new THREE.Group();
 const black=new THREE.MeshStandardMaterial({color:'#161b1d',roughness:.72});
 const cabinet=new THREE.MeshStandardMaterial({color:'#2d3438',roughness:.7});
 const grille=new THREE.MeshStandardMaterial({color:'#121719',metalness:.38,roughness:.65});
 const silver=new THREE.MeshStandardMaterial({color:'#96a6ac',metalness:.66,roughness:.35});
 const blue=new THREE.MeshStandardMaterial({color:'#8cbecc',emissive:'#194454',emissiveIntensity:.45});
 const put=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
 // K8 meshes are the evaluated Blender asset, embedded by tools/build.mjs.
 if(type==='MIXER'){
  put(new THREE.BoxGeometry(.46,.34,.10),cabinet,0,0,0);
  put(new THREE.BoxGeometry(.435,.315,.008),black,0,0,.055);
  for(let row=0;row<2;row++)for(let col=0;col<8;col++){
   const knob=put(new THREE.CylinderGeometry(.009,.009,.012,12),row?silver:blue,-.18+col*.05,-.08+row*.075,.064);knob.rotation.x=Math.PI/2;
  }
  for(let i=0;i<8;i++)put(new THREE.BoxGeometry(.01,.035,.006),silver,-.18+i*.05,.11,.064);
  for(const mesh of root.children)mesh.position.z+=.05;
 }else if(type==='PROJECTOR'){
  put(new THREE.BoxGeometry(.42,.29,.14),cabinet,0,-.015,.08);
  put(new THREE.BoxGeometry(.37,.18,.008),black,0,.015,.156);
  put(new THREE.CylinderGeometry(.037,.037,.022,32),silver,0,.14,.08);
  put(new THREE.CylinderGeometry(.025,.025,.003,32),blue,0,.1585,.08);
  for(const x of [-.15,.15])for(const y of [-.11,.11])put(new THREE.BoxGeometry(.035,.035,.01),black,x,y,.005);
 }
 return root;
}
