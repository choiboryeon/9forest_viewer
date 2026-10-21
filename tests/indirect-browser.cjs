const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const ready=p=>p.waitForFunction(()=>window.nineforestLayout?.indirect().pending===0&&window.nineforestLayout.state().renderTriangles>0);
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function pixel(p,world){await frames(p);return p.evaluate(world=>{const v=window.nineforestLayout.projectWorld(world),src=document.querySelector('#scene'),r=src.getBoundingClientRect(),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const x=c.getContext('2d');x.drawImage(src,0,0);const d=x.getImageData(Math.round((v.x-r.left)*src.width/r.width)-2,Math.round((v.y-r.top)*src.height/r.height)-2,5,5).data,rgb=[0,0,0];for(let i=0;i<d.length;i+=4)for(let j=0;j<3;j++)rgb[j]+=d[i+j]/25;return rgb;},world);}
const mean=rgb=>rgb.reduce((a,b)=>a+b)/3;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:4186/9forest_viewer.html')+'?space=spacehim');await ready(page);
  await page.evaluate(()=>{const d=window.nineforestLayout.exportLayout();d.items.forEach(i=>{if(i.projection)i.projection.enabled=false;});d.lighting.showBeams=false;window.nineforestLayout.importLayout(d);});await ready(page);await page.locator('#lighting-open').click();
  const wall=[5.2,-4.956,1.2],on=await pixel(page,wall);
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/track-indirect-on.png')});
  await page.locator('#lighting-indirect').uncheck();const off=await pixel(page,wall);assert(mean(on)>mean(off)+8,`A wall outside the direct beam receives reflected light: ${on} / ${off}`);
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/track-indirect-off.png')});
  await page.locator('#lighting-indirect').check();await ready(page);const saved=await page.evaluate(()=>window.nineforestLayout.exportLayout());assert.equal(saved.lighting.version,3);assert.equal(saved.lighting.indirect,true);
  // A single wall-directed lamp reflects onto the floor outside its direct cone,
  // while a closed store behind partitions remains unlit.
  await page.evaluate(()=>{const d=window.nineforestLayout.exportLayout();d.lighting.fixtures=[{...d.lighting.fixtures[1],rail:'main-front',t:(5-1)/11.75,yaw:0,tilt:65,beam:40,feather:60}];window.nineforestLayout.importLayout(d);});await ready(page);await page.locator('[data-view="top"]').click();
  const floor=[5,-6.9,.02],store=[10,-3,.02],litFloor=await pixel(page,floor),blocked=await pixel(page,store);assert(mean(litFloor)>mean(blocked)+2,`Local reflection respects a closed partition: ${litFloor} / ${blocked}`);
  await page.locator('#lighting-indirect').uncheck();const darkFloor=await pixel(page,floor);assert(mean(litFloor)>mean(darkFloor)+2,`Floor beyond the direct cone receives wall reflection: ${litFloor} / ${darkFloor}`);
  await page.locator('#lighting-indirect').check();await page.locator('#lamp-kelvin').selectOption('2700');await ready(page);const warm=await pixel(page,floor);assert(warm[0]>warm[2]+1,'Reflected light follows warm colour temperature');
  await page.locator('#lighting-indirect-strength').evaluate(el=>{el.value='150';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const settings=await page.evaluate(()=>window.nineforestLayout.exportLayout());assert.equal(settings.lighting.indirectStrength,150);
  await page.reload();await ready(page);assert.equal(await page.evaluate(()=>window.nineforestLayout.exportLayout().lighting.indirectStrength),150);
  await page.locator('#lighting-open').click();await page.locator('[data-light-preset="blackout"]').click();await frames(page);assert.equal(await page.evaluate(()=>window.nineforestLayout.indirect().energy),0);
  await page.evaluate(d=>window.nineforestLayout.importLayout(d),saved);await ready(page);assert.equal(await page.evaluate(()=>window.nineforestLayout.exportLayout().lighting.indirectStrength),100);
  await page.setViewportSize({width:390,height:844});await page.locator('#lighting-open').click();await page.locator('#lighting-indirect').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#space-select').selectOption('wess');assert.equal(await page.evaluate(()=>window.nineforestLayout.indirect().active),false);
  assert.deepEqual(errors,[]);console.log(`PASS Spatial track reflection: wall ${mean(on).toFixed(1)} / ${mean(off).toFixed(1)}, floor ${mean(litFloor).toFixed(1)} / ${mean(darkFloor).toFixed(1)}, occlusion, colour, blackout, persistence and mobile`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
