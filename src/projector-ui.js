export function projectorEditor(element,item,rig,toast){
 const id=item.uid,$=q=>element.querySelector(q),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render(){
  const c=rig.settings(id),live=rig.records.get(id),options=[['white','흰 화면'],['black','검정 화면'],['color','단색 화면'],['pulse','밝기 변화 테스트']];
  if(c.poster)options.push([c.content==='video'||live?.video?'video':'image',c.content==='video'||live?.video?'불러온 영상':'불러온 이미지']);
  element.innerHTML=`<div class="projector-controls"><div class="rule"></div><span class="control-label">프로젝터 화면과 반사광</span><label class="light-on"><input id="projector-enabled" type="checkbox" ${c.enabled?'checked':''}>프로젝터 켜기</label><div class="light-slider"><label for="projector-brightness">화면 밝기<output id="projector-brightness-value">${c.brightness}%</output></label><input id="projector-brightness" type="range" min="0" max="100" step="1" value="${c.brightness}"></div><div class="light-slider"><label for="projector-lumens">백색 광속 (가정)<output id="projector-lumens-value">${c.lumens} lm</output></label><input id="projector-lumens" type="range" min="500" max="10000" step="100" value="${c.lumens}"></div><div class="field full"><label for="projector-content">화면 내용</label><select id="projector-content">${options.map(([v,label])=>`<option value="${v}" ${v===c.content?'selected':''}>${label}</option>`).join('')}</select></div>${c.content==='color'?`<div class="field full"><label for="projector-color">화면 색상</label><input id="projector-color" type="color" value="${c.color}"></div>`:''}<div class="row-actions"><button id="projector-media-open">이미지·영상 불러오기</button>${live?.video&&c.content==='video'?`<button id="projector-play">${live.video.paused?'영상 재생':'영상 일시정지'}</button>`:''}</div><input id="projector-media-file" type="file" accept="image/*,video/*" hidden><p class="micro">${c.mediaName?esc(c.mediaName):'흰 화면·검정 화면을 바꾸거나 공연 영상을 불러와 빛의 변화를 확인하세요.'}${c.content==='video'&&!live?.video?'<br>저장된 대표 화면입니다. 영상을 다시 선택하면 재생됩니다.':''}</p><label class="light-on projector-guides"><input id="projector-guides" type="checkbox" ${c.showGuides?'checked':''}>투사 범위 표시</label><p class="mini-note">화면의 밝기·색상을 바탕으로 벽·바닥에 퍼지는 반사광을 근사합니다. 유효한 투사 배치에서 적용되며 레일 조명과 독립적으로 켜고 끌 수 있습니다. 영상은 소리 없이 반복 재생됩니다. 배치 파일에는 대표 화면만 저장됩니다.</p></div>`;
  $('#projector-enabled').addEventListener('change',e=>rig.edit(id,{enabled:e.target.checked}));
  $('#projector-guides').addEventListener('change',e=>rig.edit(id,{showGuides:e.target.checked}));
  for(const [name,key,unit] of [['brightness','brightness','%'],['lumens','lumens',' lm']])$('#projector-'+name).addEventListener('input',e=>{rig.edit(id,{[key]:Number(e.target.value)});$('#projector-'+name+'-value').textContent=e.target.value+unit;});
  $('#projector-content').addEventListener('change',e=>{rig.edit(id,{content:e.target.value});render();});
  $('#projector-color')?.addEventListener('input',e=>rig.edit(id,{color:e.target.value}));
  $('#projector-media-open').addEventListener('click',()=>$('#projector-media-file').click());
  $('#projector-media-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{await rig.loadMedia(id,f);render();toast('투사 화면을 불러왔습니다');}catch(err){toast(err.message);}});
  $('#projector-play')?.addEventListener('click',()=>{rig.toggleVideo(id);render();});
 }
 render();
}
