const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
// Small renders keep the path-traced check quick; the UI only lists real sizes.
async function tinyRender(p,size,samples){
 await p.evaluate(([size,samples])=>{for(const [id,v] of [['#render-size',size],['#render-quality',samples]]){const s=document.querySelector(id);s.add(new Option(String(v),String(v)));s.value=String(v);}},[size,samples]);
 await p.locator('#render-start').click();await p.locator('#render-download').waitFor({state:'visible',timeout:240000});
 return p.evaluate(async()=>{const blob=await fetch(document.querySelector('#render-download').href).then(r=>r.blob()),img=await createImageBitmap(blob),c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let s=0,q=0,n=d.length/4;for(let i=0;i<d.length;i+=4){const l=(d[i]+d[i+1]+d[i+2])/3;s+=l;q+=l*l;}const mean=s/n;return {width:img.width,height:img.height,mean,std:Math.sqrt(q/n-mean*mean),name:document.querySelector('#render-download').download,status:document.querySelector('#render-count').textContent};});
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})}),page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  const url=process.env.VIEWER_URL||'http://127.0.0.1:4186/9forest_viewer.html';
  await page.goto(url+'?space=nightshift');await page.waitForFunction(()=>window.nineforestLayout?.state().renderTriangles>0);
  await page.evaluate(()=>{const L=nineforestLayout;L.clear();for(const t of ['R02','R05','R10'])L.add(t);});
  await page.locator('#render-open').click();
  assert.equal(await page.locator('#render-panel').isVisible(),true);assert.equal(await page.locator('#frame-guide').isVisible(),true);assert.equal(await page.locator('#inspector').isVisible(),false,'the render panel takes over the settings column');
  await page.locator('#shot-suggest').click();await frames(page);
  const shots=await page.evaluate(()=>nineforestLayout.shots());
  assert.equal(shots.length,4);assert.equal(await page.locator('.shot-card img[src^="data:image/jpeg"]').count(),4,'every cut has a thumbnail');
  for(const s of shots){assert.equal(s.visible,s.total,`${s.label} shows all objects`);assert(s.target[2]<s.position[2]);}
  assert(new Set(shots.map(s=>s.kind)).size>=2,'cuts vary in camera height');
  await page.locator('[data-shot="1"]').click();await frames(page);
  const camera=await page.evaluate(()=>nineforestLayout.state());assert.equal(camera.view,'3d');
  assert.match(await page.locator('#stage-title').textContent(),/렌더 컷 2/);assert.equal(await page.locator('#roof').isChecked(),true,'interior cuts show the ceiling');
  const still=await tinyRender(page,360,6);
  assert.equal(still.width,360);assert.equal(still.height,240);assert(still.mean>25&&still.mean<235,`render is exposed: ${still.mean.toFixed(1)}`);assert(still.std>8,`render has detail: ${still.std.toFixed(1)}`);assert.match(still.name,/9forest_nightshift_render_cut2_360x240\.png/);
  await page.locator('#render-modal-close').click();
  await page.locator('#render-aspect').selectOption('0.8');await frames(page);
  const guide=await page.locator('#frame-guide').boundingBox();assert(Math.abs(guide.width/guide.height-.8)<.02,'the frame guide follows the crop');
  await page.locator('#render-close').click();assert.equal(await page.locator('#inspector').isVisible(),true);assert.equal(await page.locator('#frame-guide').isVisible(),false);
  await page.locator('#space-select').selectOption('sunken');await page.waitForFunction(()=>nineforestLayout.state().spaceId==='sunken');
  await page.evaluate(()=>{const L=nineforestLayout;L.clear();L.addDuct();L.add('R04');});
  await page.locator('#render-open').click();await page.locator('#shot-suggest').click();
  const sunken=await page.evaluate(()=>nineforestLayout.shots());assert(sunken.length>=3);assert.equal(sunken[0].total,3,'duct, object and live station are framed');
  await page.evaluate(()=>{nineforestLayout.clear();nineforestLayout.setStation({enabled:false});});await page.locator('#shot-suggest').click();
  assert.equal(await page.locator('.shot-card').count(),0);assert.match(await page.locator('#shot-note').textContent(),/먼저/);
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/render-cut-panel.png')});
  assert.deepEqual(errors,[]);console.log(`PASS render cuts: ${shots.map(s=>s.label).join(', ')}; still ${still.mean.toFixed(1)}±${still.std.toFixed(1)} (${still.status})`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
