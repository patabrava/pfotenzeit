import bpy
from pathlib import Path
from mathutils import Vector
base=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/free-models-2026-10-10')
bpy.ops.wm.read_factory_settings(use_empty=True)
for index,name in enumerate(['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy']):
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(base/'candidates'/f'{name}.glb'))
 imported=set(bpy.data.objects)-before
 for o in imported:
  if o.parent is None:o.location.x+=(index-1)*.65
  o.name=name+'_'+o.name
 for o in imported:
  if o.type=='ARMATURE' and o.animation_data:o.animation_data.action=None
bpy.context.scene.world=bpy.data.worlds.new('Studio');bpy.context.scene.world.color=(.4,.4,.4)
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.shading.type='MATERIAL';area.spaces.active.region_3d.view_distance=2.6;area.spaces.active.region_3d.view_location=(0,.1,.2)
bpy.ops.wm.save_as_mainfile(filepath=str(base/'free_dog_library.blend'))
