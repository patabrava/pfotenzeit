import bpy
from mathutils import Vector
for c in bpy.data.collections:
 if c.name.startswith(('BEFORE_','AFTER_')):
  c.hide_viewport=True;c.hide_render=True
c=bpy.data.collections['AFTER_dog_nala_puppy'];c.hide_viewport=False;c.hide_render=False
for o in bpy.context.scene.objects:
 o.select_set(False)
 if o.type in {'ARMATURE','LIGHT','CAMERA'} or o.name.startswith('Icosphere'):
  o.hide_set(True)
mesh=next(o for o in c.all_objects if o.type=='MESH' and not o.name.startswith('Icosphere'))
mesh.hide_set(False);mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   space=area.spaces.active
   space.shading.type='MATERIAL'
   space.overlay.show_overlays=False
   space.region_3d.view_rotation=Vector((.85,-1.4,.6)).to_track_quat('Z','Y')
   space.region_3d.view_location=Vector((0,0,.22))
   space.region_3d.view_distance=.95
   space.region_3d.view_perspective='ORTHO'
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
result={'visible':mesh.name,'file':bpy.data.filepath}
