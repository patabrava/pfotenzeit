import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-reference-pass-2026-10-09')
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
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.use_fill_caps=True;curve.resolution_u=2;curve.bevel_depth=radius;curve.bevel_resolution=1;curve.resolution_u=3
 hairflow=any(n in name for n in ['Hair','Curl','Flow','Feather'])
 if hairflow:
  sp=curve.splines.new('BEZIER');sp.bezier_points.add(len(points)-1);curve.resolution_u=3
  for i,(p,co) in enumerate(zip(sp.bezier_points,points)):
   p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO';p.radius=.30+.70*math.sin(math.pi*(.10+.80*i/max(1,len(points)-1)))
 else:
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
  region=0
  centerx=sum(v.co.x for v in ob.data.vertices)/max(1,len(ob.data.vertices))
  side=0 if centerx>0 else 1
  if ob.name.startswith(('Embedded_Dog_Eye','Amber_Brown_Iris','Deep_Pupil','Eye_Highlight','Secondary_Eye_Glint')):region=1+side
  elif ob.name.startswith('Reference_Upper_Eyelid'):region=3+side
  elif ob.name.startswith('Reference_Lower_Eyelid'):region=5+side
  if region:
   attr=ob.data.attributes.get('fable_eye_region') or ob.data.attributes.new('fable_eye_region','INT','POINT')
   for v in attr.data:v.value=region
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

import random
random.seed(71)

# Reference-based lofts, garments and sculpted face surfaces; no capsule shoulders.
def mesh_object(col,name,verts,faces,color,bone='head',weights=None):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
 ob=bpy.data.objects.new(name,data);col.objects.link(ob);paint(ob,color)
 if weights:
  names={n for w in weights for n in w};groups={n:ob.vertex_groups.new(name=n) for n in names}
  for i,w in enumerate(weights):
   den=sum(w.values())
   for n,v in w.items():
    if v>0:groups[n].add([i],v/den,'REPLACE')
 else:weight(ob,bone)
 for p in data.polygons:p.use_smooth=True
 return ob

def loft(col,name,profiles,color,bone,segments=24,weightfn=None):
 # profile=(cx,cy,z,halfwidth,halfdepth); front points toward -Y.
 verts=[];faces=[];ws=[]
 for cx,cy,z,rx,ry in profiles:
  for j in range(segments):
   a=2*math.pi*j/segments
   verts.append((cx+rx*math.cos(a),cy+ry*math.sin(a),z))
   if weightfn:ws.append(weightfn(z))
 for i in range(len(profiles)-1):
  for j in range(segments):
   a=i*segments+j;b=i*segments+(j+1)%segments
   faces.append((a,b,b+segments,a+segments))
 faces += [tuple(reversed(tuple(range(segments)))),tuple((len(profiles)-1)*segments+j for j in range(segments))]
 ob=mesh_object(col,name,verts,faces,color,bone,ws if weightfn else None)
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
 return ob

def soften(ob,levels=1):
 active(ob);mod=ob.modifiers.new('Tailored_Smoothing','SUBSURF');mod.levels=levels;mod.render_levels=levels
 bpy.ops.object.modifier_apply(modifier=mod.name)
 return ob

