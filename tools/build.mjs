import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
const spaces={nightshift:read('nightshift-room.json'),wess:read('wess-room.json'),spacehim:read('spacehim-room.json'),sunken:read('sunken-room.json')};
const oidnWeights=fs.readFileSync(path.join(root,'assets/oidn/rt_ldr.tza')).toString('base64');
const objects=read('objects.json'),equipment=read('equipment.json');
const k8=JSON.parse(fs.readFileSync(path.join(root,'assets/equipment/qsc-k8/qsc-k8.json'),'utf8'));
Object.assign(equipment.find(o=>o.id==='K8'),{meshes:k8.meshes,source:k8.source});
const {outputFiles}=await build({entryPoints:[path.join(root,'src/app.js')],bundle:true,minify:true,write:false,format:'iife',target:'es2020',legalComments:'inline'});
const html=fs.readFileSync(path.join(root,'src/template.html'),'utf8')
 .replace('__LAYOUT_DATA__',()=>JSON.stringify({spaces,objects,equipment}).replace(/</g,'\\u003c'))
 .replace('__OIDN_WEIGHTS__',()=>oidnWeights)
 .replace('__VIEWER_BUNDLE__',()=>outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
fs.writeFileSync(path.join(root,'9forest_viewer.html'),html);
console.log(`Built 9FOREST: ${Object.keys(spaces).length} spaces, ${objects.length} objects, ${equipment.length} gear types (${html.length} characters).`);
