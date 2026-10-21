const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const lights=p=>p.evaluate(()=>window.nineforestLayout.lighting());
const pose=p=>p.evaluate(()=>window.nineforestLayout.cameraPose());
const diff=(a,b)=>Math.max(...['position','quaternion','target'].flatMap(k=>a[k].map((v,i)=>Math.abs(v-b[k][i]))));
const range=async(p,id,value)=>{await p.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await frames(p);};
async function brightness(p){await frames(p);return p.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=100;const ctx=c.getContext('2d');ctx.drawImage(document.querySelector('#scene'),0,0,120,100);const pixels=ctx.getImageData(0,0,120,100).data;let sum=0,n=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>200){sum+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;n++;}return sum/n;});}
async function floorPixel(p,world){await frames(p);return p.evaluate(world=>{const v=window.nineforestLayout.projectWorld(world),src=document.querySelector('#scene'),rect=src.getBoundingClientRect(),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');ctx.drawImage(src,0,0);const data=ctx.getImageData(Math.round((v.x-rect.left)*src.width/rect.width)-2,Math.round((v.y-rect.top)*src.height/rect.height)-2,5,5).data;let r=0;for(let i=0;i<data.length;i+=4)r+=data[i]/25;return r;},world);}

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:4186/9forest_viewer.html')+'?space=spacehim');
  await page.waitForFunction(()=>window.nineforestLayout?.state().renderTriangles>0);
  for(const id of ['nightshift','wess','spacehim']){
   await page.locator('#space-select').selectOption(id);await page.locator('[data-view="3d"]').click();await frames(page);
   const c=await page.locator('#scene').boundingBox(),x=c.x+c.width*.65,y=c.y+c.height*.2;
   for(const button of ['left','right']){
    const start=await pose(page);await page.mouse.move(x,y);await page.mouse.down({button});await page.mouse.move(x+65,y+20,{steps:6});await page.mouse.up({button});
    await frames(page);const released=await pose(page);assert(diff(start,released)>.001,`${id} ${button} input changes camera`);
    await page.waitForTimeout(300);assert(diff(released,await pose(page))<1e-9,`${id} ${button} navigation stops at release`);
   }
  }
  console.log('PASS Rotation and pan stop exactly after release in all three spaces');
  await page.locator('[data-view="3d"]').click();await page.locator('#lighting-open').click();
  let l=await lights(page);assert.equal(l.fixtures.length,12);assert.equal(l.simulation,true);
  assert(l.fixtures.every(x=>x.kelvin===6500&&x.feather===60));
  for(const id of ['lamp-yaw-number','lamp-tilt-number','lamp-beam-number','lamp-feather-number']){const box=await page.locator('#'+id).boundingBox();assert(box.y>=0&&box.y+box.height<=1000,'Angle controls are visible near the top of the panel');}
  await page.locator('[data-light-preset="exhibition"]').click();const on=await brightness(page);
  await fs.mkdir(path.resolve(__dirname,'../test-results/browser'),{recursive:true});
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/track-lighting-on.png')});
  await page.locator('[data-light-preset="blackout"]').click();const off=await brightness(page);
  assert((await lights(page)).lamps.every(x=>x.intensity===0));assert(on>off+10,`Lights change actual rendered surfaces: ${on} vs ${off}`);
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/track-lighting-blackout.png')});
  await page.locator('#lighting-simulation').uncheck();const work=await brightness(page);assert(work>off+10&&work<200,'Work lighting reveals the room without changing the lamp blackout');
  assert((await lights(page)).lamps.every(x=>x.intensity===0));
  await page.locator('#lighting-simulation').check();assert((await brightness(page))<off+1,'Simulation removes work lighting again');
  await page.locator('[data-light-preset="exhibition"]').click();
  assert(await page.locator('#lamp-add').isDisabled());await page.locator('#lamp-remove').click();assert.equal((await lights(page)).fixtures.length,11);
  await page.locator('#lamp-add').click();assert.equal((await lights(page)).fixtures.length,12);assert(await page.locator('#lamp-add').isDisabled());
  await page.locator('#lighting-reset').click();assert.deepEqual((await lights(page)).fixtures,l.fixtures);
  await page.locator('#lamp-beam-number').fill('');await page.locator('#lamp-beam-number').pressSequentially('50');await page.locator('#lamp-beam-number').press('Tab');assert.equal(await page.locator('#lamp-beam-number').inputValue(),'50','Typing a beam angle is not clamped after its first digit');
  for(const [id,value] of [['lamp-yaw',123],['lamp-tilt',50],['lamp-beam',42],['lamp-feather',82]]){await page.locator('#'+id+'-number').fill(String(value));await page.locator('#'+id+'-number').press('Tab');assert.equal(await page.locator('#'+id).inputValue(),String(value));}
  l=await lights(page);let actual=l.lamps.find(x=>x.id===l.selected);assert(Math.abs(actual.beam-42)<1e-9);assert.equal(actual.feather,82);assert(Math.abs(actual.direction[2]+Math.cos(50*Math.PI/180))<1e-9);
  await page.locator('#lighting-feather-all').click();assert((await lights(page)).fixtures.every(x=>x.feather===82));
  await range(page,'lighting-master',47);await range(page,'lamp-dimmer',54);await range(page,'lamp-lumens',1700);
  await range(page,'lamp-beam',48);await range(page,'lamp-yaw',75);await range(page,'lamp-tilt',35);await range(page,'lamp-position',35);
  await page.locator('#lamp-kelvin').selectOption('5000');await page.locator('#lamp-rail').selectOption('upper-left');
  l=await lights(page);const selected=l.fixtures.find(x=>x.id===l.selected);
  assert.equal(l.master,47);assert.equal(selected.dimmer,54);assert.equal(selected.lumens,1700);assert.equal(selected.beam,48);assert.equal(selected.kelvin,5000);assert.equal(selected.yaw,75);assert.equal(selected.tilt,35);assert.equal(selected.rail,'upper-left');
  await page.locator('#lighting-cool-all').click();assert((await lights(page)).fixtures.every(x=>x.kelvin===6500));
  await page.locator('#lamp-enabled').uncheck();assert.equal((await lights(page)).lamps.find(x=>x.id===l.selected).intensity,0);
  await page.locator('#lamp-enabled').check();
  await page.locator('[data-view="top"]').click();await frames(page);
  const point=await page.evaluate(id=>window.nineforestLayout.projectLamp(id),l.selected),before=(await lights(page)).fixtures.find(x=>x.id===l.selected).t;
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x,point.y+35,{steps:6});await page.mouse.up();
  l=await lights(page);assert(Math.abs(l.fixtures.find(x=>x.id===l.selected).t-before)>.02,'Lamp drag moves along its rail');
  const lit=l.lamps.find(x=>x.id===l.selected).intensity;await page.locator('#lighting-fixtures').uncheck();assert.equal((await lights(page)).lamps.find(x=>x.id===l.selected).intensity,lit,'Fixture visibility does not switch off the light');
  const saved=await page.evaluate(()=>window.nineforestLayout.exportLayout());assert.equal(saved.version,7);assert.equal(saved.lighting.master,47);
  await page.locator('#space-select').selectOption('wess');assert.equal((await lights(page)).active,false);
  await page.locator('#space-select').selectOption('spacehim');assert.deepEqual((await lights(page)).fixtures,saved.lighting.fixtures);
  await page.reload();await page.waitForFunction(()=>window.nineforestLayout?.state().renderTriangles>0);assert.equal((await lights(page)).master,47);
  await page.evaluate(data=>window.nineforestLayout.importLayout(data),saved);assert.deepEqual((await lights(page)).fixtures,saved.lighting.fixtures);
  const rejected=await page.evaluate(()=>{const a=window.nineforestLayout.exportLayout();a.lighting.fixtures[0].rail='missing';try{window.nineforestLayout.importLayout(a);return false;}catch{return true;}});assert(rejected);assert.equal((await lights(page)).master,47);
  await page.locator('#lighting-open').click();await page.locator('#lighting-fixtures').check();await page.locator('[data-view="3d"]').click();await page.locator('[data-light-preset="performance"]').click();
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/track-lighting-performance.png')});
  // Compare the actual floor at the same point with a hard and a feathered cone.
  await page.evaluate(()=>{const d=window.nineforestLayout.exportLayout();d.items.forEach(i=>{if(i.projection)i.projection.enabled=false;});d.lighting.master=100;d.lighting.showBeams=false;d.lighting.showFixtures=false;d.lighting.fixtures=[{...d.lighting.fixtures[0],rail:'main-front',t:(1.6-1)/11.75,enabled:true,dimmer:100,lumens:1200,yaw:0,tilt:0,beam:65,feather:0}];window.nineforestLayout.importLayout(d);});
  await page.locator('[data-view="top"]').click();await page.locator('#lighting-open').click();
  const source=(await lights(page)).lamps[0].position,radius=source[2]*Math.tan(65*Math.PI/360),probe=[source[0],source[1]-radius*.8,.02],hard=await floorPixel(page,probe);
  await range(page,'lamp-feather',60);const soft=await floorPixel(page,probe);assert(hard>soft+5,`Feather softens rendered falloff: ${hard} > ${soft}`);
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/track-lighting-feather.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('#lamp-tilt').scrollIntoViewIfNeeded();await range(page,'lamp-tilt',25);
  assert.equal((await lights(page)).fixtures.find(x=>x.id===l.selected).tilt,25);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile lighting controls fit the screen');
  assert.deepEqual(errors,[]);console.log(`PASS Track lighting, cool defaults, angle sliders/numbers, feather (${hard.toFixed(1)} / ${soft.toFixed(1)}), blackout (${on.toFixed(1)} / ${off.toFixed(1)}), rail drag, persistence and JSON validation`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
