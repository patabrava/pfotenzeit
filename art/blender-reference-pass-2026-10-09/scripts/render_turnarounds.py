import bpy,json
from pathlib import Path
from mathutils import Vector
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-reference-pass-2026-10-09')
scene=bpy.context.scene;camera=scene.camera
scene.render.resolution_x=800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.cycles.samples=24
for o in scene.objects:
 if o.type=='ARMATURE':o.data.pose_position='REST'
 if o.name.startswith('Icosphere'):o.hide_render=True
scene.frame_set(0);rendered=[]
for asset in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex']:
 for c in bpy.data.collections:
  if c.name.startswith(('BEFORE_','AFTER_')):c.hide_render=True
 col=bpy.data.collections['AFTER_'+asset];col.hide_render=False;col.hide_viewport=False
 dog=asset.startswith('dog');target=Vector((0,0,.215 if dog else .86));scale=.83 if dog else 1.98
 if 'growing' in asset:target.z=.255;scale=.96
 if 'bruno' in asset:target.z=.235;scale=.88
 for view,offset in [('front',(0,-2,.03)),('side',(2,0,.03)),('back',(0,2,.03))]:
  camera.location=target+Vector(offset);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
  scene.render.filepath=str(BASE/'renders'/f'{asset}_{view}.png');bpy.ops.render.render(write_still=True);rendered.append(scene.render.filepath)
 # Close facial review: lower camera and larger on-screen features.
 target=Vector((0,-.225,.33) if dog else (0,-.01,1.57 if asset=='human_mira' else 1.63))
 camera.location=target+Vector((.23,-2,.08));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.31 if dog else .37
 scene.render.filepath=str(BASE/'renders'/f'{asset}_portrait.png');bpy.ops.render.render(write_still=True);rendered.append(scene.render.filepath)
 col.hide_render=True
result={'rendered':rendered}
