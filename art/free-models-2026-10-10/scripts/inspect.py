import bpy,json
from pathlib import Path
base=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/free-models-2026-10-10')
result={}
for name in ['ShibaInu','Husky']:
 bpy.ops.wm.open_mainfile(filepath=str(base/'original'/f'{name}.blend'))
 result[name]={'objects':[(o.name,o.type,tuple(o.location),tuple(o.scale)) for o in bpy.data.objects], 'bones':[], 'actions':[],'materials':[]}
 for o in bpy.data.objects:
  if o.type=='ARMATURE':
   result[name]['bones']=[(b.name,b.parent.name if b.parent else None,list(b.head_local),list(b.tail_local)) for b in o.data.bones]
 for a in bpy.data.actions: result[name]['actions'].append((a.name,list(a.frame_range)))
 for m in bpy.data.materials:result[name]['materials'].append((m.name,list(m.diffuse_color),m.use_nodes))
(base/'reports/source-inventory.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
