"""CC0 source adaptation on native skeletons, editable grounded IK and five semantic gestures."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Quaternion
base=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/soft-humans-2026-10-10')
reports={}
for source,name,height in [('woman','mira',1.70),('man','alex',1.76)]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(base/'original'/f'{source}.glb'))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
 mesh=max((o for o in bpy.data.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
 for o in list(bpy.data.objects):
  if o.type=='MESH' and o!=mesh:bpy.data.objects.remove(o,do_unlink=True)
 rig.animation_data_clear()
 for a in list(bpy.data.actions):bpy.data.actions.remove(a)
 for p in rig.pose.bones:p.matrix_basis.identity()
 bpy.context.view_layer.update()
 bpy.ops.wm.save_as_mainfile(filepath=str(base/f'{name}_source.blend'))
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
 bpy.ops.object.mode_set(mode='EDIT')
 for b in rig.data.edit_bones:
  if b.children:
   c=min(b.children,key=lambda c:(c.head-b.head).length)
   if (c.head-b.head).length>.001:b.length=(c.head-b.head).length
  else:b.length=2
 bpy.ops.object.mode_set(mode='OBJECT')
 world=mesh.matrix_world.copy();world=mesh.matrix_world.copy();mesh.parent=None;mesh.matrix_world=world
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mesh.parent=rig;mesh.matrix_parent_inverse=rig.matrix_world.inverted()
 # Preserve silhouette, UVs and weighted native rig while reducing imported scan geometry.
 bpy.context.view_layer.objects.active=mesh
 bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00002);bpy.ops.object.mode_set(mode='OBJECT')
 dec=mesh.modifiers.new('Mobile silhouette LOD','DECIMATE');dec.ratio=.045;dec.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=dec.name)
 for poly in mesh.data.polygons:poly.use_smooth=True
 mesh.data.set_sharp_from_angle(angle=math.radians(65))
 for mat in mesh.data.materials:
  bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  for slot,val in [('Metallic',0),('Roughness',.78),('Emission Strength',0)]:
   for link in list(bs.inputs[slot].links):mat.node_tree.links.remove(link)
   bs.inputs[slot].default_value=val
  for node in list(mat.node_tree.nodes):
   if node.type=='TEX_IMAGE' and node.image:
    if 'basecolor' in node.image.name.lower():node.image.scale(1024,1024)
    elif 'normal' in node.image.name.lower():node.image.scale(256,256)
    else:mat.node_tree.nodes.remove(node)
 coords=[mesh.matrix_world@v.co for v in mesh.data.vertices]
 factor=height/(max(v.z for v in coords)-min(v.z for v in coords))
 # Apply uniform dimensions directly to geometry and armature (unit runtime roots).
 world=mesh.matrix_world.copy();mesh.parent=None;mesh.matrix_world=world
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
 rig.scale*=factor;mesh.scale*=factor
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mesh.parent=rig;mesh.matrix_parent_inverse=rig.matrix_world.inverted()
 bpy.context.view_layer.update()
 coords=[mesh.matrix_world@v.co for v in mesh.data.vertices]
 shift=Vector((-(min(v.x for v in coords)+max(v.x for v in coords))/2,-(min(v.y for v in coords)+max(v.y for v in coords))/2,-min(v.z for v in coords)))
 rig.location+=shift
 bpy.context.view_layer.update()
 # Two-bone foot and hand targets: native head positions, no guessed bind orientations.
 controls={}
 bpy.context.view_layer.objects.active=rig
 bpy.ops.object.mode_set(mode='EDIT')
 for side in ['Left','Right']:
  for part,chain in [('Foot','Leg'),('Hand','ForeArm')]:
   bone=rig.data.edit_bones[side+part]
   control=rig.data.edit_bones.new('IK_'+side+part)
   control.head=bone.head.copy();control.tail=bone.tail.copy();control.roll=bone.roll;control.length=.06;control.use_deform=False
   controls[side+part]={'name':control.name,'position':bone.head.copy(),'chain':side+chain}
 bpy.ops.object.mode_set(mode='OBJECT')
 for key,info in controls.items():
  c=rig.pose.bones[info['chain']].constraints.new('IK');c.name='Grounded '+key;c.target=rig;c.subtarget=info['name'];c.chain_count=2;c.use_tail=True;c.iterations=64;c.influence=0
  if key.endswith('Foot'):
   c=rig.pose.bones[key].constraints.new('COPY_ROTATION');c.name='Flat shoe';c.target=rig;c.subtarget=info['name'];c.target_space='POSE';c.owner_space='POSE';c.influence=0
 bpy.context.scene.render.fps=24
 def rotate(name,angle,axis=(1,0,0)):
  p=rig.pose.bones[name];r=p.bone.matrix_local.to_quaternion();p.rotation_mode='QUATERNION';p.rotation_quaternion=r.inverted()@Quaternion(Vector(axis),angle)@r
 def move(name,delta):
  p=rig.pose.bones[name];p.location=p.bone.matrix_local.to_3x3().inverted()@Vector(delta)
 def target(key,position):
  info=controls[key];move(info['name'],Vector(position)-info['position'])
 meta={'idle':4,'greet':1.5,'gesture_explain':2,'offer_reward':2,'kneel':1.5}
 for semantic,duration in meta.items():
  action=bpy.data.actions.new(semantic);action.use_fake_user=True;rig.animation_data_create();rig.animation_data.action=action
  frames=round(duration*24)
  for f in range(frames+1):
   bpy.context.scene.frame_set(f);t=f/frames;s=t*t*(3-2*t);pulse=math.sin(t*math.tau)
   for p in rig.pose.bones:p.matrix_basis.identity();p.rotation_mode='QUATERNION'
   for p in rig.pose.bones:
    for c in p.constraints:c.influence=1
   for side,sign in [('Left',1),('Right',-1)]:
    target(side+'Hand',(sign*.24,-.04,.94))
    # Slight pre-bend gives IK a stable elbow and knee bend direction.
    rotate(side+'ForeArm',-.12);rotate(side+'Leg',.1)
   rotate('Spine',.008*pulse);rotate('Head',.025*pulse,(0,0,1))
   if semantic=='greet':
    amount=math.sin(math.pi*t)**.6
    target('RightHand',(-.24-.1*amount,-.04-.12*amount,.94+.60*amount))
    rotate('RightHand',.18*math.sin(t*math.tau*2)*amount,(0,1,0))
   if semantic=='gesture_explain':
    amount=math.sin(math.pi*t)**.5
    target('LeftHand',(.24+.06*amount,-.04-.30*amount,.94+.20*amount))
    rotate('Head',-.05*amount,(0,0,1))
   if semantic in ['kneel','offer_reward']:
    amount=s if semantic=='kneel' else math.sin(math.pi*t)**.7
    move('Hips',(0,-.06*amount,-.50*amount))
    move('IK_RightFoot',(0,.27*amount,0))
    move('IK_LeftFoot',(0,-.08*amount,0))
    target('RightHand',(-.24,-.04,.94-.45*amount))
    target('LeftHand',(.24,-.04-.38*amount,.94-.50*amount))
    rotate('Head',.14*amount)
   bpy.context.view_layer.update()
   for p in rig.pose.bones:
    p.keyframe_insert('location',frame=f,group=p.name);p.keyframe_insert('rotation_quaternion',frame=f,group=p.name)
    for c in p.constraints:c.keyframe_insert('influence',frame=f)
 rig.animation_data.action=None
 for p in rig.pose.bones:
  p.matrix_basis.identity()
  for c in p.constraints:c.influence=0
 bpy.context.view_layer.update()
 bpy.ops.wm.save_as_mainfile(filepath=str(base/f'{name}_training.blend'))
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(base/f'{name}_training.glb'),use_selection=True,export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_influence_nb=4,export_all_influences=False,export_morph=False,export_tangents=True)
 reports[name]={'vertices':len(mesh.data.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'bones':len(rig.data.bones),'height':height,'clips':list(meta)}
(base/'reports'/'blender-adaptation.json').write_text(json.dumps(reports,indent=2))
result=reports
