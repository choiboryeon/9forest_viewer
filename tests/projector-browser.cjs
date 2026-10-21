const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const state=p=>p.evaluate(()=>window.nineforestLayout.projection());
const power=s=>s.lights.reduce((sum,l)=>sum+l.intensity,0);
async function pixel(p,world){await frames(p);return p.evaluate(world=>{const pos=window.nineforestLayout.projectWorld(world),src=document.querySelector('#scene'),box=src.getBoundingClientRect(),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');ctx.drawImage(src,0,0);const x=(pos.x-box.left)*src.width/box.width,y=(pos.y-box.top)*src.height/box.height,d=ctx.getImageData(Math.round(x)-3,Math.round(y)-3,7,7).data,rgb=[0,0,0];for(let i=0;i<d.length;i+=4)for(let j=0;j<3;j++)rgb[j]+=d[i+j]/49;return rgb;},world);}
const range=async(p,id,v)=>{await p.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(v));await frames(p);};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:4186/9forest_viewer.html')+'?space=spacehim');await page.waitForFunction(()=>window.nineforestLayout?.projection().projectors.length===1);
  await page.locator('#lighting-open').click();await page.locator('[data-light-preset="blackout"]').click();await page.locator('.placed-row').nth(3).click();await page.locator('#projector-guides').uncheck();
  const center=(await state(page)).projectors[0].center,probe=[5.4,-9.4,.02],whiteScreen=await pixel(page,center),whiteFloor=await pixel(page,probe),whitePower=power(await state(page));
  await fs.mkdir(path.resolve(__dirname,'../test-results/browser'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/projector-white.png')});
  assert(Math.min(...whiteScreen)>220,`Projected surface emits white light: ${whiteScreen}`);assert(whitePower>0);
  await page.locator('#projector-content').selectOption('black');const blackFloor=await pixel(page,probe);assert.equal(power(await state(page)),0);assert(whiteFloor[0]>blackFloor[0]+5,`Screen spill lights an actual nearby floor: ${whiteFloor} / ${blackFloor}`);
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/projector-black.png')});
  await page.locator('#projector-content').selectOption('color');await page.locator('#projector-color').evaluate(el=>{el.value='#ff0000';el.dispatchEvent(new Event('input',{bubbles:true}));});const red=await pixel(page,probe);assert(red[0]>red[2]+5,`Content colour reaches the floor: ${red}`);
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/projector-red.png')});
  await page.locator('#projector-content').selectOption('white');await range(page,'projector-brightness',50);assert(Math.abs(power(await state(page))*2-whitePower)<1e-7);
  await page.locator('#projector-enabled').uncheck();assert.equal(power(await state(page)),0);await page.locator('#projector-enabled').check();await range(page,'projector-brightness',100);
  // The same user-upload path is exercised for an image and an actual video.
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,80,90);x.fillStyle='#0000ff';x.fillRect(80,0,80,90);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#projector-media-file').setInputFiles({name:'red-blue.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.waitForFunction(()=>window.nineforestLayout.projection().projectors[0].config.content==='image');
  let s=await state(page);assert(s.projectors[0].colors[0][0]>.9&&s.projectors[0].colors[1][2]>.9);assert(s.lights[0].color[0]>.9&&s.lights[1].color[2]>.9);
  const saved=await page.evaluate(()=>window.nineforestLayout.exportLayout());assert.equal(saved.version,7);assert(saved.items[3].projection.poster.startsWith('data:image/jpeg;base64,'));
  await page.reload();await page.waitForFunction(()=>window.nineforestLayout?.projection().projectors[0]?.colors[0][0]>.8);assert.equal((await state(page)).projectors[0].config.mediaName,'red-blue.png');await page.locator('.placed-row').nth(3).click();
  await page.locator('#projector-media-file').setInputFiles(path.resolve(__dirname,'fixtures/projector-black-white-blue.webm'));
  await page.waitForFunction(()=>window.nineforestLayout.projection().projectors[0].config.content==='video',null,{timeout:10000}).catch(async e=>{console.log('Media diagnostic',await page.locator('#toast').innerText(),(await state(page)).projectors.map(p=>({content:p.config.content,media:p.config.mediaName,playing:p.playing})),errors);throw e;});
  await page.waitForFunction(()=>window.nineforestLayout.projection().lights.every(l=>l.intensity<1),{},{timeout:8000});
  await page.waitForFunction(()=>window.nineforestLayout.projection().lights.every(l=>l.intensity>100),{},{timeout:8000});
  await page.waitForFunction(()=>{const l=window.nineforestLayout.projection().lights[0];return l.color[2]>.9&&l.color[0]<.05&&l.intensity>50;},{},{timeout:8000});
  await page.locator('#projector-play').click();assert.equal((await state(page)).projectors[0].playing,false);
  await page.locator('#rotation').fill('0');await page.locator('#rotation').press('Tab');assert.equal(power(await state(page)),0,'Invalid aim has no luminous screen or spill');
  await page.locator('#rotation').fill('180');await page.locator('#rotation').press('Tab');
  await page.evaluate(d=>window.nineforestLayout.importLayout(d),saved);await page.waitForFunction(()=>window.nineforestLayout.projection().projectors[0]?.colors[0][0]>.8);
  const rejected=await page.evaluate(()=>{const d=window.nineforestLayout.exportLayout();d.items.find(i=>i.type==='PROJECTOR').projection.poster='javascript:bad';try{window.nineforestLayout.importLayout(d);return false;}catch{return true;}});assert(rejected);
  await page.locator('#space-select').selectOption('wess');assert.equal((await state(page)).active,false);await page.locator('#space-select').selectOption('spacehim');await page.locator('.placed-row').nth(3).click();
  await page.setViewportSize({width:390,height:844});await page.locator('#projector-lumens').scrollIntoViewIfNeeded();await range(page,'projector-lumens',4000);assert.equal((await state(page)).projectors[0].config.lumens,4000);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);console.log(`PASS Emissive projection (${whiteScreen.map(Math.round)}), floor spill (${whiteFloor.map(Math.round)} / ${blackFloor.map(Math.round)}), RGB image, dynamic video, dimming, persistence and mobile`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