def box(col,name,loc,scale,color,bone,bevel=.004):
 bpy.ops.mesh.primitive_cube_add(size=2,location=loc);ob=bpy.context.object;ob.name=name
 for c in list(ob.users_collection):c.objects.unlink(ob)
 col.objects.link(ob)
 for v in ob.data.vertices:v.co=Vector((v.co.x*scale[0]+loc[0],v.co.y*scale[1]+loc[1],v.co.z*scale[2]+loc[2]))
 ob.location=(0,0,0);paint(ob,color);weight(ob,bone)
 if bevel:
  active(ob);mod=ob.modifiers.new('Rounded_Edges','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in ob.data.polygons:p.use_smooth=True
 return ob

def patch(col,name,points,color,bone):
 return mesh_object(col,name,points,[tuple(range(len(points)))],color,bone)

def blend(a,b,t):return tuple(a[k]*(1-t)+b[k]*t for k in range(3))
def clamp(v):return max(0,min(1,v))

def tapered_lock(col,name,start,end,width,color,bone):
 # Small solid tapered fur/hair ribbon: broad root and a soft pointed tip.
 p=Vector(start);q=Vector(end);direction=(q-p).normalized();side=direction.cross(Vector((0,-1,.3))).normalized()*width
 normal=direction.cross(side).normalized()*width*.33
 mid=p.lerp(q,.55)
 verts=[p-side,p+side,p+normal,p-normal,mid-side*.65,mid+side*.65,mid+normal*.6,mid-normal*.6,q]
 faces=[(0,2,1,3),(0,4,6,2),(2,6,5,1),(1,5,7,3),(3,7,4,0),(4,8,6),(6,8,5),(5,8,7),(7,8,4)]
 return mesh_object(col,name,verts,faces,color,bone)

material=bpy.data.materials.new('Reference_Vertex_Surface');material.use_nodes=True
bs=material.node_tree.nodes.get('Principled BSDF');vc=material.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color'
material.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.70;bs.inputs['Specular IOR Level'].default_value=.27
metrics={}
for asset in ['human_mira','human_alex']:
 col=bpy.data.collections['AFTER_'+asset];col.hide_viewport=False
 oldmesh=next(o for o in col.objects if o.type=='MESH');arm=next(o for o in col.objects if o.type=='ARMATURE')
 bpy.data.objects.remove(oldmesh,do_unlink=True)
 mira=asset=='human_mira';dz=0 if mira else .060;parts=[]
 skin=linear('#AE7C5D' if mira else '#D1AC8B');shadow=linear('#8D5E47' if mira else '#BC8C6D');hair=linear('#29201B' if mira else '#211B19')
 top=linear('#53634C' if mira else '#AD6958');cloth=linear('#D9CEB5' if mira else '#444441');cream=linear('#F0E8D8');sole=linear('#D9D5C8');stitch=linear('#768064' if mira else '#BF8070')
 def torso_weights(z):
  if z>1.30+dz:return {'chest':1}
  if z<.98+dz:return {'hips':1}
  t=clamp((z-1.05-dz)/.28);return {'spine':1-t,'chest':t}
 # Natural torso: chest to waist taper, sloped trapezius into collar.
 profiles=[(0,0,.935+dz,.151,.085),(0,0,1.00+dz,.146,.081),(0,0,1.12+dz,.128,.077),(0,-.001,1.25+dz,.157,.087),(0,.002,1.34+dz,.170,.078),(0,.005,1.385+dz,.174,.070),(0,.004,1.416+dz,.132,.061),(0,.005,1.445+dz,.075,.048)]
 torso=soften(loft(col,'Tailored_Open_Jacket' if mira else 'Soft_Sweatshirt',profiles,top,'chest',24,torso_weights))
 # Separate under-shirt appears through a clean surface painted opening, never on the sleeves.
 if mira:
  ca=torso.data.color_attributes.active_color
  for v in torso.data.vertices:
   x,y,z=v.co
   if y<-.035 and abs(x)<(.040+.006*clamp((z-1.22)/.20)):
    ca.data[v.index].color=(*cream,1)
 parts.append(torso)
 parts.append(soften(loft(col,'Natural_Neck',[(0,.006,1.40+dz,.043,.038),(0,.006,1.475+dz,.039,.036),(0,.008,1.505+dz,.052,.046)],skin,'head',16)))
 # Hips join naturally with two tailored leg openings.
 hips=soften(loft(col,'Trouser_Hips',[(0,0,.825+dz,.155,.092),(0,0,.905+dz,.169,.094),(0,0,.97+dz,.148,.082)],cloth,'hips',24));parts.append(hips)
 for side,sign in [('l',1),('r',-1)]:
  legx=sign*.105
  # Shaped thigh, calf and ankle, with subtle fabric creases.
  profiles=[(legx,0,.90+dz,.073,.085),(legx,.003,.78+dz*.7,.070,.080),(legx,0,.64+dz*.55,.064,.065),(legx,-.007,.47+dz*.25,.055,.061),(legx,.003,.39+dz*.2,.057,.067),(legx,.005,.28+dz*.1,.052,.060),(legx,.001,.145,.045,.048),(legx,-.002,.093,.047,.047)]
  def lw(z,s=side):
   t=clamp((z-(.39+dz*.2))/.14);return {'upper_leg_'+s:t,'lower_leg_'+s:1-t}
  parts.append(soften(loft(col,'Cargo_Leg_'+side,profiles,cloth,'upper_leg_'+side,20,lw)))
  parts.append(loft(col,'Rolled_Ankle_Cuff_'+side,[(legx,0,.088,.048,.049),(legx,0,.111,.049,.050),(legx,0,.121,.047,.048)],blend(cloth,cream,.14),'lower_leg_'+side,20))
  # Cargo pocket is on outer thigh, with a raised flap and restrained stitching.
  loc=(legx+sign*.061,-.005,.67+dz*.55)
  parts.append(box(col,'Cargo_Pocket_'+side,loc,(.009,.056,.072),blend(cloth,shadow,.08),'upper_leg_'+side,.007))
  parts.append(box(col,'Cargo_Flap_'+side,(loc[0]+sign*.003,loc[1]-.001,loc[2]+.052),(.011,.058,.020),blend(cloth,cream,.06),'upper_leg_'+side,.004))
  # Skin forearm, rolled sleeves: independently colored connected lofts.
  sx=sign*(.182 if mira else .19)
  sy=.007
  armprofiles=[(sx,sy,1.398+dz,.057,.052),(sx+sign*.018,sy,1.35+dz,.056,.051),(sx+sign*.019,0,1.24+dz*.85,.047,.047),(sx+sign*.023,-.002,1.115+dz*.65,.043,.042),(sx+sign*.025,-.004,1.075+dz*.65,.047,.044)]
  def aw(z,s=side):
   t=clamp((z-(1.07+dz*.6))/.15);return {'upper_arm_'+s:t,'lower_arm_'+s:1-t}
  parts.append(soften(loft(col,'Rolled_Sleeve_'+side,armprofiles,top,'upper_arm_'+side,20,aw)))
  parts.append(loft(col,'Sleeve_Cuff_'+side,[(sx+sign*.025,-.004,1.065+dz*.65,.047,.044),(sx+sign*.025,-.004,1.091+dz*.65,.049,.046),(sx+sign*.025,-.004,1.109+dz*.65,.045,.043)],blend(top,cream,.12),'lower_arm_'+side,20))
  fore=[(sx+sign*.026,-.002,1.083+dz*.65,.037,.036),(sx+sign*.029,-.004,1.02+dz*.5,.040,.037),(sx+sign*.034,-.010,.929+dz*.5,.032,.031),(sx+sign*.035,-.012,.857+dz*.5,.024,.025)]
  parts.append(soften(loft(col,'Natural_Forearm_'+side,fore,skin,'lower_arm_'+side,16)))
  # Relaxed hands, finger length variation and nails.
  palm=Vector((sx+sign*.035,-.013,.827+dz*.5))
  parts.append(ellipsoid(col,'Palm_'+side,palm,(.026,.022,.042),skin,'hand_'+side,16,10))
  for j in range(4):
   length=[.023,.030,.028,.021][j];x=palm.x+sign*(j-1.5)*.0105
   parts.append(ellipsoid(col,'Finger_'+side,(x,palm.y-.004,palm.z-.036-length*.48),(.0059,.011,length),skin,'hand_'+side,10,7))
   parts.append(ellipsoid(col,'Fingernail_'+side,(x,palm.y-.014,palm.z-.042-length*.85),(.0038,.001,.005),blend(skin,cream,.22),'hand_'+side,8,5))
  thumb=ellipsoid(col,'Thumb_'+side,palm+Vector((-sign*.025,-.003,-.017)),(.011,.013,.025),skin,'hand_'+side,12,8);parts.append(thumb)
  # Sneakers: upper has toe/heel shape, a separate cream sole, tongue, toe cap and laces.
  shoe=linear('#5E654C' if mira else '#B6AEA0')
  parts.append(ellipsoid(col,'Sneaker_Upper_'+side,(legx,-.038,.052),(.050,.109,.040),shoe,'foot_'+side,20,10))
  sol=ellipsoid(col,'Sneaker_Sole_'+side,(legx,-.039,.017),(.053,.112,.017),sole,'foot_'+side,20,8)
  for v in sol.data.vertices:
   if v.co.z<.009:v.co.z=.004
  parts.append(sol)
  parts.append(ellipsoid(col,'Sneaker_Toecap_'+side,(legx,-.109,.035),(.049,.046,.026),blend(shoe,cream,.20),'foot_'+side,16,8))
  parts.append(box(col,'Sneaker_Tongue_'+side,(legx,-.014,.088),(.020,.027,.006),blend(shoe,shadow,.15),'foot_'+side,.003))
  for j in range(5):
   y=-.076+j*.012;z=.079+.009*math.sin(j*math.pi/5)
   parts.append(tube(col,'Sneaker_Lace_'+side,[(legx-.020,y,z),(legx,y+.003,z+.003),(legx+.020,y+.001,z)],.0018,cream,'foot_'+side))
  parts.append(tube(col,'Sneaker_Side_Seam_'+side,[(legx+sign*.047,-.105,.041),(legx+sign*.051,-.030,.044),(legx+sign*.047,.037,.041)],.0015,sole,'foot_'+side))
 # Waist hem, belt and garment hardware.
 parts.append(loft(col,'Waist_Hem',[(0,0,.948+dz,.151,.086),(0,0,.968+dz,.152,.087)],blend(top,shadow,.08),'hips',32))
 if mira:
  parts.append(loft(col,'Leather_Belt',[(0,0,.948,.153,.087),(0,0,.964,.153,.087)],linear('#514A38'),'hips',32))
  parts.append(box(col,'Belt_Buckle',(0,-.089,.956),(.020,.006,.012),linear('#B7AE91'),'hips',.003))
  parts.append(box(col,'Treat_Pouch',(-.172,-.037,.932),(.038,.034,.049),linear('#5A5140'),'hips',.010))
  parts.append(box(col,'Pouch_Flap',(-.172,-.071,.960),(.038,.006,.024),linear('#71664E'),'hips',.006))
  for sign in [1,-1]:
   # Shirt-jacket collar, chest pockets, central seam and buttons.
   parts.append(patch(col,'Folded_Collar',[(sign*.035,-.057,1.445),(sign*.078,-.067,1.419),(sign*.057,-.088,1.354),(sign*.026,-.086,1.403)],blend(top,cream,.08),'chest'))
   parts.append(box(col,'Jacket_Chest_Pocket',(sign*.097,-.075,1.29),(.031,.005,.037),blend(top,shadow,.06),'chest',.005))
   parts.append(box(col,'Chest_Pocket_Flap',(sign*.097,-.081,1.315),(.032,.004,.010),blend(top,cream,.08),'chest',.003))
   parts.append(tube(col,'Jacket_Front_Edge',[(sign*.049,-.089,.99),(sign*.045,-.083,1.13),(sign*.046,-.087,1.25),(sign*.043,-.077,1.38)],.0017,blend(top,cream,.15),'chest'))
  for z in [1.32,1.20,1.08,1.00]:parts.append(ellipsoid(col,'Jacket_Button',(.052,-.088,z),(.0028,.002,.0028),linear('#B9AF91'),'chest',8,6))
 else:
  # Ribbed round neck, waistband, shoulder seams and sleeve creases.
  parts.append(loft(col,'Sweatshirt_Collar',[(0,.004,1.440+dz,.059,.051),(0,.004,1.452+dz,.058,.050)],blend(top,shadow,.1),'chest',32))
  for sign in [-1,1]:
   parts.append(tube(col,'Shoulder_Seam',[(sign*.065,.006,1.442+dz),(sign*.14,-.03,1.414+dz),(sign*.18,-.04,1.376+dz)],.0015,stitch,'chest'))
   for z in [1.20,1.25]:parts.append(tube(col,'Sleeve_Fabric_Fold',[(sign*.168,-.043,z+dz*.8),(sign*.195,-.050,z+.012+dz*.8),(sign*.231,-.038,z+dz*.8)],.0021,blend(top,shadow,.1),'upper_arm_'+('l' if sign==1 else 'r')))
 # Fuse trouser hips and thighs into one continuous tailored shape.
 trouser_parts=[o for o in parts if o.name.startswith(('Trouser_Hips','Cargo_Leg_'))]
 for o in trouser_parts:parts.remove(o)
 trousers_source=combine(trouser_parts,arm,'Trouser_Union_Source',col,material)
 tailored=remesh(trousers_source,set(range(len(trousers_source.data.vertices))),col,'Continuous_Cargo_Trousers',.0055,3600)
 bpy.data.objects.remove(trousers_source,do_unlink=True);parts.append(tailored)
 # Small sculpted fabric folds, concentrated at knee and ankle.
 for v in tailored.data.vertices:
  x,y,z=v.co
  t=math.exp(-((z-.43-dz*.2)/.07)**2)+.8*math.exp(-((z-.15)/.04)**2)
  v.co.y+=.0018*math.sin(z*170+x*21)*t
 # Fuse the shoulder/sleeve roots into a single tailored surface.
 garment_parts=[o for o in parts if o.name.startswith(('Tailored_Open_Jacket','Soft_Sweatshirt','Rolled_Sleeve_'))]
 for o in garment_parts:parts.remove(o)
 garment=combine(garment_parts,arm,'Garment_Union_Source',col,material)
 clean=remesh(garment,set(range(len(garment.data.vertices))),col,'Continuous_Tailored_Garment',.0055,3900)
 bpy.data.objects.remove(garment,do_unlink=True);parts.append(clean)
 # Sculpted adult head, shaped cheeks, eye sockets, jaw and chin.
 hc=1.568+dz
 def headwidth(t):return (.079 if mira else .084)*((.73 if mira else .82)+(.27 if mira else .18)*math.exp(-((t-.04)/.55)**2))
 profiles=[]
 for j in range(25):
  t=-1+2*j/24;root=math.sqrt(max(.0004,1-t*t));z=hc+t*.112
  width=headwidth(t)*root
  depth=.084*root
  # Lower face tapers to a chin; forehead is less spherical.
  cy=.006 + .010*clamp(-t)
  profiles.append((0,cy,z,width,depth))
 head=loft(col,'Sculpted_Adult_Face',profiles,skin,'head',40)
 for v in head.data.vertices:
  x,y,z=v.co;t=(z-hc)/.112
  if y<.005:
   # Flatter facial plane with cheeks, orbit recession and nasolabial contour.
   front=clamp((.005-y)/.06)
   cheek=.009*math.exp(-((abs(x)-.048)/.025)**2-((z-hc+.020)/.025)**2)
   orbit=.008*math.exp(-((abs(x)-.031)/.020)**2-((z-hc-.020)/.017)**2)
   v.co.y+=(orbit-cheek)*front
   v.co.y-=.005*math.exp(-(x/.027)**2-((z-hc+.062)/.025)**2)*front
 # Paint soft cheek/lip warmth without lighting baked into the skin.
 ca=head.data.color_attributes.active_color
 for v in head.data.vertices:
  x,y,z=v.co;t=.11*math.exp(-((abs(x)-.045)/.025)**2-((z-hc+.022)/.020)**2)*clamp(-y/.06)
  ca.data[v.index].color=(*blend(skin,linear('#B77663' if mira else '#C9947E'),t),1)
 parts.append(head)
 # Front facial surface lookup makes lids/eyes lie inside their sockets.
 headbvh=BVHTree.FromPolygons([v.co for v in head.data.vertices],[list(p.vertices) for p in head.data.polygons])
 def facey(x,z,offset=0):
  hit=headbvh.ray_cast(Vector((x,-.3,z)),Vector((0,1,0)))
  return (hit[0].y if hit[0] is not None else -.07)-offset
 # Sculpted nose is a soft bridge and nostril wings, not a sphere stuck on the face.
 noseprofiles=[(0,facey(0,hc+.015)-.001,hc+.015,.0045,.003),(0,facey(0,hc+.004)-.004,hc+.004,.0055,.004),(0,facey(0,hc-.013)-.010,hc-.013,.008,.008),(0,facey(0,hc-.022)-.008,hc-.022,.0105 if mira else .009,.0065),(0,facey(0,hc-.027)-.003,hc-.027,.006,.003)]
 parts.append(soften(loft(col,'Defined_Nose',noseprofiles,skin,'head',12)))
 for sign in [-1,1]:
  parts.append(ellipsoid(col,'Nose_Wing',(sign*.010,facey(sign*.01,hc-.025)-.009,hc-.025),(.0045,.005,.0035),skin,'head',12,8))
  parts.append(ellipsoid(col,'Nostril',(sign*.0085,facey(sign*.01,hc-.028)-.013,hc-.028),(.0022,.001,.0013),shadow,'head',10,6))
  x=sign*.031;z=hc+.023;y=facey(x,z,.002)
  # Almond aperture and layered iris, mostly embedded rather than protruding.
  eye=ellipsoid(col,'Almond_Eye',(x,y+.002,z),(.014,.0055,.0060),linear('#E5D8C6'),'head',20,10);parts.append(eye)
  parts.append(ellipsoid(col,'Hazel_Iris',(x,y-.005,z-.0005),(.0059,.0018,.0059),linear('#6E4931'),'head',16,10))
  parts.append(ellipsoid(col,'Eye_Pupil',(x,y-.007,z-.0005),(.0030,.0011,.0033),linear('#201511'),'head',12,8))
  parts.append(ellipsoid(col,'Eye_Glint',(x-.002,y-.0084,z+.002),(.0014,.0008,.0014),cream,'head',8,5))
  for upper in [True,False]:
   pts=[]
   for j in range(15):
    a=math.pi*j/14;xx=x+.015*math.cos(a);zz=z+(1 if upper else -1)*.0060*math.sin(a)
    pts.append((xx,facey(xx,zz,.003),zz))
   parts.append(tube(col,'Anatomic_Eyelid',pts,.0018,skin,'head'))
  brow=[]
  for j in range(10):
   xx=x-.017+.034*j/9;zz=z+.014+(.004 if mira else .0015)*math.sin(math.pi*j/9)
   brow.append((xx,facey(xx,zz,.002),zz))
  parts.append(tube(col,'Natural_Brow',brow,.0015 if mira else .0019,hair,'head'))
  # Ears with helix and warm recessed concha.
  ear=(sign*.080,.010,hc+.004)
  parts.append(ellipsoid(col,'Ear_Helix',ear,(.012,.017,.025),skin,'head',16,10))
  parts.append(ellipsoid(col,'Ear_Concha',(sign*.085,-.003,hc+.004),(.006,.006,.013),shadow,'head',12,8))
 # Defined upper/lower lips with restrained closed expression.
 lip=linear('#AA795F' if mira else '#C1937D');z=hc-.050
 for upper in [True,False]:
  pts=[]
  for j in range(19):
   x=-.025+.050*j/18;zz=z+.003*(abs(x)/.025)**2+( .0013*math.cos(x/.025*math.pi) if upper else -.0018*math.sin(math.pi*j/18))
   pts.append((x,facey(x,zz,.004),zz))
  parts.append(tube(col,'Soft_Lip',pts,.0015 if mira else .0011,lip,'head'))
 parts.append(tube(col,'Mouth_Closure',[(x,facey(x,z,.003),z+.003*(abs(x)/.025)**2-.0003) for x in [-.024,-.012,0,.012,.024]],.0004,shadow,'head'))
 # Hair cap follows the skull. Curves build coherent flow rather than rows of beads.
 cap=loft(col,'Fitted_Hair_Cap',[(0,.014,hc+.043,.079,.080),(0,.019,hc+.076,.071,.074),(0,.022,hc+.102,.050,.057),(0,.022,hc+.119,.017,.021)],hair,'head',32);parts.append(soften(cap))
 if mira:
  bunpos=Vector((-.021,.065,hc+.095))
  parts.append(ellipsoid(col,'Curly_Bun',bunpos,(.041,.038,.037),hair,'head',20,12))
  for j in range(38):
   a=j*2.39996;u=-.85+1.7*(j/37);r=math.sqrt(1-u*u)
   c=bunpos+Vector((math.cos(a)*r*.035,math.sin(a)*r*.031,u*.033))
   parts.append(ellipsoid(col,'Bun_Curl',c,(.011,.010,.010),blend(hair,linear('#5B4637'),random.uniform(0,.22)),'head',8,6))
  # Short overlapping curl clusters follow the scalp and gather into the back bun.
  for j in range(30):
   a=j*2.39996;t=.16+.78*(j/29);rad=.079*math.sqrt(1-t*t)
   c=Vector((math.cos(a)*rad,.016+math.sin(a)*rad,hc+.048+.072*t))
   parts.append(ellipsoid(col,'Scalp_Curl_Cluster',c,(.011,.012,.010),blend(hair,linear('#4E382A'),random.uniform(.02,.22)),'head',10,7))
  # Two loose spirals on each temple, rather than parallel thick zigzags.
  for sign in [-1,1]:
   for j in range(2):
    pts=[]
    for k in range(18):
     t=k/17;a=t*math.pi*4;pts.append((sign*(.068+.006*j+.0035*math.sin(a)),-.043+.0035*math.cos(a),hc+.066-t*(.118+.010*j)))
    parts.append(tube(col,'Loose_Temple_Curl',pts,.0016,hair,'head'))
 else:
  # An asymmetrical swept mass and varied fine flow replace the uniform roller quiff.
  quiff=ellipsoid(col,'Swept_Quiff_Mass',(-.012,-.010,hc+.087),(.066,.068,.033),hair,'head',28,12)
  for v in quiff.data.vertices:
   v.co.z+=.009*math.sin((v.co.x+.060)/.13*math.pi)
   v.co.x+=.008*clamp((v.co.z-hc-.07)/.06)
  parts.append(quiff)
  for j in range(13):
   x=-.064+j*.010;variation=.003*math.sin(j*2.1)
   pts=[(x,-.048,hc+.066+variation),(x-.005,-.056,hc+.095+variation),(x+.007,-.015,hc+.118+variation),(x+.023,.032,hc+.093+variation)]
   parts.append(tube(col,'Swept_Hair_Flow',pts,.0018,blend(hair,linear('#554335'),.14),'head'))
  for j in range(10):
   a=2*math.pi*j/10;pts=[]
   for k in range(5):
    t=k/4;pts.append((.075*math.cos(a)*(1-.25*t),.018+.075*math.sin(a)*(1-.20*t),hc+.033+t*.063))
   parts.append(tube(col,'Short_Hair_Flow',pts,.0012,blend(hair,linear('#5E5044'),.12),'head'))
 # Relaxed reference A-stance: elbows and wrists open slightly away from the body.
 for part in parts:
  for v in part.data.vertices:
   names={part.vertex_groups[g.group].name:g.weight for g in v.groups}
   armw=sum(w for n,w in names.items() if n.startswith(('upper_arm_','lower_arm_','hand_')))
   if armw>.2:
    sign=1 if v.co.x>0 else -1
    v.co.x+=sign*.034*clamp((1.20+dz*.7-v.co.z)/.38)*armw
 new=combine(parts,arm,asset+'_Reference',col,material)
 active(new);new.data.calc_loop_triangles()
 if len(new.data.loop_triangles)>15600:
  mod=new.modifiers.new('Reference_Mobile_Budget','DECIMATE');mod.ratio=15500/len(new.data.loop_triangles);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 new.data.calc_loop_triangles();metrics[asset]={'triangles':len(new.data.loop_triangles),'vertices':len(new.data.vertices),'bones':len(arm.data.bones)}
 new['asset_id']=asset;new['provenance']='Reference-led Blender code-authored mesh via official MCP; not final production art'
 col.hide_viewport=True;col.hide_render=True
for asset in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy']:
 col=bpy.data.collections['AFTER_'+asset];col.hide_viewport=False
 old=next(o for o in col.objects if o.type=='MESH');arm=next(o for o in col.objects if o.type=='ARMATURE')
 old.hide_set(False)
 # Remove the previous protruding eyes/lids; new apertures are fitted to the head surface.
 attr=old.data.attributes.get('fable_eye_region')
 keep={v.index for v in old.data.vertices if (not attr or attr.data[v.index].value==0) and not ('bruno' in asset and sum(g.weight for g in v.groups if old.vertex_groups[g.group].name.startswith('ear_'))>.5)}
 body=subset(old,keep,col,'Reference_Dog_Surface');bpy.data.objects.remove(old,do_unlink=True)
 parts=[body];bruno='bruno' in asset;growing='growing' in asset
 comp=json.loads((BASE/'reports'/f'{asset}_components.json').read_text())
 hc=Vector([(comp[3]['bounds'][0][k]+comp[3]['bounds'][1][k])/2 for k in range(3)])
 sf=1.0 if not growing else 1.18
 fur=linear('#855334' if bruno else '#C78D4F');furLight=linear('#A16A46' if bruno else '#D9A86C');cream=linear('#EEE4D3');furDark=linear('#7B492F' if bruno else '#AD713C');sage=linear('#D79B60' if bruno else '#738365');hardware=linear('#43483E')
 # Rest silhouette is closer to the sheet: tapered cranium, shaped muzzle, slimmer hips.
 # Maintain rig locations and inherited bind weights; geometry alone is refined.
 original_colors=get_colors(body)
 paint(body,fur)
 ca=body.data.color_attributes.active_color
 for i,c in enumerate(original_colors):ca.data[i].color=(*c,1)
 for v in body.data.vertices:
  x,y,z=v.co;w={body.vertex_groups[g.group].name:g.weight for g in v.groups}
  headw=w.get('head',0)+w.get('jaw',0)
  earw=sum(a for n,a in w.items() if n.startswith('ear_'))
  tailw=sum(a for n,a in w.items() if n.startswith('tail_'))
  harness_color=(bruno and ca.data[v.index].color[0]>.62 and .24<ca.data[v.index].color[1]<.53 and .1<ca.data[v.index].color[2]<.31) or (ca.data[v.index].color[1] > ca.data[v.index].color[0]*.85 and ca.data[v.index].color[2]>ca.data[v.index].color[0]*.35 and ca.data[v.index].color[0]<.5)
  if headw>.7 and not earw:
   # Take the rounded forehead down, flatten broad cheeks, widen the muzzle.
   t=clamp((z-hc.z)/(.065*sf));v.co.z-=.0065*sf*t*t
   if y<hc.y-.035*sf:
    muzzle=math.exp(-((z-hc.z+.014*sf)/(.035*sf))**2)*clamp((hc.y-y-.022*sf)/(.045*sf))
    v.co.x*=1+.19*muzzle
   if y>hc.y-.022*sf:v.co.x*=.92
   low=clamp((hc.z-.020*sf-z)/(.048*sf));v.co.x*=1-.12*low;v.co.z+=.009*sf*low
  if earw>.4:
   sign=1 if x>0 else -1
   # Ear silhouette follows a broad teardrop, with rounded feathered tips.
   v.co.y=hc.y+.010*sf+(y-hc.y-.010*sf)*1.08
  if tailw>.05:
   u=clamp((y-.185*sf)/(.215*sf));v.co.z-=.072*sf*u
   v.co.x*=1.1
  if abs(x)>.035 and .045*sf<y<.16*sf and .085*sf<z<.2*sf:
   # Eliminate the baseline's spherical rear haunch silhouette.
   v.co.x*=.88
  # Preserve clean cream identity markings; remove the blurred sticker-like stripe.
  if harness_color:
   ca.data[v.index].color=(*sage,1)
  else:
   oldc=tuple(ca.data[v.index].color[:3]);is_nose=oldc[0]<.08 and headw>.7
   if not is_nose:
    q=v.co;white=0
    if headw>.7:
     muzzle=clamp((hc.y-q.y-.040*sf)/(.020*sf))*clamp((hc.z+.013*sf-q.z)/(.015*sf))
     forehead=clamp((.0045*sf-abs(q.x))/(.0015*sf))*clamp((hc.y-q.y-.040*sf)/(.01*sf))*clamp((q.z-hc.z-.022*sf)/(.015*sf))
     muzzle*=clamp((.044*sf-abs(q.x))/(.012*sf))
     white=max(muzzle,forehead)
    elif q.z<.075*sf:
     white=clamp((.060*sf-q.z)/(.019*sf))
    elif q.y<-.09*sf and q.z<.25*sf:
     white=clamp((-.080*sf-q.y)/(.045*sf))*clamp((.255*sf-q.z)/(.018*sf))*clamp((.045*sf-abs(q.x))/(.016*sf))
    if bruno and tailw>.5 and q.y>.34*sf:white=1
    variation=.05*math.sin(q.x*270+q.y*123+q.z*81)+.035*math.sin(q.x*811-q.y*733+q.z*253)
    c=blend(fur,furLight,.12+variation)
    ca.data[v.index].color=(*blend(c,cream,white),1)
 body.data.update()
 # Bruno's folded ears are shaped as soft hanging pads, not the baseline's raised wedges.
 if bruno:
  for sign,label in [(1,'l'),(-1,'r')]:
   ep=[(sign*.064*sf,hc.y+.006*sf,hc.z+.058*sf,.006*sf,.018*sf),(sign*.084*sf,hc.y+.012*sf,hc.z+.037*sf,.011*sf,.029*sf),(sign*.096*sf,hc.y+.013*sf,hc.z+.003*sf,.011*sf,.034*sf),(sign*.096*sf,hc.y+.012*sf,hc.z-.043*sf,.009*sf,.029*sf),(sign*.088*sf,hc.y+.016*sf,hc.z-.076*sf,.004*sf,.016*sf)]
   def ew(z,s=label):
    t=clamp((hc.z+.025*sf-z)/(.10*sf));return {'ear_'+s+'_01':1-t,'ear_'+s+'_02':t}
   ear=soften(loft(col,'Bruno_Folded_Ear',ep,fur,'ear_'+label+'_01',16,ew));parts.append(ear)
 # Query the sculpted surface to fit facial details and keep eyes embedded.
 bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],[list(p.vertices) for p in body.data.polygons])
 def fronty(x,z):
  hit=bvh.ray_cast(Vector((x,-.65,z)),Vector((0,1,0)))
  return hit[0].y if hit[0] is not None else hc.y-.060*sf
 for sign in [-1,1]:
  ex=sign*.030*sf;ez=hc.z+.015*sf;ey=fronty(ex,ez)
  r=.0125*sf
  def eye_disk(name,rx,rz,clr,offset):
   verts=[(ex,fronty(ex,ez)-offset,ez)];faces=[];segments=32;rings=5
   for ring in range(1,rings+1):
    r=ring/rings
    for j in range(segments):
     a=2*math.pi*j/segments;xx=ex+rx*r*math.cos(a);zz=ez+rz*r*math.sin(a)
     verts.append((xx,fronty(xx,zz)-offset,zz))
   for j in range(segments):faces.append((0,1+j,1+(j+1)%segments))
   for ring in range(rings-1):
    for j in range(segments):
     a=1+ring*segments+j;b=1+ring*segments+(j+1)%segments
     faces.append((a,b,b+segments,a+segments))
   return mesh_object(col,name,verts,faces,clr,'head')
  parts.append(eye_disk('Embedded_Dog_Eye',r,r*1.02,linear('#271C14'),.0030*sf))
  parts.append(eye_disk('Amber_Brown_Iris',.0087*sf,.0092*sf,linear('#865B38'),.0040*sf))
  parts.append(eye_disk('Deep_Pupil',.0055*sf,.0064*sf,linear('#15100C'),.0050*sf))
  parts.append(ellipsoid(col,'Eye_Highlight',(ex-.003*sf,fronty(ex-.003*sf,ez+.0043*sf)-.0060*sf,ez+.0043*sf),(.0025*sf,.0012*sf,.0027*sf),linear('#F9F2E5'),'head',12,8))
  parts.append(ellipsoid(col,'Secondary_Eye_Glint',(ex+.0036*sf,fronty(ex+.0036*sf,ez-.003*sf)-.0058*sf,ez-.003*sf),(.0009*sf,.0007*sf,.0011*sf),cream,'head',8,5))
  for upper in [True,False]:
   pts=[]
   for j in range(17):
    a=math.pi*j/16;xx=ex+r*1.05*math.cos(a);zz=ez+(1 if upper else -1)*r*(1.0 if upper else .94)*math.sin(a)
    pts.append((xx,fronty(xx,zz)-.002*sf,zz))
   parts.append(tube(col,'Reference_Upper_Eyelid' if upper else 'Reference_Lower_Eyelid',pts,.0015*sf,furDark,'head'))
  # Soft eyebrow fur pads surround the eye without the old raised brow shapes.
  for j in range(3):
   x=ex+(-.006+j*.006)*sf;z=ez+(.019+.001*math.sin(j))*sf;y=fronty(x,z)
   parts.append(tapered_lock(col,'Eye_Brow_Fur',(x,y-.0004,z),(x-sign*.002*sf,y+.001*sf,z+.004*sf),.0006*sf,furLight,'head'))
 # Nose wings, nostrils and philtrum; freckles read at the reference portrait distance.
 nc=Vector([(comp[5]['bounds'][0][k]+comp[5]['bounds'][1][k])/2 for k in range(3)])
 nose=linear('#51483E')
 parts.append(ellipsoid(col,'Velvet_Nose',nc+Vector((0,-.002*sf,0)),(.0170*sf,.0125*sf,.0108*sf),nose,'head',24,14))
 for sign in [-1,1]:
  parts.append(ellipsoid(col,'Nostril',(sign*.0092*sf,nc.y-.011*sf,nc.z-.0017*sf),(.0040*sf,.0022*sf,.0025*sf),linear('#221D17'),'head',14,8))
  for j in range(7):
   x=sign*(.012+.003*(j%3))*sf;z=nc.z-.013*sf-.0045*sf*(j//3);y=fronty(x,z)
   parts.append(ellipsoid(col,'Muzzle_Freckle',(x,y-.0006,z),(.0007*sf,.0005*sf,.0007*sf),furDark,'head',6,4))
 parts.append(tube(col,'Nose_Philtrum',[(0,nc.y-.005*sf,nc.z-.008*sf),(0,nc.y-.004*sf,nc.z-.021*sf)],.0008*sf,nose,'jaw'))
 # Tiny toe grooves add recognizable paws without changing their contact plane.
 for name,n in [('fl',26),('bl',32),('fr',38),('br',44)]:
  mn,mx=comp[n]['bounds'];c=Vector([(mn[k]+mx[k])/2 for k in range(3)])
  for dx in [-.008,.008]:
   parts.append(tube(col,'Paw_Toe_Seam',[(c.x+dx*sf,mn[1]+.005*sf,.018*sf),(c.x+dx*sf,mn[1]+.011*sf,.027*sf)],.00055*sf,blend(cream,fur,.32),'paw_'+name))
 # Fur is made from solid tapered locks (no alpha cards/particles).
 # Roots follow the surface; inherited skin weights keep the coat attached.
 faces=list(body.data.polygons);random.shuffle(faces);count=0
 for p in faces:
  if len(p.vertices)<3:continue
  center=sum((body.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
  if center.z<.105*sf:continue
  v=body.data.vertices[p.vertices[0]];weights={body.vertex_groups[g.group].name:g.weight for g in v.groups}
  dom=max(weights,key=weights.get);normal=p.normal.copy()
  ear=dom.startswith('ear_');head=dom=='head'
  # Keep the face aperture, cream muzzle and harness clear.
  if head and center.y<hc.y-.025*sf and center.z<hc.z+.043*sf:continue
  if center.z<.3*sf and -.14*sf<center.y<-.035*sf:continue
  if normal.z<-.4:continue
  if ear and abs(normal.x)<.65:continue
  # Feather the outline only; surface coat detail is baked as a normal map.
  if not ear and not (head and center.z>hc.z+.05*sf) and not (dom.startswith('tail_')) and not (center.y<-.12*sf and center.z<.27*sf):continue
  if not ear and count%3!=0:
   count+=1;continue
  direction=Vector((.004*(1 if center.x>0 else -1),.006,-.011)) if ear else Vector((0,.012,-.005))
  if head:direction=Vector((center.x*.1,.008,.006))
  if center.y<-.1*sf and not head:direction=Vector((0,-.003,-.013))
  length=(.007 if ear else .006)*sf
  root=center+normal*.0005*sf;tip=root+direction.normalized()*length+normal*.002*sf
  clr=tuple(body.data.color_attributes.active_color.data[v.index].color[:3])
  lock=tapered_lock(col,'Coat_Feathering',root,tip,.0010*sf,blend(clr,furLight,.06),'head')
  lock.vertex_groups.clear();groups={n:lock.vertex_groups.new(name=n) for n in weights}
  for n,w in weights.items():groups[n].add(list(range(len(lock.data.vertices))),w,'REPLACE')
  parts.append(lock);count+=1
  if len(parts)>60:break
 # Fine coherent coat strands on the floppy ear surfaces.
 for sign,label,n in [(1,'l',12),(-1,'r',13)]:
  mn,mx=comp[n]['bounds'];ec=Vector([(mn[k]+mx[k])/2 for k in range(3)])
  for j in range(7):
   points=[]
   for k in range(6):
    t=k/5;probe=Vector((sign*(abs(ec.x)+.003*sf+(.003*j-.009)*sf),ec.y-.025*sf,mx[2]-.013*sf-t*(mx[2]-mn[2]-.023*sf)))
    pt,norm,_,dist=bvh.find_nearest(probe)
    if pt is not None:points.append(pt+norm*.00065*sf)
   if len(points)>2:
    ob=tube(col,'Ear_Coat_Feather_Flow',points,.00045*sf,blend(fur,furLight,.28),'ear_'+label+'_01')
    ob.vertex_groups.clear();g1=ob.vertex_groups.new(name='ear_'+label+'_01');g2=ob.vertex_groups.new(name='ear_'+label+'_02')
    for v in ob.data.vertices:
     t=clamp((mx[2]-v.co.z)/max(.001,mx[2]-mn[2]));g1.add([v.index],1-t,'REPLACE');g2.add([v.index],t,'REPLACE')
    parts.append(ob)
 # Hardware and padded harness panel follow the body, rather than floating.
 # Recolor existing harness vertices from its old green/apricot into sheet tones.
 for v in body.data.vertices:
  c=tuple(ca.data[v.index].color[:3])
  if (not bruno and c[1]>c[0]*.85 and c[2]>c[0]*.35 and c[0]<.5):ca.data[v.index].color=(*sage,1)
 # A small bronze paw badge on Nala's panel matches the reference identity.
 chest=Vector((0,hc.y+.055*sf,hc.z-.085*sf));hit=bvh.ray_cast(Vector((0,-.6,chest.z)),Vector((0,1,0)))
 if hit[0] is not None:
  panelY=hit[0].y-.003*sf
  badge=linear('#B8AB80')
  if not bruno:
   parts.append(ellipsoid(col,'Harness_Paw_Badge',(0,panelY-.003*sf,chest.z),(.005*sf,.0015*sf,.0047*sf),badge,'spine_02',12,8))
   for x,z in [(-.005,.006),(0,.008),(.005,.006)]:parts.append(ellipsoid(col,'Paw_Badge_Toe',(x*sf,panelY-.003*sf,chest.z+z*sf),(.002*sf,.0013*sf,.0024*sf),badge,'spine_02',8,6))
 # Raised strap buckles and a metal leash loop at the back of the harness.
 for sign in [-1,1]:
  loc=Vector((sign*.072*sf,-.064*sf,.215*sf));pt,norm,_,_=bvh.find_nearest(loc)
  if pt is not None:
   parts.append(box(col,'Harness_Adjuster',pt+norm*.004*sf,(.004*sf,.013*sf,.011*sf),hardware,'spine_02',.002*sf))
 toppt,norm,_,_=bvh.find_nearest(Vector((0,-.064*sf,.29*sf)))
 if toppt is not None:
  pts=[toppt+Vector((.010*sf*math.cos(a),.004*sf*math.sin(a),.006*sf+.006*sf*math.sin(a))) for a in [2*math.pi*j/20 for j in range(21)]]
  parts.append(tube(col,'Harness_Leash_Ring',pts,.0014*sf,linear('#9A9D8D'),'spine_02'))
 new=combine(parts,arm,asset+'_Reference',col,material);active(new);new.data.calc_loop_triangles()
 if len(new.data.loop_triangles)>17750:
  mod=new.modifiers.new('Reference_Mobile_Budget','DECIMATE');mod.ratio=17680/len(new.data.loop_triangles);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 new.data.calc_loop_triangles();metrics[asset]={'triangles':len(new.data.loop_triangles),'vertices':len(new.data.vertices),'bones':len(arm.data.bones)}
 new['asset_id']=asset;new['provenance']='Reference-led Blender code-authored mesh via official MCP; not final production art'
 col.hide_viewport=True;col.hide_render=True
(BASE/'reports/blender_metrics.json').write_text(json.dumps(metrics,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/characters_refined.blend'))
result=metrics
