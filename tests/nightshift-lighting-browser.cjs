const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const frames=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function floorPixel(page,point){
 await frames(page);
 return page.evaluate(point=>{
  const canvas=document.querySelector('#scene'),rect=canvas.getBoundingClientRect(),position=nineforestLayout.projectWorld(point);
  const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
  const context=copy.getContext('2d');context.drawImage(canvas,0,0);
  const x=Math.round((position.x-rect.left)*canvas.width/rect.width),y=Math.round((position.y-rect.top)*canvas.height/rect.height);
  const pixels=context.getImageData(x-2,y-2,5,5).data;let sum=0;
  for(let i=0;i<pixels.length;i+=4)sum+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
  return sum/25;
 },point);
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 try{
  await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:4186/9forest_viewer.html')+'?space=nightshift');
  await page.waitForFunction(()=>nineforestLayout?.state().renderTriangles>0);
  await page.evaluate(()=>nineforestLayout.clear());await page.locator('[data-view="top"]').click();
  const windowSide=await floorPixel(page,[1.4,1.4,.02]),opposite=await floorPixel(page,[5.4,1.4,.02]);
  const ledWash=await floorPixel(page,[2.4,2.4,.02]),backCorner=await floorPixel(page,[2.4,4.2,.02]);
  assert(windowSide>opposite+12,`Frosted window light falls off across the room: ${windowSide} / ${opposite}`);
  assert(ledWash>backCorner+18,`The suspended LEDs light the room beyond its base fill: ${ledWash} / ${backCorner}`);
  await page.locator('#space-select').selectOption('wess');
  await page.evaluate(()=>{const data=nineforestLayout.exportLayout();data.daylight={version:2,sky:0,sun:0,artificial:0,bounce:true};nineforestLayout.importLayout(data);});
  await page.waitForFunction(()=>nineforestLayout.daylight().pending===0);
  await page.locator('[data-view="top"]').click();
  assert(await floorPixel(page,[2.2,.8,.02])<20,'Night Shift lights stay off in WESS');
  assert.deepEqual(errors,[]);
  console.log(`PASS Night Shift window gradient ${windowSide.toFixed(1)} / ${opposite.toFixed(1)}, LED wash ${ledWash.toFixed(1)} / ${backCorner.toFixed(1)}, cross-space isolation`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
