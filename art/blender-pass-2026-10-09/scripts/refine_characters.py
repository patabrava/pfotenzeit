import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-pass-2026-10-09')
scene=bpy.data.scenes['Pfotenzeit_Blender_Asset_Pass'];bpy.context.window.scene=scene

def linear(h):
 vals=[int(h[i:i+2],16)/255 for i in (1,3,5)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals)

def active(ob):
 bpy.ops.object.select_all(action='DESELECT');ob.hide_set(False);ob.hide_viewport=False;ob.select_set(True);bpy.context.view_layer.objects.active=ob

def subset(source, ids, col, name):
 ob=source.copy();ob.data=source.data.copy();ob.name=name;col.objects.link(ob)
 bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table()
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in ids],context='VERTS')
 bm.to_mesh(ob.data);bm.free();ob.data.update()
 return ob

def get_colors(ob):
 ca=ob.data.color_attributes.active_color
 if ca.domain=='POINT': return [tuple(d.color[:3]) for d in ca.data]
 colors=[(0,0,0)]*len(ob.data.vertices)
 for loop in ob.data.loops: colors[loop.vertex_index]=tuple(ca.data[loop.index].color[:3])
 return colors

def remesh(source, ids, col, name, voxel, target, custom=None):
 ob=subset(source,ids,col,name)
 ob.modifiers.clear()
 # The generator's cylinders have open ends; cap them before voxel solidification.
 bm=bmesh.new();bm.from_mesh(ob.data)
 boundary=[e for e in bm.edges if e.is_boundary]
 if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
 if custom:
  for v in ob.data.vertices: v.co=custom(v.co)
 positions=[v.co.copy() for v in ob.data.vertices]
 colors=get_colors(ob)
 weights=[{ob.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>1e-6} for v in ob.data.vertices]
 kd=KDTree(len(positions))
 for i,p in enumerate(positions): kd.insert(p,i)
 kd.balance()
 active(ob)
 mod=ob.modifiers.new('Continuous_Surface_Voxel','REMESH');mod.mode='VOXEL';mod.voxel_size=voxel;mod.use_smooth_shade=True
 bpy.ops.object.modifier_apply(modifier=mod.name)
 smooth=ob.modifiers.new('Surface_Relax','SMOOTH');smooth.factor=.58;smooth.iterations=4
 bpy.ops.object.modifier_apply(modifier=smooth.name)
 tri=sum(len(p.vertices)-2 for p in ob.data.polygons)
 dec=ob.modifiers.new('Mobile_Topology','DECIMATE');dec.ratio=min(1,target/max(1,tri));dec.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=dec.name)
 for attr in list(ob.data.color_attributes): ob.data.color_attributes.remove(attr)
 ca=ob.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT');ob.data.color_attributes.active_color=ca
 ob.vertex_groups.clear();groups={n:ob.vertex_groups.new(name=n) for n in source.vertex_groups.keys()}
 for v in ob.data.vertices:
  near=kd.find_n(v.co,4)
  fac=[1/(d+.0015)**2 for _,_,d in near];total=sum(fac)
  color=[sum(colors[i][k]*f for (_,i,_),f in zip(near,fac))/total for k in range(3)]
  ca.data[v.index].color=(*color,1)
  w={}
  for (_,i,_),f in zip(near,fac):
   for n,a in weights[i].items(): w[n]=w.get(n,0)+a*f/total
  best=sorted(w.items(),key=lambda x:-x[1])[:4];den=sum(a for _,a in best)
  for n,a in best: groups[n].add([v.index],a/den,'REPLACE')
 for p in ob.data.polygons: p.use_smooth=True
 return ob

def paint(ob, color):
 for a in list(ob.data.color_attributes): ob.data.color_attributes.remove(a)
 ca=ob.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT');ob.data.color_attributes.active_color=ca
 for d in ca.data: d.color=(*color,1)

def weight(ob, bone):
 ob.vertex_groups.clear();group=ob.vertex_groups.new(name=bone);group.add(list(range(len(ob.data.vertices))),1,'REPLACE')

