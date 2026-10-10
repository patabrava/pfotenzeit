import bpy
result={'objects':[{'name':o.name,'type':o.type,'collections':[c.name for c in o.users_collection],'hide':o.hide_render,'vertices':len(o.data.vertices) if o.type=='MESH' else None,'location':list(o.location),'modifiers':[m.type for m in o.modifiers]} for o in bpy.context.scene.objects]}
