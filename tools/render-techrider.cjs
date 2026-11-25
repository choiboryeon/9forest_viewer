// Tech-rider stills of the Space Him event setup from several angles, heights and
// distances. Needs the local server (npm run serve) and Chrome.
//   node tools/render-techrider.cjs [output folder]
//   ONLY=15,16 node tools/render-techrider.cjs   (only those shot numbers)
// Captures only the 3D canvas (no UI) at 2× pixel density, with power, audio and
// video lines on and the ceiling hidden.
const path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright');
const out=path.resolve(process.argv[2]||path.join(__dirname,'..','renders','spacehim','techrider'));
const url=(process.env.VIEWER_URL||'http://127.0.0.1:4186/9forest_viewer.html')+'?space=spacehim';
// [file, label, camera position, target, field of view]; top = plan view.
const SHOTS=[
 ['01_overview_NE','전체 · 북동쪽 위에서',[11,-1.2,7.4],[5.6,-8.2,0],48],
 ['02_overview_NW','전체 · 북서쪽 위에서',[0.8,-2.2,6.8],[6.4,-8.4,0],50],
 ['03_overview_high','전체 · 높은 부감',[6.3,-3.4,10.5],[6.3,-8,0],50],
 ['04_audience_back','객석 뒤 · 눈높이(송출 카메라 앞)',[6.3,-5.95,1.7],[6.25,-10.4,1.0],62],
 ['05_audience_middle','객석 가운데 · 앉은 눈높이',[6.4,-6.6,1.15],[6.3,-10.6,1.2],66],
 ['06_stage_from_audience_left','무대 · 객석 왼쪽(동쪽)에서',[10.6,-6.2,2.2],[6.3,-9.8,0.8],55],
 ['07_stage_from_audience_right','무대 · 객석 오른쪽(서쪽)에서',[1.4,-5.6,2.4],[6,-9.8,0.8],55],
 ['08_presentation_desk','presentation desk · 근접',[7.3,-7.5,2.3],[8.5,-9.4,0.7],50],
 ['09_presenter_view','발표자 시점 · 객석 방향',[8.45,-9.75,1.25],[5.8,-6,0.8],70],
 ['10_control_desk','control desk · 근접',[4.4,-5.5,2.4],[2.75,-6.6,0.75],50],
 ['11_guitar_stage_right','기타 · 화면 오른쪽',[5.2,-8.4,1.5],[4.05,-10.05,0.55],45],
 ['12_cables_south_wall','남쪽 벽 결선 · 낮은 시점',[1.2,-9.4,0.9],[7.5,-10.3,0.2],60],
 ['13_side_east','측면 · 동쪽에서',[13.2,-8.2,3.2],[6,-8.2,0.6],52],
 ['14_plan','평면도',null,null,null],
 // Perspective top view over the event area, the image wall at the top.
 ['15_top_view','탑뷰 · 행사 영역 수직 부감',[6.2,-7.55,11.5],[6.2,-8,0],46],
 // Seated operator at the control desk, past the laptop and console to the stage.
 ['16_control_desk_view','control desk 운영자 시점 · 무대 방향',[2.05,-6.5,1.2],[6.4,-9.6,0.95],72],
];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
 const page=await browser.newPage({viewport:{width:1920,height:1200},deviceScaleFactor:2});
 await page.goto(url);
 await page.waitForFunction(()=>window.nineforestLayout?.state().renderTriangles>0&&window.nineforestLayout.indirect().pending===0,null,{timeout:120000});
 // Full-width canvas without the side panels and overlays.
 await page.addStyleTag({content:'.left,.right{display:none!important}.app{grid-template-columns:1fr!important}.stage-info,.stage-bottom,#frame-guide{display:none!important}'});
 await page.evaluate(()=>new Promise(r=>setTimeout(r,500)));
 await page.evaluate(()=>{for(const id of ['power-lines','audio-lines','video-lines']){const el=document.getElementById(id);if(!el.checked)el.click();}const roof=document.getElementById('roof');if(roof.checked)roof.click();window.nineforestLayout.select(null);});
 const settle=async()=>{await page.waitForFunction(()=>window.nineforestLayout.indirect().pending===0,null,{timeout:120000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,400)))));};
 const index=[];
 const only=(process.env.ONLY||'').split(',').filter(Boolean);
 for(const [file,label,position,target,fov] of SHOTS){
  if(only.length&&!only.some(n=>file.startsWith(n.padStart(2,'0')+'_')))continue;
  if(position)await page.evaluate(([p,t,f])=>window.nineforestLayout.setCamera(p,t,f),[position,target,fov]);
  else await page.evaluate(()=>window.nineforestLayout.setView('top'));
  await settle();
  const name=`${file}.png`;await page.locator('#scene').screenshot({path:path.join(out,name)});index.push(`${name}\t${label}`);console.log('saved',name);
 }
 // The list always describes every shot, also when ONLY renders a few.
 fs.writeFileSync(path.join(out,'목록.txt'),SHOTS.map(([f,l])=>`${f}.png\t${l}`).join('\n')+'\n');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
