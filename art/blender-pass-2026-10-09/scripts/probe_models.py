import bpy, json
from pathlib import Path
from mathutils import Vector
BASE = Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-pass-2026-10-09')
original_scene = bpy.context.scene
# Original scene was saved before the interactive import.
scene = bpy.data.scenes.new('Pfotenzeit_Blender_Asset_Pass')
bpy.context.window.scene = scene
scene['original_scene'] = original_scene.name
report = {}
for name in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex']:
    existing = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(BASE/'baseline'/f'{name}.glb'))
    imported = [o for o in bpy.data.objects if o not in existing]
    col = bpy.data.collections.new('BEFORE_'+name)
    scene.collection.children.link(col)
    for ob in imported:
        for c in list(ob.users_collection): c.objects.unlink(ob)
        col.objects.link(ob)
        ob['asset_id'] = name
        ob['variant'] = 'before'
    mesh = next(o for o in imported if o.type=='MESH')
    arm = next(o for o in imported if o.type=='ARMATURE')
    mesh['armature_name'] = arm.name
    data = mesh.data
    adjacency = [[] for _ in data.vertices]
    for e in data.edges:
        a,b=e.vertices; adjacency[a].append(b); adjacency[b].append(a)
    seen=set(); components=[]
    ca = data.color_attributes.active_color
    colors={}
    if ca.domain=='POINT':
        colors={v.index: list(ca.data[v.index].color) for v in data.vertices}
    else:
        for loop in data.loops: colors[loop.vertex_index] = list(ca.data[loop.index].color)
    for v in data.vertices:
        if v.index in seen: continue
        ids=[]; todo=[v.index];seen.add(v.index)
        while todo:
            i=todo.pop(); ids.append(i)
            for j in adjacency[i]:
                if j not in seen: seen.add(j);todo.append(j)
        coords=[data.vertices[i].co for i in ids]
        mins=[min(c[k] for c in coords) for k in range(3)]
        maxs=[max(c[k] for c in coords) for k in range(3)]
        avgcol=[sum(colors[i][k] for i in ids)/len(ids) for k in range(3)]
        groups={}
        for i in ids:
            for g in data.vertices[i].groups:
                gn=mesh.vertex_groups[g.group].name
                groups[gn]=groups.get(gn,0)+g.weight
        top=sorted(groups.items(),key=lambda x:-x[1])[:4]
        components.append({'id':len(components),'n':len(ids),'bounds':[mins,maxs],'color':avgcol,'groups':top,'ids':ids})
    report[name]={'mesh':mesh.name,'armature':arm.name,'matrix':list(map(list,mesh.matrix_world)), 'colors':{'name':ca.name,'domain':ca.domain},'components':[{k:v for k,v in c.items() if k!='ids'} for c in components], 'bones':[b.name for b in arm.data.bones], 'animations':[(a.name,a.frame_range[:]) for a in bpy.data.actions if a.name.startswith(('idle','sniff','rest','walk'))]}
    (BASE/'reports'/f'{name}_components.json').write_text(json.dumps(components))
    col.hide_render=True
    col.hide_viewport=True
(BASE/'reports/import_probe.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/baseline_import.blend'))
result = {'scene':scene.name,'original_scene':original_scene.name,'assets':{n:{'components':len(v['components']),'mesh':v['mesh'],'bone_count':len(v['bones'])} for n,v in report.items()}}
