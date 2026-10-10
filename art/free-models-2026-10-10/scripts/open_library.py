import bpy
from pathlib import Path
base=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/free-models-2026-10-10')
if bpy.data.filepath or len(bpy.data.objects):
 bpy.ops.wm.save_as_mainfile(filepath=str(base/'before/blender_scene_before_open.blend'),copy=True)
bpy.ops.wm.open_mainfile(filepath=str(base/'free_dog_library.blend'))
