import {RAILS,MAX_LAMPS} from './track-lighting.js';

export function lightingEditor(element,rig){
 const $=q=>element.querySelector(q);
 const option=(value,label,selected)=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`;
 const slider=(id,label,value,min,max,step,unit)=>`<div class="light-slider"><label for="${id}">${label}<output id="${id}-value">${Math.round(value)}${unit}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"></div>`;
 const angle=(id,label,value,min,max,unit)=>`<div class="light-angle"><label for="${id}-number">${label}</label><div class="light-angle-inputs"><input id="${id}" type="range" min="${min}" max="${max}" step="1" value="${value}" aria-label="${label}"><input id="${id}-number" type="number" min="${min}" max="${max}" step="1" value="${value}" aria-label="${label} 수치"><span>${unit}</span></div></div>`;
 function render(){
  const c=rig.config,l=rig.selectedLamp;
  element.innerHTML=`<div class="lighting-editor">
   <p class="micro">조명 기구를 클릭해 선택하거나 평면에서 레일을 따라 드래그하세요.</p>
   <div class="light-presets"><button data-light-preset="exhibition">전시</button><button data-light-preset="performance">공연</button><button data-light-preset="blackout">암전</button></div>
   <div class="field full"><label for="lamp-select">조명 선택 · ${c.fixtures.length} / ${MAX_LAMPS}등</label><select id="lamp-select">${c.fixtures.map(x=>option(x.id,`${x.id} · ${RAILS.find(r=>r.id===x.rail).label}${x.enabled?'':' · 꺼짐'}`,l?.id)).join('')}</select></div>
   ${l?`<label class="light-on"><input id="lamp-enabled" type="checkbox" ${l.enabled?'checked':''}>${l.id} 켜기</label>
    <div class="light-angle-panel"><span class="control-label">선택 조명의 각도와 빛 번짐</span>
     ${angle('lamp-yaw','수평 회전',l.yaw,0,360,'°')}
     ${angle('lamp-tilt','상하 기울기',l.tilt,0,90,'°')}
     ${angle('lamp-beam','빔 각도',l.beam,20,90,'°')}
     ${angle('lamp-feather','페더 · 가장자리 부드러움',l.feather,0,100,'%')}
     <p class="micro">기울기 0°는 수직 아래, 90°는 수평입니다. 페더가 클수록 빛의 가장자리가 넓게 흐려집니다. 점선은 페더가 시작되는 안쪽 범위입니다.</p>
    </div>
    <div class="field full"><label for="lamp-kelvin">색온도</label><select id="lamp-kelvin">${[2700,3000,3500,4000,5000,6500].map(k=>option(k,`${k} K`,l.kelvin)).join('')}</select></div>
    <div class="row-actions"><button id="lighting-cool-all">전체 6,500 K</button><button id="lighting-feather-all">이 페더 전체 적용</button></div>
    <div class="row-actions"><button id="lamp-focus">선택 조명 보기</button><button id="lamp-remove" class="danger">조명 제거</button></div>
    <div class="rule"></div>
    <div class="field full"><label for="lamp-rail">설치 레일</label><select id="lamp-rail">${RAILS.map(r=>option(r.id,r.label,l.rail)).join('')}</select></div>
    ${slider('lamp-position','레일 위 위치',l.t*100,0,100,1,'%')}
    ${slider('lamp-dimmer','개별 밝기',l.dimmer,0,100,1,'%')}
    ${slider('lamp-lumens','광속 (가정)',l.lumens,100,3000,50,' lm')}`:'<p class="micro">조명을 추가해 레일에 설치하세요.</p>'}
   <div class="row-actions"><button id="lamp-add" ${c.fixtures.length>=MAX_LAMPS?'disabled':''}>조명 추가</button><button id="lighting-reset">배치 초기화</button></div>
   <div class="rule"></div><span class="control-label">전체 조명</span>
   ${slider('lighting-master','전체 밝기',c.master,0,100,1,'%')}
   <label class="light-on"><input id="lighting-indirect" type="checkbox" ${c.indirect?'checked':''}>주변 반사광</label>
   ${slider('lighting-indirect-strength','반사광 강도',c.indirectStrength,0,200,5,'%')}
   <p class="micro">바닥·벽에 닿은 빛이 주변과 천장으로 반사됩니다. 조명의 위치·방향·밝기·색온도와 벽·기둥의 가림을 반영합니다.</p>
   <div class="light-switches"><label><input id="lighting-simulation" type="checkbox" ${c.simulation?'checked':''}>암실 조명 보기</label><label><input id="lighting-fixtures" type="checkbox" ${c.showFixtures?'checked':''}>레일·기구 표시</label><label><input id="lighting-beams" type="checkbox" ${c.showBeams?'checked':''}>선택 조명의 빛 범위 표시</label></div>
   <p class="micro">암실 조명 보기를 끄면 배치 작업용 밝기가 더해집니다.</p>
   <p class="mini-note">빛과 그림자를 실시간으로 확인하는 설치 검토용 미리보기입니다. 반사광은 간이 추정이며 실제 밝기는 조명 기구와 벽·바닥 마감에 따라 달라집니다. 조명 설정은 배치와 함께 저장됩니다.</p>
  </div>`;
  for(const b of element.querySelectorAll('[data-light-preset]'))b.addEventListener('click',()=>{rig.preset(b.dataset.lightPreset);render();});
  $('#lighting-master').addEventListener('input',e=>{const v=Number(e.target.value);rig.setGlobal({master:v});$('#lighting-master-value').textContent=v+'%';});
  $('#lighting-indirect').addEventListener('change',e=>rig.setGlobal({indirect:e.target.checked}));
  $('#lighting-indirect-strength').addEventListener('input',e=>{const value=Number(e.target.value);rig.setGlobal({indirectStrength:value});$('#lighting-indirect-strength-value').textContent=value+'%';});
  for(const [id,key] of [['lighting-simulation','simulation'],['lighting-fixtures','showFixtures'],['lighting-beams','showBeams']])$('#'+id).addEventListener('change',e=>rig.setGlobal({[key]:e.target.checked}));
  $('#lamp-select').addEventListener('change',e=>{rig.select(e.target.value);render();});
  $('#lamp-add').addEventListener('click',()=>{rig.add(l?.rail);render();});
  $('#lighting-reset').addEventListener('click',()=>{rig.restore();rig.onChange();render();});
  if(!l)return;
  $('#lamp-enabled').addEventListener('change',e=>{rig.edit(l.id,{enabled:e.target.checked});render();});
  $('#lamp-rail').addEventListener('change',e=>{rig.edit(l.id,{rail:e.target.value});render();});
  $('#lamp-kelvin').addEventListener('change',e=>rig.edit(l.id,{kelvin:Number(e.target.value)}));
  $('#lighting-cool-all').addEventListener('click',()=>{rig.editAll({kelvin:6500});render();});
  $('#lighting-feather-all').addEventListener('click',()=>{rig.editAll({feather:rig.selectedLamp.feather});render();});
  for(const [id,key,unit,scale] of [['lamp-position','t','%',.01],['lamp-dimmer','dimmer','%',1],['lamp-lumens','lumens',' lm',1],['lamp-beam','beam','°',1],['lamp-yaw','yaw','°',1],['lamp-tilt','tilt','°',1],['lamp-feather','feather','%',1]]){
   const range=$('#'+id),number=$('#'+id+'-number');
   const apply=(value,writeNumber=true)=>{const v=Math.max(Number(range.min),Math.min(Number(range.max),Number(value)));rig.edit(l.id,{[key]:v*scale});range.value=v;if(number&&writeNumber)number.value=v;const output=$('#'+id+'-value');if(output)output.textContent=v+unit;};
   range.addEventListener('input',e=>apply(e.target.value));
   number?.addEventListener('input',e=>{const v=e.target.valueAsNumber;if(Number.isFinite(v)&&v>=Number(range.min)&&v<=Number(range.max))apply(v,false);});
   number?.addEventListener('change',e=>apply(e.target.value));
  }
  $('#lamp-remove').addEventListener('click',()=>{rig.remove(l.id);render();});
  $('#lamp-focus').addEventListener('click',()=>element.dispatchEvent(new CustomEvent('focus-lamp',{detail:l.id})));
 }
 return {render,refreshPosition(){const l=rig.selectedLamp;if(l&&$('#lamp-position')){$('#lamp-position').value=l.t*100;$('#lamp-position-value').textContent=Math.round(l.t*100)+'%';}}};
}
