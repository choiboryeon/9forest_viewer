const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:4186/9forest_viewer.html')+'?space=spacehim');
  await page.waitForFunction(()=>window.nineforestLayout?.state().renderTriangles>0);
  let s=await page.evaluate(()=>window.nineforestLayout.state());
  assert.equal(s.spaceId,'spacehim');assert(s.roomMeshes>=160);
  assert.deepEqual(s.items.map(i=>i.type),['K8','K8','MIXER','PROJECTOR']);
  assert.equal(await page.locator('[data-add="R01"]').count(),0);
  await page.locator('#walk-start').click();
  assert.equal((await page.evaluate(()=>window.nineforestLayout.state())).walking,true);
  await page.locator('#walk-stop').click();
  await page.locator('.placed-row').nth(3).click();
  assert.match(await page.locator('#projection-info').innerText(),/3\.58 × 2\.02 m/);
  await page.locator('#rotation').fill('180');await page.locator('#rotation').press('Tab');
  assert.match(await page.locator('#projection-info').innerText(),/투사 가능한 벽이 없습니다/);
  await page.locator('#rotation').fill('0');await page.locator('#rotation').press('Tab');
  await page.locator('.placed-row').first().click();
  await page.locator('#height').fill('1.4');await page.locator('#height').press('Tab');
  s=await page.evaluate(()=>window.nineforestLayout.state());assert.equal(s.items[0].height,1.4);
  await page.locator('[data-mode="floor"]').click();
  s=await page.evaluate(()=>window.nineforestLayout.state());assert.equal(s.items[0].mode,'floor');
  const exported=await page.evaluate(()=>window.nineforestLayout.exportLayout());
  await page.locator('#space-select').selectOption('wess');
  await page.evaluate(layout=>window.nineforestLayout.importLayout(layout),exported);
  assert.equal((await page.evaluate(()=>window.nineforestLayout.state())).spaceId,'spacehim');
  await fs.mkdir(path.resolve(__dirname,'../test-results/browser'),{recursive:true});
  await page.screenshot({path:path.resolve(__dirname,'../test-results/browser/spacehim-final.png')});
  await page.setViewportSize({width:390,height:844});
  const widths=await page.evaluate(()=>[innerWidth,document.documentElement.scrollWidth,document.querySelector('#scene').getBoundingClientRect().width]);
  assert(widths[1]<=widths[0]+1&&widths[2]>300,`Mobile Space Him layout ${widths}`);
  assert.deepEqual(errors,[]);
  console.log('PASS Space Him gear, projection, editing, cross-space JSON import and rendering');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
