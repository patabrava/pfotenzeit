import bpy,json
from pathlib import Path
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-reference-pass-2026-10-09');report={}
for asset in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex']:
 ob=next(o for o in bpy.data.collections['AFTER_'+asset].objects if o.type=='MESH');attr=ob.data.attributes.get('fable_eye_region');counts={}
 if attr:
  for v in attr.data:counts[str(v.value)]=counts.get(str(v.value),0)+1
 report[asset]={'eyeRegions':counts,'bounds':[[min(v.co[k] for v in ob.data.vertices) for k in range(3)],[max(v.co[k] for v in ob.data.vertices) for k in range(3)]],'sourceMesh':ob.name}
(BASE/'reports/source_review.json').write_text(json.dumps(report,indent=2));result=report
