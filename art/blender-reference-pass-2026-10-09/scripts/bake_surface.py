import bpy,json
from pathlib import Path
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-reference-pass-2026-10-09')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
(BASE/'textures').mkdir(exist_ok=True)
report={}
for asset in ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex']:
 col=bpy.data.collections['AFTER_'+asset];col.hide_viewport=False;col.hide_render=False
 ob=next(o for o in col.objects if o.type=='MESH');ob.hide_set(False);ob.hide_render=False
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 # Stable authored UVs for normal detail. Maps are baked in rest pose, independent of runtime deformation.
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=.8,island_margin=.014);bpy.ops.object.mode_set(mode='OBJECT')
 mat=ob.data.materials[0].copy();mat.name=asset+'_Baked_Surface';ob.data.materials.clear();ob.data.materials.append(mat)
 nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
 tc=nodes.new('ShaderNodeTexCoord');vector=nodes.new('ShaderNodeVectorMath');vector.operation='MULTIPLY';vector.inputs[1].default_value=(5,1,1) if asset.startswith('dog') else (2,2,2)
 links.new(tc.outputs['Object'],vector.inputs[0])
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=135 if asset.startswith('dog') else 120;noise.inputs['Detail'].default_value=2;noise.inputs['Roughness'].default_value=.65
 links.new(vector.outputs['Vector'],noise.inputs['Vector'])
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.48 if asset.startswith('dog') else .10;bump.inputs['Distance'].default_value=.0011 if asset.startswith('dog') else .0007
 links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
 image=bpy.data.images.new(asset+'_normal',width=1024 if asset.startswith('dog') else 512,height=1024 if asset.startswith('dog') else 512,alpha=False)
 image.colorspace_settings.name='Non-Color';tex=nodes.new('ShaderNodeTexImage');tex.image=image;nodes.active=tex;tex.select=True
 scene.render.bake.use_selected_to_active=False;scene.render.bake.margin=8;scene.render.bake.normal_space='TANGENT'
 bpy.ops.object.bake(type='NORMAL')
 # Neutralize unbaked atlas texels before filtering; small accessory islands must not sample black normals.
 values=list(image.pixels[:]);neutralized=0
 for i in range(0,len(values),4):
  if values[i+2]<.60:
   values[i:i+4]=[.5,.5,1,1];neutralized+=1
 image.pixels[:]=values;image.update()
 image.filepath_raw=str(BASE/'textures'/f'{asset}_normal.png');image.file_format='PNG';image.save();image.pack()
 links.remove(bs.inputs['Normal'].links[0]);normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.85
 links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
 report[asset]={'map':image.filepath_raw,'resolution':list(image.size),'bytes':Path(image.filepath_raw).stat().st_size}
 col.hide_viewport=True;col.hide_render=True
scene.cycles.samples=32
(BASE/'reports/surface_bakes.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/characters_refined.blend'))
result=report