def ellipsoid(col, name, loc, scale, color, bone, seg=16,rings=10):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=loc)
 ob=bpy.context.object;ob.name=name
 for c in list(ob.users_collection): c.objects.unlink(ob)
 col.objects.link(ob)
 # Bake local transform into positions so all parts share the model origin.
 for v in ob.data.vertices: v.co=Vector((v.co.x*scale[0]+loc[0],v.co.y*scale[1]+loc[1],v.co.z*scale[2]+loc[2]))
 ob.location=(0,0,0);paint(ob,color);weight(ob,bone)
 for p in ob.data.polygons:p.use_smooth=True
 return ob

def tube(col, name, points, radius, color, bone):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=2;curve.bevel_depth=radius;curve.bevel_resolution=1;curve.resolution_u=3
 sp=curve.splines.new('POLY');sp.points.add(len(points)-1)
 for p,co in zip(sp.points,points):p.co=(*co,1)
 ob=bpy.data.objects.new(name,curve);col.objects.link(ob);active(ob);bpy.ops.object.convert(target='MESH')
 paint(ob,color);weight(ob,bone)
 for p in ob.data.polygons:p.use_smooth=True
 return ob

def duplicate_arm(arm,col):
 ob=arm.copy();ob.data=arm.data.copy();ob.name=arm.name+'_BLENDER';col.objects.link(ob)
 ob.data.pose_position='REST'
 return ob

def combine(parts, arm, name, col, material):
 for ob in parts:
  ob.parent=None;ob.modifiers.clear()
  # Strip importer materials: merged asset uses one consistent vertex-colour material.
  ob.data.materials.clear();ob.data.materials.append(material)
  for ca in list(ob.data.color_attributes):
   if ca.name!='Color':
    ca.name='Color'
 for ob in parts: ob.hide_set(False);ob.hide_viewport=False
 bpy.ops.object.select_all(action='DESELECT')
 for ob in parts:ob.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();ob=parts[0];ob.name=name
 mod=ob.modifiers.new('Rig_Deformation','ARMATURE');mod.object=arm
 # Clamp and normalize inherited weights without changing the skeleton.
 active(ob);bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
 for p in ob.data.polygons:p.use_smooth=True
 return ob

