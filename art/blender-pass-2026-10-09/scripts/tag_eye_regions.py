"""Add non-deforming authoring selections for Fable's 32-bone eye/lid integration."""
import bpy,json
from pathlib import Path
from mathutils import Vector
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-pass-2026-10-09')
counts={}
for asset in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy']:
 mesh=next(o for o in bpy.data.collections['AFTER_'+asset].objects if o.type=='MESH')
 comp=json.loads((BASE/'reports'/f'{asset}_components.json').read_text())
 centers=[Vector([(comp[n]['bounds'][0][k]+comp[n]['bounds'][1][k])/2 for k in range(3)])+Vector((0,-.001,.001)) for n in [8,10]]
 adjacency=[[] for _ in mesh.data.vertices]
 for e in mesh.data.edges:
  a,b=e.vertices;adjacency[a].append(b);adjacency[b].append(a)
 attr=mesh.data.attributes.new('fable_eye_region','INT','POINT')
 seen=set();report={}
 for vertex in mesh.data.vertices:
  if vertex.index in seen:continue
  todo=[vertex.index];seen.add(vertex.index);indices=[]
  while todo:
   i=todo.pop();indices.append(i)
   for j in adjacency[i]:
    if j not in seen:seen.add(j);todo.append(j)
  if len(indices)>500:continue
  co=[mesh.data.vertices[i].co for i in indices];center=sum(co,Vector())/len(co)
  for side,ec in enumerate(centers):
   if (center-ec).length<.026:
    extent_z=max(v.z for v in co)-min(v.z for v in co)
    if extent_z<.020 and center.z>ec.z+.006:region=3+side # upper lid
    elif extent_z<.020 and center.z<ec.z-.006:region=5+side # lower lid
    else:region=1+side # eyeball / iris / pupil / catchlight
    for i in indices:attr.data[i].value=region
    report[region]=report.get(region,0)+len(indices)
 mesh['eye_region_legend']='0=body/other; 1=eye_l; 2=eye_r; 3=upper_lid_l; 4=upper_lid_r; 5=lower_lid_l; 6=lower_lid_r. Authoring selection only; not exported as skin influences.'
 counts[asset]=report
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/characters_refined.blend'))
(BASE/'reports/eye_region_counts.json').write_text(json.dumps(counts,indent=2))
result=counts
