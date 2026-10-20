import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
const spaces={nightshift:read('nightshift-room.json'),wess:read('wess-room.json')};
const objects=read('objects.json');
const {outputFiles}=await build({entryPoints:[path.join(root,'src/app.js')],bundle:true,minify:true,write:false,format:'iife',target:'es2020',legalComments:'inline'});
const html=fs.readFileSync(path.join(root,'src/template.html'),'utf8')
 .replace('__LAYOUT_DATA__',()=>JSON.stringify({spaces,objects}).replace(/</g,'\\u003c'))
 .replace('__VIEWER_BUNDLE__',()=>outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
fs.writeFileSync(path.join(root,'9forest_viewer.html'),html);
console.log(`Built 9FOREST: ${Object.keys(spaces).length} spaces, ${objects.length} objects (${html.length} characters).`);
