import bpy, json
from pathlib import Path
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-pass-2026-10-09')
scene=bpy.data.scenes['Pfotenzeit_Blender_Asset_Pass'];bpy.context.window.scene=scene
(BASE/'candidates/raw').mkdir(exist_ok=True)
report={}
for asset in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex']:
 col=bpy.data.collections['AFTER_'+asset];col.hide_viewport=False;col.hide_render=False
 bpy.ops.object.select_all(action='DESELECT')
 arm=next(o for o in col.objects if o.type=='ARMATURE');mesh=next(o for o in col.objects if o.type=='MESH')
 arm.data.pose_position='REST'
 for o in [mesh,arm]:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=mesh
 bpy.ops.export_scene.gltf(filepath=str(BASE/'candidates/raw'/f'{asset}.glb'),export_format='GLB',use_selection=True,export_skins=True,export_animations=False,export_yup=True,export_apply=False,export_vertex_color='NAME',export_vertex_color_name='Color',export_all_influences=False,export_leaf_bone=False,export_armature_object_remove=True,export_extras=False)
 report[asset]={'raw_bytes':(BASE/'candidates/raw'/f'{asset}.glb').stat().st_size,'nla_tracks':[(t.name,[(s.name,s.action.name) for s in t.strips]) for t in arm.animation_data.nla_tracks]}
 col.hide_render=True;col.hide_viewport=True
(BASE/'reports/raw_exports.json').write_text(json.dumps(report,indent=2))
result=report
