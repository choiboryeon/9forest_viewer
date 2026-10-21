// A geometric preview only: throw ratio = lens-to-wall distance / image width.
export function projectionFor(item,walls,ratio=.3,aspect=16/9){
 const angle=(item.rotation||0)*Math.PI/180,dx=-Math.sin(angle),dy=Math.cos(angle);
 const lens=[item.x+dx*.16,item.y+dy*.16];let best=null;
 for(const wall of walls||[]){
  const ax=wall.a[0],ay=wall.a[1],sx=wall.b[0]-ax,sy=wall.b[1]-ay;
  const det=dx*(-sy)+sx*dy;if(Math.abs(det)<1e-7)continue;
  const rx=ax-lens[0],ry=ay-lens[1],distance=(rx*(-sy)+sx*ry)/det,t=(dx*ry-dy*rx)/det;
  if(distance<=.03||t<0||t>1)continue;
  if(best&&distance>=best.distance)continue;
  const width=distance/ratio,height=width/aspect,along=Math.hypot(sx,sy),half=width/2,incidence=Math.abs(dx*sy-dy*sx)/along;
  best={wall:wall.id,label:wall.label,distance,width,height,center:[lens[0]+dx*distance,lens[1]+dy*distance],wallA:wall.a,wallB:wall.b,
   incidence,valid:incidence>=.94&&t*along>=half+.1&&(1-t)*along>=half+.1&&height<=wall.height-.25,
   reason:incidence<.94?'벽을 정면으로 향하게 회전해 주세요':t*along<half+.1||(1-t)*along<half+.1?'화면이 벽의 끝을 넘습니다':height>wall.height-.25?'화면이 보 하부 높이를 넘습니다':null};
 }
 return best;
}
