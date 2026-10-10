import bpy,json,math
from mathutils import Vector, Quaternion
from pathlib import Path
base=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/free-models-2026-10-10')
(base/'native').mkdir(exist_ok=True)
for name in ['ShibaInu','Husky']:
 bpy.ops.wm.open_mainfile(filepath=str(base/'original'/f'{name}.blend'))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE'); mesh=next(o for o in bpy.data.objects if o.type=='MESH')
 rig.animation_data_clear()
 for p in rig.pose.bones: p.matrix_basis.identity()
 bpy.context.view_layer.update()
 print(name,'verts',len(mesh.data.vertices),'bounds',min(v.co.z for v in mesh.data.vertices),max(v.co.z for v in mesh.data.vertices))
 # Preserve authored flat colours as a single material/vertex colour draw call.
 attr=mesh.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for poly in mesh.data.polygons:
  mat=mesh.data.materials[poly.material_index]; c=list(mat.diffuse_color)
  for li in poly.loop_indices: attr.data[li].color=c
 mesh.data.materials.clear();mat=bpy.data.materials.new('mat_nala_fur' if name=='ShibaInu' else 'mat_bruno_fur');mat.use_nodes=True
 nodes=mat.node_tree.nodes; bs=nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.82
 vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';mat.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color']);mesh.data.materials.append(mat)
 for poly in mesh.data.polygons:poly.material_index=0
 rig.animation_data_create()
 # Export only three appropriate authored actions. Keep combat/death outside the game.
 keep=['Idle','Eating','Walk']
 for action in list(bpy.data.actions):
  if action.name not in keep:bpy.data.actions.remove(action)
 # Author educational poses on the original IK rig; export bakes constraints.
 durations={'look_at_handler':1.5,'sniff':2.5,'sit':1.5,'lie_down':1.5,'rest_loop':5,'play_bow':1.5,'turn_away':1.5,'tense_idle':2.5,'tired_idle':3.5,'recover':2}
 rig.animation_data.action=None
 bpy.context.scene.render.fps=24
 def world_rot(bone,angle,axis=(1,0,0)):
  p=rig.pose.bones.get(bone)
  if p:
   rest=p.bone.matrix_local.to_quaternion()
   p.rotation_mode='QUATERNION';p.rotation_quaternion=rest.inverted() @ Quaternion(Vector(axis),angle) @ rest
 def world_move(bone,delta):
  p=rig.pose.bones[bone];p.location=p.bone.matrix_local.to_3x3().inverted() @ Vector(delta)
 for semantic,duration in durations.items():
  action=bpy.data.actions.new(semantic);action.use_fake_user=True;rig.animation_data.action=action
  frames=round(duration*24)
  for f in range(frames+1):
   bpy.context.scene.frame_set(f)
   t=f/frames;blend=t*t*(3-2*t);wave=math.sin(t*math.tau)
   for p in rig.pose.bones:p.matrix_basis.identity()
   if semantic=='sit':
    world_move('Body',(0,0,-1.30*blend));world_rot('Back',-.50*blend);world_rot('Neck2',.2*blend)
    for side in ['L','R']:world_move('IKBackLeg.'+side,(0,-.25*blend,0))
   if semantic in ['lie_down','rest_loop','recover']:
    amount=blend if semantic=='lie_down' else (1-blend if semantic=='recover' else 1)
    world_move('Body',(0,0,-1.43*amount));world_rot('Head',.08*amount)
    for side in ['L','R']:
     world_move('IKFrontLeg.'+side,(0,-.32*amount,0));world_move('IKBackLeg.'+side,(0,-.35*amount,0))
    if semantic=='rest_loop':world_rot('Torso2',.008*wave)
   if semantic=='look_at_handler':world_rot('Neck2',-.15*blend);world_rot('Head',-.12*blend);world_rot('Head',.12*blend,(0,0,1))
   if semantic=='sniff':world_rot('Neck2',.42+.025*wave);world_rot('Head',.15);world_rot('Head',.12*wave,(0,0,1))
   if semantic=='play_bow':
    world_move('Body',(0,0,-.2*blend));world_rot('Back',.42*blend);world_rot('Neck2',-.2*blend)
    for side in ['L','R']:world_move('IKFrontLeg.'+side,(0,-.3*blend,0))
   if semantic=='turn_away':world_rot('Neck2',-.35*blend,(0,0,1));world_rot('Head',-.30*blend,(0,0,1))
   if semantic=='tense_idle':
    world_move('Body',(0,.07,-.12));world_rot('Neck2',-.07);world_rot('Tail1',-.3)
    for side in ['L','R']:world_rot('Ear1.'+side,.28)
   if semantic=='tired_idle':world_rot('Neck2',.16+.01*wave);world_rot('Head',.12);world_move('Body',(0,0,-.04))
   bpy.context.view_layer.update()
   for p in rig.pose.bones:
    p.keyframe_insert(data_path='location',frame=f,group=p.name)
    p.rotation_mode='QUATERNION';p.keyframe_insert(data_path='rotation_quaternion',frame=f,group=p.name)
  print('Authored',name,semantic)
 rig.animation_data.action=None
 for p in rig.pose.bones:p.matrix_basis.identity()
 bpy.context.view_layer.update()
 bpy.ops.wm.save_as_mainfile(filepath=str(base/'native'/f'{name}_training.blend'))
 bpy.ops.export_scene.gltf(filepath=str(base/'native'/f'{name}.glb'),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_influence_nb=4,export_all_influences=False)
