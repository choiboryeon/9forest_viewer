import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {gearModel} from '../src/gear.js';
const asset=JSON.parse(fs.readFileSync(new URL('../assets/equipment/qsc-k8/qsc-k8.json',import.meta.url)));
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('K8 uses the manufacturer envelope, base origin and full grille geometry',()=>{
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const m of asset.meshes){assert(m.vertices.every(Number.isFinite));assert(m.faces.every(i=>Number.isInteger(i)&&i>=0&&i<m.vertices.length/3));for(let i=0;i<m.vertices.length;i++){const j=i%3;lo[j]=Math.min(lo[j],m.vertices[i]);hi[j]=Math.max(hi[j],m.vertices[i]);}}
 near(hi[0]-lo[0],.28);near(hi[1]-lo[1],.269);near(hi[2]-lo[2],.45);near(lo[2],0);
 for(const name of ['K8_Moulded_trapezoid_cabinet','K8_Curved_perforated_full_front_grille','K8_Recessed_handle_grip','K8_Recessed_rear_amplifier_plate','K8_35mm_pole_socket'])assert(asset.meshes.some(m=>m.name===name));
});
test('GLB exchange model has the same envelope and no studio floor',async()=>{
 const bytes=fs.readFileSync(new URL('../assets/equipment/qsc-k8/qsc-k8.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());
 near(size.x,.28);near(size.y,.45);near(size.z,.269);near(box.min.y,0);
});
test('Other performance equipment also rests at Z=0 within its declared envelope',()=>{
 for(const [type,width,depth,height] of [['MIXER',.46,.34,.12],['PROJECTOR',.42,.32,.16]]){
  const box=new THREE.Box3().setFromObject(gearModel(type)),s=box.getSize(new THREE.Vector3());
  near(box.min.z,0);near(s.x,width);near(s.y,depth);near(s.z,height);
 }
});