material=bpy.data.materials.new('Pfotenzeit_Vertex_Matte');material.use_nodes=True
nodes=material.node_tree.nodes;bs=nodes.get('Principled BSDF')
vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';material.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.78
bs.inputs['Specular IOR Level'].default_value=.25
metrics={}
for asset in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex']:
 before=bpy.data.collections['BEFORE_'+asset];before.hide_render=True;before.hide_viewport=False
 source=next(o for o in before.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers))
 arm=next(o for o in before.objects if o.type=='ARMATURE')
 components=json.loads((BASE/'reports'/f'{asset}_components.json').read_text())
 def ids(ns):return set(i for n in ns for i in components[n]['ids'])
 after=bpy.data.collections.new('AFTER_'+asset);scene.collection.children.link(after)
 newarm=duplicate_arm(arm,after);parts=[]
 if asset.startswith('dog'):
  bruno='bruno' in asset;hr=(.076 if bruno else .0648 if 'growing' in asset else .072)
  color=linear('#7A4A2E' if bruno else '#C9955A');light=linear('#F4F0E8' if bruno else '#F1E3C8');dark=linear('#5E3620' if bruno else '#B07E45');sage=linear('#E4A67B' if bruno else '#8FA98A')
  bodyids=ids([0,1,2,3,4]+list(range(21,45)))
  body=remesh(source,bodyids,after,'Continuous_Dog',.0048 if 'growing' not in asset else .0052,8200)
  ca=body.data.color_attributes.active_color
  hc=Vector([(components[3]['bounds'][0][k]+components[3]['bounds'][1][k])/2 for k in range(3)])
  eyec=[Vector([(components[i]['bounds'][0][k]+components[i]['bounds'][1][k])/2 for k in range(3)]) for i in [8,10]]
  # Keep the forehead identity as a surface marking, rather than a raised sticker.
  for v in body.data.vertices:
   x,y,z=v.co
   if abs(x)<.0045*(1.3 if bruno else 1) and hc.z+.020<z<hc.z+hr*.84 and y<hc.y-hr*.5:
    ca.data[v.index].color=(*light,1)
   # Warmer honey fur, with a soft cream muzzle/bib retained from source weights.
  parts.append(body)
  details=subset(source,ids([5,6,12,13]),after,'Dog_Nose_Jaw_Ears')
  # Thicker, broader floppy ear pads: preserve their original deform weights.
  earids=ids([12,13]);earpositions=[source.data.vertices[i].co.copy() for i in earids]
  for v in details.data.vertices:
   for side,n in [(1,12),(-1,13)]:
    mn,mx=components[n]['bounds'];c=Vector([(mn[k]+mx[k])/2 for k in range(3)])
    if side*v.co.x>.049*(hr/.072) and abs(v.co.y-c.y)<.06 and abs(v.co.z-c.z)<.09:
     v.co.x=c.x+(v.co.x-c.x)*1.2;v.co.y=c.y+(v.co.y-c.y)*1.3
  parts.append(details)
  def tailshape(p):
   q=p.copy();u=max(0,min(1,(p.y-components[14]['bounds'][0][1])/.22));q.z-=.055*u;q.x*=1.25;return q
  tail=remesh(source,ids(list(range(14,21))),after,'Continuous_Tail',.0024,700,tailshape);parts.append(tail)
  # Fit original strap surfaces to the cleaned dog body with a small outward offset.
  harness=subset(source,ids(list(range(45,71))),after,'Fitted_Harness');bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],[list(p.vertices) for p in body.data.polygons])
  for v in harness.data.vertices:
   point,normal,_,dist=bvh.find_nearest(v.co)
   if point is not None and dist<.07: v.co=point+normal*.0035
  # A softly padded sternum panel helps the sheet's Y-harness read from the front.
  panel=ellipsoid(after,'Harness_Chest_Plate',(0,hc.y+.042,hc.z-.088),(hr*.33,.008,hr*.40),sage,'spine_02',20,10)
  # Project the panel onto the dog, retaining a small raised thickness.
  for v in panel.data.vertices:
   point,normal,_,dist=bvh.find_nearest(v.co)
   if point is not None:v.co=point+normal*.0045
  parts += [harness,panel]
  for side,c in zip([1,-1],eyec):
   r=hr*.215;c=c+Vector((0,-.001,.001));gaze=Vector((.28*side,-1,.04)).normalized()
   parts.append(ellipsoid(after,'Soft_Eye',c,(r,r*.9,r),linear('#352116'),'head',20,12))
   iris=c+gaze*r*.82
   irisob=ellipsoid(after,'Warm_Iris',iris,(r*.65,r*.27,r*.68),linear('#95623A'),'head',20,10)
   parts.append(irisob)
   pupil=c+gaze*r*.99
   parts.append(ellipsoid(after,'Pupil',pupil,(r*.39,r*.18,r*.44),linear('#180E0A'),'head',18,10))
   highlight=pupil+Vector((-r*.18,-r*.18,r*.25))
   parts.append(ellipsoid(after,'Eye_Catchlight',highlight,(r*.15,r*.10,r*.15),linear('#EEE7D8'),'head',10,6))
   for upper in [True,False]:
    angles=[math.pi*(.08+.84*j/12) for j in range(13)]
    points=[(c.x+math.cos(a)*r*1.02,c.y-r*.67,c.z+(1 if upper else -1)*math.sin(a)*r*(.96 if upper else .9)) for a in angles]
    parts.append(tube(after,'Soft_Lid_Rim',points,r*.07,color,'head'))
  # Closed mouth, with no perpetual grin.
  nosecenter=Vector([(components[5]['bounds'][0][k]+components[5]['bounds'][1][k])/2 for k in range(3)])
  parts.append(tube(after,'Closed_Mouth',[(-.012,nosecenter.y+.004,nosecenter.z-.024),(0,nosecenter.y-.002,nosecenter.z-.025),(.012,nosecenter.y+.004,nosecenter.z-.024)],.0008,linear('#70513B'),'jaw'))
 else:
  mira=asset=='human_mira';skin=linear('#A5704F' if mira else '#C9A17E');hair=linear('#2A1C16' if mira else '#241A16');top=linear('#326B58' if mira else '#B9623F')
  headc=Vector([(components[0]['bounds'][0][k]+components[0]['bounds'][1][k])/2 for k in range(3)])
  # Unify shoulder/sleeve junctions and hips/legs; keep face, hair and shoes separate.
  # Select body by dominant group and exclude hand, foot, head, belt and pouch details.
  body_ns=[];detail_ns=[]
  for c in components:
   group=c['groups'][0][0]
   if group.startswith(('upper_arm','lower_arm','upper_leg','lower_leg')) or (group in ['chest','hips','spine'] and c['n']>150):body_ns.append(c['id'])
   elif group not in ['hand_l','hand_r'] and c['id'] not in [5 if mira else 4,6 if mira else 5]:detail_ns.append(c['id'])
  body=remesh(source,ids(body_ns),after,'Continuous_Clothing',.0095,5000);parts.append(body)
  # Clean broad clothing blocks after transfer; no mottled seams across separate source parts.
  ca=body.data.color_attributes.active_color
  cream=linear('#E8DFCB');trousers=cream if mira else linear('#3C3F45')
  for v in body.data.vertices:
   x,y,z=v.co
   arm_weight=sum(g.weight for g in v.groups if body.vertex_groups[g.group].name.startswith(('upper_arm','lower_arm')))
   is_arm=arm_weight>.32
   def blend(a,b,t):return tuple(a[k]*(1-t)+b[k]*t for k in range(3))
   if is_arm:
    t=max(0,min(1,(z-1.065)/.012));c=blend(skin,top,t) if mira else top
   else:
    waist=.950 if mira else .985
    t=max(0,min(1,(z-waist+.004)/.008));c=blend(trousers,top,t)
    if mira and y<-.075 and z>waist:
     shirt=max(0,min(1,(.050-abs(x))/.010));c=blend(c,cream,shirt)
   ca.data[v.index].color=(*c,1)
  # Head/hair and shoe surfaces retain the source's exact rig attachments.
  details=subset(source,ids(detail_ns),after,'Face_Hair_Shoes_Details');parts.append(details)
  # Normal, understated facial anatomy rather than dots on a sphere.
  parts.append(ellipsoid(after,'Nose_Bridge',(0,headc.y-.102,headc.z-.006),(.012,.015,.023),skin,'head',18,10))
  parts.append(ellipsoid(after,'Nose_Tip',(0,headc.y-.116,headc.z-.014),(.014,.010,.012),skin,'head',16,10))
  for side in [1,-1]:
   ec=Vector((side*.033,headc.y-.101,headc.z+.012))
   parts.append(ellipsoid(after,'Eye_White',ec,(.013,.006,.009),linear('#E8DCCD'),'head',18,10))
   parts.append(ellipsoid(after,'Brown_Iris',ec+Vector((0,-.0055,0)),(.006,.0025,.0065),linear('#613A24'),'head',16,10))
   parts.append(ellipsoid(after,'Human_Pupil',ec+Vector((0,-.0075,0)),(.0033,.0018,.004),linear('#1B120F'),'head',12,8))
   parts.append(ellipsoid(after,'Human_Eye_Light',ec+Vector((-.002,-.009,.002)),(.0013,.001,.0013),linear('#F4F0E8'),'head',8,6))
   points=[(ec.x+.014*math.cos(a),ec.y-.004,ec.z+.010*math.sin(a)) for a in [math.pi*j/12 for j in range(13)]]
   parts.append(tube(after,'Upper_Eyelid',points,.0015,skin,'head'))
   points=[(ec.x+.014*(j/6-1),ec.y+.004,ec.z+.021+.003*math.sin(math.pi*j/12)) for j in range(13)]
   parts.append(tube(after,'Soft_Brow',points,.0022,hair,'head'))
  lipcolor=linear('#875944' if mira else '#AE7860')
  parts.append(tube(after,'Closed_Lips',[(-.020,headc.y-.102,headc.z-.050),(-.010,headc.y-.108,headc.z-.051),(0,headc.y-.110,headc.z-.051),(.010,headc.y-.108,headc.z-.051),(.020,headc.y-.102,headc.z-.050)],.0018,lipcolor,'head'))
  # Compact curl masses on Mira; swept short quiff on Alex. No particles or textures.
  if mira:
   for row in range(3):
    for j in range(9):
     theta=(j/8)*math.pi*1.7+.15
     rad=.086*(1-.18*row);z=headc.z+.055+row*.022
     pos=(math.sin(theta)*rad,headc.y+math.cos(theta)*rad,z)
     parts.append(ellipsoid(after,'Mira_Curl_Cluster',pos,(.018,.017,.017),hair,'head',8,6))
   for j in range(7):
    theta=j*2*math.pi/7
    parts.append(ellipsoid(after,'Bun_Curl',(math.cos(theta)*.037,headc.y+.082+math.sin(theta)*.03,headc.z+.103),(.021,.020,.019),hair,'head',8,6))
  else:
   for j in range(5):
    parts.append(ellipsoid(after,'Swept_Quiff',(-.055+j*.025,headc.y-.031+j*.009,headc.z+.095+j*.003),(.028,.058,.022),hair,'head',16,8))
  # Palm and simplified separate finger lobes, weighted to the existing hand bone.
  for side in ['l','r']:
   n=next(c for c in components if c['groups'][0][0]=='hand_'+side)
   mn,mx=n['bounds'];center=Vector([(mn[k]+mx[k])/2 for k in range(3)]);bone='hand_'+side;s=1 if side=='l' else -1
   parts.append(ellipsoid(after,'Palm',center+Vector((0,0,.014)),(.026,.032,.038),skin,bone,16,10))
   for j in range(4):
    pos=center+Vector(((j-1.5)*.011,-.015,-.019+(abs(j-1.5)*.003)))
    parts.append(ellipsoid(after,'Finger',pos,(.0065,.014,.023),skin,bone,10,8))
   parts.append(ellipsoid(after,'Thumb',center+Vector((-s*.024,-.015,.010)),(.009,.018,.025),skin,bone,12,8))
  if mira:
   # Collar and restrained jacket details fitted to the source silhouette.
   for side in [1,-1]:
    pts=[(side*.035,-.074,headc.z-.15),(side*.065,-.104,headc.z-.24),(side*.045,-.117,headc.z-.29)]
    parts.append(tube(after,'Jacket_Collar',pts,.008,top,'chest'))
   for z in [1.29,1.19,1.09]:parts.append(ellipsoid(after,'Jacket_Button',(.072,-.112,z),(.004,.002,.004),linear('#C4BDA6'),'chest',10,6))
 new=combine(parts,newarm,source.name.split('.')[0],after,material)
 new['asset_id']=asset;new['variant']='after';new['provenance']='Blender surface refinement of code-authored baseline, through official MCP'
 newarm['asset_id']=asset
 new.data.calc_loop_triangles()
 if asset.startswith('human') and len(new.data.loop_triangles)>15500:
  active(new)
  mod=new.modifiers.new('Final_Mobile_Budget','DECIMATE');mod.ratio=15480/len(new.data.loop_triangles);mod.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=mod.name)
  bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
  new.data.calc_loop_triangles()
 metrics[asset]={'triangles':len(new.data.loop_triangles),'vertices':len(new.data.vertices),'bones':len(newarm.data.bones),'parts_merged':len(parts),'materials':len(new.data.materials)}
 after.hide_render=True;after.hide_viewport=True;before.hide_viewport=True
(BASE/'reports/blender_metrics.json').write_text(json.dumps(metrics,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/characters_refined.blend'))
result=metrics
