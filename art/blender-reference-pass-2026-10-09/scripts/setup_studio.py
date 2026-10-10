import bpy, math, json
from pathlib import Path
from mathutils import Vector
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-reference-pass-2026-10-09')
for ob in bpy.data.objects:
 if ob.name.startswith('Icosphere') and ob.type=='MESH': ob.hide_render=True
scene=bpy.data.scenes['Pfotenzeit_Blender_Asset_Pass']
bpy.context.window.scene=scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=960
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('Asset_Review_World');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.65,0.65,0.65,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
scene.world=world
studio=bpy.data.collections.new('REVIEW_STUDIO');scene.collection.children.link(studio)
def link(ob):
 for c in list(ob.users_collection): c.objects.unlink(ob)
 studio.objects.link(ob)
 return ob
def aim(ob,target): ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(2,-3,4),320,3),('Fill',(-3,-1,2),130,3),('Rim',(1,3,3),240,2.5)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
 ob=bpy.data.objects.new(name,data);studio.objects.link(ob);ob.location=loc;aim(ob,(0,0,.4))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001))
floor=link(bpy.context.object);floor.name='Review_Backdrop'
mat=bpy.data.materials.new('Review_Chalk');mat.diffuse_color=(.82,.79,.73,1);mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.82,.79,.73,1);bsdf.inputs['Roughness'].default_value=.9
floor.data.materials.append(mat)
data=bpy.data.cameras.new('Review_Camera');camera=bpy.data.objects.new('Review_Camera',data);studio.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.lens=60
scene.frame_set(0)
for arm in [o for o in scene.objects if o.type=='ARMATURE']:
 arm.data.pose_position='REST'
for c in scene.collection.children:
 if c.name.startswith('BEFORE_'): c.hide_render=True
for name,scale,target in [('dog_nala_puppy',.79,(0,.01,.22)),('human_mira',2.12,(0,0,.88))]:
 col=bpy.data.collections['BEFORE_'+name];col.hide_render=False
 camera.location=Vector(target)+Vector((.85,-1.4,.60))* (1 if name.startswith('dog') else 2.8)
 aim(camera,target);camera.data.ortho_scale=scale
 scene.render.filepath=str(BASE/'renders'/f'{name}_before.png')
 bpy.ops.render.render(write_still=True)
 col.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/studio_baseline.blend'))
result={'renders':['dog_nala_puppy_before.png','human_mira_before.png'],'studio':str(BASE/'source/studio_baseline.blend')}
