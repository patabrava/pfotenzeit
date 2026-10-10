import bpy
result={}
for asset in ['dog_nala_puppy','dog_bruno_puppy']:
 ob=next(o for o in bpy.data.collections['AFTER_'+asset].objects if o.type=='MESH');ca=ob.data.color_attributes.active_color
 result[asset]={'domain':ca.domain,'sample':[(list(v.co),list(ca.data[v.index].color),[(ob.vertex_groups[g.group].name,g.weight) for g in v.groups]) for v in ob.data.vertices if v.co.y>.02 and .19<v.co.z<.21][:5]}
