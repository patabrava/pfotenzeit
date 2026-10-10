import bpy, json
from pathlib import Path
from mathutils import Vector
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-reference-pass-2026-10-09')
scene=bpy.data.scenes['Pfotenzeit_Blender_Asset_Pass'];bpy.context.window.scene=scene
camera=scene.camera
for ob in bpy.data.objects:
 if ob.name.startswith('Icosphere'):ob.hide_render=True
for arm in [o for o in scene.objects if o.type=='ARMATURE']:arm.data.pose_position='REST'
scene.frame_set(0)
rendered=[]
for asset in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex']:
 if asset.startswith('dog'):
  target=(0,.01,.22 if 'growing' not in asset else .26)
  scale=.79 if 'growing' not in asset else .92
  if 'bruno' in asset:scale=.84;target=(0,.01,.235)
  camera.location=Vector(target)+Vector((.85,-1.4,.6))
 else:
  target=(0,0,.88 if asset=='human_mira' else .91);scale=2.12 if asset=='human_mira' else 2.20
  camera.location=Vector(target)+Vector((.85,-1.4,.6))*2.8
 camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
 for variant in ['before','after']:
  for c in scene.collection.children:
   if c.name.startswith(('BEFORE_','AFTER_')):c.hide_render=True
  col=bpy.data.collections[variant.upper()+'_'+asset];col.hide_render=False;col.hide_viewport=False
  scene.render.filepath=str(BASE/'renders'/f'{asset}_{variant}.png')
  bpy.ops.render.render(write_still=True);rendered.append(scene.render.filepath)
  col.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/characters_refined.blend'))
result={'rendered':rendered}
