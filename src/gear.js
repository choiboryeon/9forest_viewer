import * as THREE from 'three';

export function gearModel(type){
 const root=new THREE.Group();
 const black=new THREE.MeshStandardMaterial({color:'#161b1d',roughness:.72});
 const cabinet=new THREE.MeshStandardMaterial({color:'#2d3438',roughness:.7});
 const grille=new THREE.MeshStandardMaterial({color:'#121719',metalness:.38,roughness:.65});
 const silver=new THREE.MeshStandardMaterial({color:'#96a6ac',metalness:.66,roughness:.35});
 const blue=new THREE.MeshStandardMaterial({color:'#8cbecc',emissive:'#194454',emissiveIntensity:.45});
 const put=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
 if(type==='K8'){
  put(new THREE.BoxGeometry(.28,.269,.45),cabinet,0,0,0);
  put(new THREE.BoxGeometry(.258,.012,.405),grille,0,.139,0);
  const ring=put(new THREE.TorusGeometry(.075,.008,8,40),silver,0,.148,-.065);ring.rotation.x=Math.PI/2;
  const cone=put(new THREE.CylinderGeometry(.058,.058,.004,32),black,0,.151,-.065);cone.rotation.x=Math.PI/2;
  const tweeter=put(new THREE.SphereGeometry(.025,16,12),silver,0,.151,.13);tweeter.scale.y=.2;
  put(new THREE.BoxGeometry(.09,.014,.016),blue,0,.151,-.181);
 }else if(type==='MIXER'){
  put(new THREE.BoxGeometry(.46,.34,.10),cabinet,0,0,0);
  put(new THREE.BoxGeometry(.435,.315,.008),black,0,0,.055);
  for(let row=0;row<2;row++)for(let col=0;col<8;col++){
   const knob=put(new THREE.CylinderGeometry(.009,.009,.012,12),row?silver:blue,-.18+col*.05,-.08+row*.075,.064);knob.rotation.x=Math.PI/2;
  }
  for(let i=0;i<8;i++)put(new THREE.BoxGeometry(.01,.035,.006),silver,-.18+i*.05,.11,.064);
 }else if(type==='PROJECTOR'){
  put(new THREE.BoxGeometry(.42,.32,.15),cabinet,0,0,0);
  put(new THREE.BoxGeometry(.37,.18,.009),black,0,.045,.08);
  const lens=put(new THREE.CylinderGeometry(.037,.037,.022,32),silver,0,.165,.015);lens.rotation.x=Math.PI/2;
  const glass=put(new THREE.CylinderGeometry(.025,.025,.003,32),blue,0,.18,.015);glass.rotation.x=Math.PI/2;
  for(const x of [-.15,.15])for(const y of [-.11,.11])put(new THREE.BoxGeometry(.035,.035,.008),black,x,y,-.079);
 }
 return root;
}
