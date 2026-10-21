"""Original QSC K8, not K8.2. Manufacturer H/W/D: 450/280/269 mm.
Sources: QSC K Series Spec Sheet 04/06/11, pp.1,3,4; supplied World Mall photos.
Dimensioned envelope is exact; radii and control positions are photo-derived.
Asset coordinates: X width, +Y front, Z up, base Z=0. Blender 4.5.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets'/'equipment'/'qsc-k8'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
assets=[]
def mat(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
 p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
shell=mat('Textured black ABS',(.023,.026,.028),0,.72)
steel=mat('Black powder coated grille',(.035,.039,.043),.5,.52)
black=mat('Recesses and black cloth',(.004,.005,.006),0,.95)
rubber=mat('Rubber feet and handle grip',(.012,.014,.015),0,.9)
panel=mat('Rear amplifier module',(.035,.037,.038),.5,.48)
silver=mat('Brushed metal and lettering',(.45,.47,.48),.65,.42)
white=mat('QSC badge lettering',(.8,.81,.8),.2,.4)
def finish(o,name,m,bevel=0):
 o.name=name;o.data.materials.append(m);assets.append(o)
 if bevel:
  mod=o.modifiers.new('Moulded edge radius','BEVEL');mod.width=bevel;mod.segments=3
  mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def box(name,loc,size,m,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,m,bevel)
def cyl(name,loc,r,depth,m,axis='Y',vertices=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
 o=bpy.context.object
 if axis=='Y':o.rotation_euler.x=math.pi/2
 if axis=='X':o.rotation_euler.y=math.pi/2
 return finish(o,name,m)
def mesh(name,verts,faces,m):
 g=bpy.data.meshes.new(name);g.from_pydata(verts,[],faces);g.update()
 o=bpy.data.objects.new(name,g);scene.collection.objects.link(o);return finish(o,name,m)
def text(name,word,loc,size,m,back=False):
 c=bpy.data.curves.new(name,'FONT');c.body=word;c.size=size;c.align_x='CENTER';c.align_y='CENTER';c.extrude=.00008
 o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(math.pi/2,0,0 if back else math.pi)
 o.data.materials.append(m);assets.append(o);return o

# Front is wider and taller than the rear, as in the dimensioned top/side views.
verts=[(-.14,.118,.004),(.14,.118,.004),(.104,-.127,.023),(-.104,-.127,.023),
       (-.14,.118,.45),(.14,.118,.45),(.104,-.127,.428),(-.104,-.127,.428)]
body=mesh('K8_Moulded_trapezoid_cabinet',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],shell)
# Real recessed top carry handle, rather than an attached side handle.
cutter=box('TEMP_handle_cut',(0,-.035,.433),(.111,.102,.054),black)
bpy.context.view_layer.objects.active=body
mod=body.modifiers.new('Top handle pocket','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE'
bpy.ops.object.modifier_apply(modifier=mod.name);assets.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
mod=body.modifiers.new('ABS edge bevel','BEVEL');mod.width=.004;mod.segments=3
body.modifiers.new('Cabinet normals','WEIGHTED_NORMAL')
box('K8_Handle_pocket_floor',(0,-.035,.408),(.105,.098,.004),black,.002)
cyl('K8_Recessed_handle_grip',(0,-.032,.423),.008,.096,rubber,axis='X')
for x in (-.051,.051):box('K8_Handle_mount',(x,-.035,.416),(.009,.075,.017),shell,.003)

# Bowed full-face steel grille, with actual mesh perforations. No exposed silver woofer.
fy=lambda x:.1345-.012*(x/.13)**2
gverts=[];gfaces=[]
cols,rows=34,54;pitch=.0074
outer=[(-.5,-.5),(0,-.5),(.5,-.5),(.5,0),(.5,.5),(0,.5),(-.5,.5),(-.5,0)]
for row in range(rows):
 for col in range(cols):
  x=(col-(cols-1)/2)*pitch;z=.225+(row-(rows-1)/2)*pitch;start=len(gverts)
  for u,v in outer:gverts.append((x+u*pitch,fy(x+u*pitch),z+v*pitch))
  for k in range(8):
   a=-3*math.pi/4+k*math.pi/4
   xx=x+math.cos(a)*.0023;zz=z+math.sin(a)*.0023;gverts.append((xx,fy(xx),zz))
  for k in range(8):gfaces.append((start+k,start+(k+1)%8,start+8+(k+1)%8,start+8+k))
mesh('K8_Curved_perforated_full_front_grille',gverts,gfaces,steel)
box('K8_Dark_acoustic_cloth',(0,.119,.225),(.253,.001,.408),black,.002)
# Rounded perimeter rails frame the perforated face.
for x in (-.132,.132):box('K8_Grille_side_rim',(x,.120,.225),(.014,.016,.434),shell,.005)
for z in (.012,.438):box('K8_Grille_top_bottom_rim',(0,.122,z),(.264,.015,.018),shell,.004)
for x in (-.087,.087):
 for z in (.025,.425):cyl('K8_Grille_screw',(x,fy(x)+.0002,z),.0026,.0006,black,vertices=12)
box('K8_Front_badge_trim',(0,.133,.046),(.047,.002,.019),silver,.001)
box('K8_Front_badge',(0,.1341,.046),(.044,.0005,.016),black)
text('K8_QSC_front_logo','QSC',(0,.1344,.048),.010,white)
text('K8_Front_K_series','K SERIES',(0,.1344,.0415),.0028,white)
cyl('K8_Front_power_LED',(0,.1342,.029),.0014,.0006,white,vertices=12)
for x in (-.087,.087):
 for y in (-.079,.071):box('K8_Rubber_foot',(x,y,.0035),(.022,.027,.007),rubber,.002)
# Pole socket is centred under the enclosure and accepts a standard 35 mm pole.
cyl('K8_35mm_pole_socket',(0,-.005,.008),.0175,.015,black,axis='Z')

# Rear amplifier/control panel, connectors, fan and power entry.
box('K8_Recessed_rear_amplifier_plate',(0,-.1274,.219),(.177,.001,.304),panel,.004)
for x in (-.082,.082):
 for z in (.077,.362):cyl('K8_Rear_plate_screw',(x,-.1285,z),.0024,.001,silver,vertices=12)
text('K8_Rear_QSC_logo','QSC',(0,-.129,.351),.019,white,True)
text('K8_Rear_identification','K8  /  K SERIES',(0,-.129,.333),.005,white,True)
for i in range(14):box('K8_Amplifier_vent_slot',(-.062+i*.0095,-.1288,.308),(.003,.0007,.025),black,.001)
for x in (-.034,.034):
 for z in (.262,.226):
  cyl('K8_XLR_connector_rim',(x,-.130,z),.010,.004,silver)
  cyl('K8_XLR_dark_socket',(x,-.1325,z),.0075,.0015,black)
  for a in (0,2*math.pi/3,4*math.pi/3):cyl('K8_XLR_pin',(x+math.cos(a)*.003,-.1338,z+math.sin(a)*.003),.0008,.001,silver,vertices=8)
for x in (-.052,.052):
 cyl('K8_Gain_control',(x,-.131,.191),.010,.006,rubber)
 box('K8_Gain_pointer',(x,-.1342,.197),(.0012,.0003,.004),white)
cyl('K8_Mix_output',(0,-.130,.194),.009,.003,silver)
cyl('K8_Cooling_fan',(0,-.129,.14),.022,.002,black)
for i in range(5):box('K8_Fan_guard',(0,-.131,.123+i*.008),(.038,.001,.0012),steel)
box('K8_IEC_power_socket',(-.039,-.13,.087),(.025,.005,.019),black,.002)
box('K8_Power_switch',(.038,-.13,.087),(.012,.006,.018),black,.001)
for x in (-.055,.055):text('K8_Rear_channel_label','GAIN',(x,-.129,.177),.003,white,True)

# Normalize the evaluated envelope (including feet and grille) to the stated size.
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();corners=[]
for o in assets:
 ev=o.evaluated_get(deps);corners.extend(ev.matrix_world@Vector(c) for c in ev.bound_box)
lo=[min(v[i] for v in corners) for i in range(3)];hi=[max(v[i] for v in corners) for i in range(3)]
envelope=bpy.data.objects.new('QSC_K8_280x269x450mm',None);scene.collection.objects.link(envelope)
for o in assets:o.parent=envelope
envelope.scale=tuple(target/(hi[i]-lo[i]) for i,target in enumerate((.28,.269,.45)))
envelope.location.z=-lo[2]*envelope.scale.z;bpy.context.view_layer.update()
# Evaluate all bevels and lettering into portable meshes for the offline viewer.
deps=bpy.context.evaluated_depsgraph_get();meshes=[]
def srgb(c):return 12.92*c if c<=.0031308 else 1.055*c**(1/2.4)-.055
for o in assets:
 ev=o.evaluated_get(deps);g=ev.to_mesh();g.calc_loop_triangles()
 verts=[tuple(o.matrix_world@v.co) for v in g.vertices]
 faces=[i for t in g.loop_triangles for i in t.vertices]
 m=o.data.materials[0];p=m.node_tree.nodes.get('Principled BSDF')
 color='#'+''.join(f'{round(max(0,min(1,srgb(c)))*255):02x}' for c in m.diffuse_color[:3])
 meshes.append({'name':o.name,'vertices':[round(n,7) for v in verts for n in v],'faces':faces,'color':color,
                'metalness':round(p.inputs['Metallic'].default_value,3),'roughness':round(p.inputs['Roughness'].default_value,3)})
 ev.to_mesh_clear()
asset={'id':'K8','title':'QSC K8 PA 스피커','dimensions_m':{'width':.28,'depth':.269,'height':.45},
       'coordinates':'X right / +Y front / Z up / bottom Z=0','meshes':meshes,
       'source':'QSC K Series Spec Sheet 04/06/11 pp.1,3,4; World Mall supplied product reference',
       'precision':'Manufacturer envelope; photo-derived curvature, grille and controls. Not a manufacturer CAD file.'}
(OUT/'qsc-k8.json').write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8')
# Native-coordinate OBJ + MTL share precisely the geometry used by the viewer.
lines=['# QSC K8 280 x 269 x 450 mm; metres, +Y front, Z up, bottom Z=0','mtllib qsc-k8.mtl'];mtls=[];offset=1
for i,m in enumerate(meshes):
 name='K8_material_'+str(i);lines+=['o '+m['name'],'usemtl '+name]
 for j in range(0,len(m['vertices']),3):lines.append('v '+' '.join(str(v) for v in m['vertices'][j:j+3]))
 for j in range(0,len(m['faces']),3):lines.append('f '+' '.join(str(k+offset) for k in m['faces'][j:j+3]))
 offset+=len(m['vertices'])//3
 rgb=[int(m['color'][j:j+2],16)/255 for j in (1,3,5)]
 rgb=[n/12.92 if n<=.04045 else ((n+.055)/1.055)**2.4 for n in rgb]
 mtls+=['newmtl '+name,'Kd '+' '.join(f'{n:.6f}' for n in rgb),'d 1','']
(OUT/'qsc-k8.obj').write_text('\n'.join(lines)+'\n',encoding='utf-8');(OUT/'qsc-k8.mtl').write_text('\n'.join(mtls),encoding='utf-8')
bpy.ops.object.select_all(action='DESELECT')
for o in assets:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'qsc-k8.glb'),export_format='GLB',use_selection=True,export_apply=True)
# A separate presentation collection is excluded from asset exports.
rendercol=bpy.data.collections.new('99_Presentation');scene.collection.children.link(rendercol)
def presentation(o):
 for c in list(o.users_collection):c.objects.unlink(o)
 rendercol.objects.link(o);return o
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001));presentation(bpy.context.object);bpy.context.object.data.materials.append(mat('Studio floor',(.65,.67,.67),0,.85))
def area(loc,power,size):
 d=bpy.data.lights.new('Softbox','AREA');d.energy=power;d.shape='DISK';d.size=size
 o=bpy.data.objects.new('Softbox',d);rendercol.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.23))-o.location).to_track_quat('-Z','Y').to_euler()
area((.6,.8,1.3),15,1);area((-.7,.2,.7),8,1);area((.2,-.6,.8),12,.8)
camera=bpy.data.cameras.new('K8_Inspection');cam=bpy.data.objects.new('K8_Inspection',camera);rendercol.objects.link(cam);scene.camera=cam;camera.type='ORTHO';camera.ortho_scale=.71
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.color=(.15,.15,.15);scene.view_settings.view_transform='AgX'
for label,location in [('front',(.7,1.1,.67)),('rear',(-.7,-1.1,.67))]:
 cam.location=location;cam.rotation_euler=(Vector((0,0,.225))-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(OUT/f'qsc-k8-{label}.png');bpy.ops.render.render(write_still=True)
cam.location=(.7,1.1,.67);cam.rotation_euler=(Vector((0,0,.225))-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'qsc-k8.blend'))
print('K8 exported:',len(meshes),'meshes;',sum(len(m['faces'])//3 for m in meshes),'triangles')
