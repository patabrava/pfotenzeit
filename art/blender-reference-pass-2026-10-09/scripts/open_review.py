import bpy
from pathlib import Path
from datetime import datetime
base=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-reference-pass-2026-10-09')
bpy.ops.wm.save_as_mainfile(filepath=str(base/'source'/('gui_snapshot_'+datetime.now().strftime('%H%M%S')+'.blend')),copy=True)
bpy.ops.wm.open_mainfile(filepath=str(base/'source/characters_refined.blend'))
result={'opened':bpy.data.filepath}
