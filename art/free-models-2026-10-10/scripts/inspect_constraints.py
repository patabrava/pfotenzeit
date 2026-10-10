import bpy,json
from pathlib import Path
base=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/free-models-2026-10-10')
bpy.ops.wm.open_mainfile(filepath=str(base/'original/ShibaInu.blend'))
r=next(o for o in bpy.data.objects if o.type=='ARMATURE')
(base/'reports/constraints.json').write_text(json.dumps({p.name:[{'type':c.type,'target':getattr(c,'subtarget',''),'chain':getattr(c,'chain_count',0)} for c in p.constraints] for p in r.pose.bones},indent=2))
