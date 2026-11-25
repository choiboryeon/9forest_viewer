import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {artworkLayout,clampCenter,partsOf} from '../src/artworks.js';

const [def]=JSON.parse(fs.readFileSync(new URL('../data/artworks.json',import.meta.url),'utf8'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('박지수 artwork keeps the measured sizes (cm → m)',()=>{
 const top=def.parts.find(p=>p.id==='top'),bottom=def.parts.find(p=>p.id==='bottom');
 assert.deepEqual([top.width_m,top.height_m],[1.145,.87]);
 assert.deepEqual([bottom.width_m,bottom.height_m],[1.183,.5]);
 for(const p of def.parts)assert.ok(fs.existsSync(new URL('../'+p.image,import.meta.url)),p.image);
});

test('stacked layout is centred on the hanging line with the gap between panels',()=>{
 const l=artworkLayout(def,{arrange:'both',center:1.45,gap:.14});
 near(l.total,.87+.14+.5);near(l.bottom,1.45-l.total/2);near(l.top,1.45+l.total/2);
 const [top,bottom]=l.panels;assert.equal(top.id,'top');
 near(top.z+top.height_m/2,l.top);near(bottom.z-bottom.height_m/2,l.bottom);
 near((top.z-top.height_m/2)-(bottom.z+bottom.height_m/2),.14);
 near(l.width,1.183);
});

test('single panels ignore the gap and the centre stays inside floor–ceiling',()=>{
 const only=artworkLayout(def,{arrange:'bottom',center:1.2,gap:.3});
 assert.equal(only.panels.length,1);near(only.total,.5);
 assert.deepEqual(partsOf(def,{arrange:'top'}).map(p=>p.id),['top']);
 const art={arrange:'both',center:2.6,gap:.14};
 near(clampCenter(def,art,2.7),2.7-artworkLayout(def,art).total/2-.05);
 near(clampCenter(def,{...art,center:.1},2.7),artworkLayout(def,art).total/2+.05);
});
