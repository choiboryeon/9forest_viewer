// Space Him v4 used a mirrored positive-Y plan. v5 restores Blender's X=u,Y=-v.
// A heading must also be reflected, so saved physical placements keep their aim.
export function layoutItems(data){
 if(data.space_id!=='spacehim'||Number(data.version)>=5)return data.items;
 return data.items.map(it=>({...it,y:-Number(it.y),rotation:((180-Number(it.rotation||0))%360+360)%360,tiltX:0,tiltY:0}));
}
