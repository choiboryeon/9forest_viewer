import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const room=JSON.parse(fs.readFileSync(path.join(root,'data/spacehim-room.json')));
const notes=JSON.parse(fs.readFileSync(path.join(root,'data/spacehim-source/model_notes.json')));
const scale=55,ox=100,oy=110,pt=([x,y])=>[ox+x*scale,oy+y*scale];
const pts=poly=>poly.map(p=>pt(p).map(v=>v.toFixed(2)).join(',')).join(' ');
function hull(m){
 const p=[];for(let i=0;i<m.vertices.length;i+=3)p.push([m.vertices[i],-m.vertices[i+1]]);
 const a=[...new Map(p.map(v=>[v.join(),v])).values()].sort((u,v)=>u[0]-v[0]||u[1]-v[1]);
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const lo=[],hi=[];for(const p of a){while(lo.length>=2&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
 for(const p of [...a].reverse()){while(hi.length>=2&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}return [...lo.slice(0,-1),...hi.slice(0,-1)];
}
const drawings=[`<svg xmlns="http://www.w3.org/2000/svg" width="1060" height="850" viewBox="0 0 1060 850"><style>text{font-family:'Malgun Gothic',sans-serif;fill:#253b35} .dim{stroke:#677c72;fill:none;stroke-width:1} .small{font-size:13px}</style><rect width="1060" height="850" fill="#fafbf7"/><text x="55" y="45" font-size="24" font-weight="700">공간 힘 지하 · 검토 후 평면</text><text x="55" y="73" class="small">원본 도면 방향 / 단위 m / 천장·보·설비 생략 / 2026-10-21</text>`];
drawings.push(`<polygon points="${pts(notes.outer_inner_face_polygon_uv)}" fill="#e6e7df"/><polygon points="${pts(notes.gallery_floor_polygon_uv)}" fill="#d1d6d0"/>`);
for(const m of room.meshes){
 if(m.group!=='wall'&&!/^Stair_tread/.test(m.name))continue;
 if(m.bounds.min[2]>.5)continue;
 const poly=hull(m);if(poly.length<3)continue;
 const style=m.unconfirmed?'fill="none" stroke="#bb8244" stroke-dasharray="5 4" stroke-width="2"':/^Stair_tread/.test(m.name)?'fill="#aeb9b1" stroke="#6a7c70" stroke-width=".6"':'fill="#53665b" stroke="#46584e" stroke-width=".5"';
 drawings.push(`<polygon points="${pts(poly)}" ${style}/>`);
}
const text=(x,y,s,size=15)=>{const p=pt([x,y]);drawings.push(`<text x="${p[0]}" y="${p[1]}" text-anchor="middle" font-size="${size}">${s}</text>`);};
text(3.8,1.5,'상부 전시 구역');text(6.8,7.7,'주 전시 구역');text(11.7,3.15,'창고');text(10.9,4.18,'창고');text(7.3,2.85,'계단',12);text(4.2,4.5,'중앙 자유단 벽',12);
text(.5,-.3,'도면 좌상단 (0,0)',12);
function dimension(a,b,label,offset,vertical=false){
 const p=pt(a),q=pt(b);let p1,p2,t;
 if(vertical){p1=[p[0]+offset,p[1]];p2=[q[0]+offset,q[1]];t=[p1[0]-8,(p1[1]+p2[1])/2];}
 else{p1=[p[0],p[1]+offset];p2=[q[0],q[1]+offset];t=[(p1[0]+p2[0])/2,p1[1]+20];}
 drawings.push(`<path class="dim" d="M${p}L${p1}L${p2}L${q}"/><text x="${t[0]}" y="${t[1]}" text-anchor="${vertical?'end':'middle'}" font-size="14">${label}</text>`);
}
dimension([0,10.75],[13.95,10.75],'13.950',65);dimension([0,10.75],[12.45,10.75],'12.450',29);dimension([0,0],[0,10.75],'10.750',-40,true);
text(11.7,6.8,'4.150 m 우측 직선',12);
drawings.push('<rect x="100" y="795" width="20" height="12" fill="#53665b"/><text x="130" y="806" class="small">기존 모델 벽체</text><rect x="320" y="795" width="20" height="12" fill="none" stroke="#bb8244" stroke-dasharray="4 3"/><text x="350" y="806" class="small">미확인 부재: 기본 숨김</text><text x="700" y="806" class="small">세부 치수·근거는 검토 보고서 참조</text></svg>');
fs.mkdirSync(path.join(root,'docs'),{recursive:true});fs.writeFileSync(path.join(root,'docs/spacehim-reviewed-plan.svg'),drawings.join('\n'));
console.log('Wrote docs/spacehim-reviewed-plan.svg');
