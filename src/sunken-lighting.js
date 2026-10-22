import * as THREE from 'three';

// Sunken (nineforests v5): skylight daylight from the east-south-east plus the
// warm profile spots on the 5.7 m rigging grid. Values are a viewing preview,
// not the Cycles render or an illuminance calculation.
const WORK_SPOTS=[[1.6,-1.6],[4,-1.6],[6.4,-1.6],[1.6,-3.6],[4,-3.6],[6.4,-3.6]];
export class SunkenLighting{
 constructor(scene){
  this.group=new THREE.Group();this.group.visible=false;scene.add(this.group);
  const sun=new THREE.DirectionalLight(0xfff1df,1.7);sun.position.set(14,-8,16);sun.target.position.set(4,-2.5,0);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-11,right:11,top:11,bottom:-11,near:1,far:40});sun.shadow.normalBias=.02;sun.shadow.radius=4;sun.shadow.intensity=.55;sun.shadow.camera.updateProjectionMatrix();
  const sky=new THREE.HemisphereLight(0xdfe9ef,0x8a8279,.85);sky.position.set(4,-2.5,10);
  this.spots=WORK_SPOTS.map(([x,y],i)=>{const s=new THREE.SpotLight(0xffd8ad,26,11,Math.PI/5.2,.75,1.3);s.position.set(x,y,5.35);s.target.position.set(x,y,0);s.castShadow=i===1||i===4;if(s.castShadow){s.shadow.mapSize.set(1024,1024);s.shadow.camera.near=.3;s.shadow.camera.far=8;s.shadow.normalBias=.015;s.shadow.radius=4;s.shadow.intensity=.4;}return s;});
  const stage=new THREE.SpotLight(0xffd8ad,18,10,Math.PI/6,.7,1.3);stage.position.set(10,-6.3,5.3);stage.target.position.set(9.6,-6.6,.9);
  this.group.add(sun,sun.target,sky,stage,stage.target,...this.spots.flatMap(s=>[s,s.target]));
 }
 setActive(active){this.group.visible=active;}
}
