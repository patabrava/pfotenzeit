"""Adapt the downloaded puppy on its own skeleton; retain editable IK controls."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Quaternion
base=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/soft-puppies-2026-10-10')
bpy.ops.wm.open_mainfile(filepath=str(base/'puppy_source.blend'), use_scripts=False)
for o in list(bpy.data.objects):
 if o.name=='Icosphere': bpy.data.objects.remove(o,do_unlink=True)
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.data.objects if o.type=='MESH')
original=rig.animation_data.action
rig.animation_data.action=None
for track in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(track)
for p in rig.pose.bones:p.matrix_basis.identity()
if mesh.data.shape_keys:
 mesh.data.shape_keys.animation_data_clear()
 for k in mesh.data.shape_keys.key_blocks:k.value=0
bpy.context.view_layer.update()
# Keep the imported bind orientation; correct only the glTF importer's estimated bone lengths.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:
 if b.children:
  c=min(b.children,key=lambda c:(c.head-b.head).length)
  if (c.head-b.head).length>0.001:b.length=(c.head-b.head).length
bpy.ops.object.mode_set(mode='OBJECT')
# Bake the source container scale into bind geometry and skeleton, not runtime parents.
world=mesh.matrix_world.copy();mesh.parent=None;mesh.matrix_world=world
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
mesh.parent=rig;mesh.matrix_parent_inverse=rig.matrix_world.inverted()
bpy.context.view_layer.update()
# Smooth PBR coat, no unwanted emissive glow or metal.
for p in mesh.data.polygons:p.use_smooth=True
mat=mesh.data.materials[0];bs=mat.node_tree.nodes.get('Principled BSDF')
for name,value in [('Metallic',0),('Roughness',.84),('Emission Strength',0)]:
 for link in list(bs.inputs[name].links):mat.node_tree.links.remove(link)
 bs.inputs[name].default_value=value
# A 1K color map retains the painted fur; secondary maps fit the existing 6MiB cap.
for image in bpy.data.images:
 if image.name.startswith('NormalMap'):image.scale(256,256)
# Remove unused metal/roughness + emissive texture nodes so exporter prunes them.
for node in list(mat.node_tree.nodes):
 if node.type=='TEX_IMAGE' and node.image and ('roughness' in node.image.name or 'scale0' in node.image.name):mat.node_tree.nodes.remove(node)
# Ground and center bind pose; preserve source facing -Y (runtime +Z).
coords=[mesh.matrix_world@v.co for v in mesh.data.vertices]
shift=Vector((-(min(v.x for v in coords)+max(v.x for v in coords))/2,-(min(v.y for v in coords)+max(v.y for v in coords))/2,-min(v.z for v in coords)))
rig.location+=shift
bpy.context.view_layer.update()
# Imported leaf names differ across left/right; locate from their actual chains.
legs={}
for side in ['l','r']:
 for kind in ['Front','Hind']:
  hip=rig.data.bones[f'Dog_{side}_{kind}Leg_HipSHJnt']
  chain=[hip]
  while len(chain)<(3 if kind=='Hind' else 2):chain.append(chain[-1].children[0])
  ankle=chain[-1].children[0]
  legs[(side,kind)]={'chain':[b.name for b in chain],'ankle':ankle.name,'target':f'IK_{side}_{kind}','position':ankle.head_local.copy()}
bpy.ops.object.mode_set(mode='EDIT')
for leg in legs.values():
 b=rig.data.edit_bones.new(leg['target']);a=rig.data.edit_bones[leg['ankle']];b.head=a.head.copy();b.tail=a.tail.copy();b.roll=a.roll;b.length=.025;b.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
constraints=[]
for leg in legs.values():
 c=rig.pose.bones[leg['chain'][-1]].constraints.new('IK');c.name='Grounded paw';c.target=rig;c.subtarget=leg['target'];c.chain_count=len(leg['chain']);c.use_tail=True;c.iterations=64;c.influence=0
 constraints.append(c)
 # Paw orientation stays flat as knee/hock bends; the control retains its bind orientation.
 c=rig.pose.bones[leg['ankle']].constraints.new('COPY_ROTATION');c.name='Flat paw';c.target=rig;c.subtarget=leg['target'];c.target_space='POSE';c.owner_space='POSE';c.influence=0
 constraints.append(c)
# Educational clips are authored on this exact vendor skeleton, including ears and tail.
# Rebuild from the source blend so repeated exports do not retain stale actions.
for action in list(bpy.data.actions): bpy.data.actions.remove(action)
bpy.context.scene.render.fps=24
meta={'idle_relaxed':4,'look_at_handler':1.5,'sniff':2.5,'walk':1,'sit':1.5,'lie_down':1.5,'rest_loop':5,'rest_side':5,'stand_up':1.8,'eat':4,'play_bow':1.5,'turn_away':1.5,'tense_idle':2.5,'alert_focus':2,'tired_idle':3.5,'recover':2}
def rotate(name,angle,axis=(1,0,0),add=False):
 p=rig.pose.bones[name];r=p.bone.matrix_local.to_quaternion();p.rotation_mode='QUATERNION'
 q=r.inverted()@Quaternion(Vector(axis),angle)@r
 p.rotation_quaternion=q@p.rotation_quaternion if add else q
def move(name,delta):
 p=rig.pose.bones[name];p.location=p.bone.matrix_local.to_3x3().inverted()@Vector(delta)
def ears(back=0):
 for side in ['l','r']:
  rotate(f'Dog_{side}_Ear_01_01SHJnt',back)
  middle='Wolf_l_Ear_01_02SHJnt' if side=='l' else 'Dog_r_Ear_01_02SHJnt'
  rotate(middle,-back*.2)
def tail(pitch=-.25,wag=0,side=0):
 rotate('Dog_Tail_01_02SHJnt',pitch)
 rotate('Dog_Tail_01_02SHJnt',side+wag,(0,0,1),True)
 rotate('Dog_Tail_01_03SHJnt',pitch*.18)
 rotate('Dog_Tail_01_03SHJnt',wag*.5,(0,0,1),True)
 rotate('Dog_Tail_01_04SHJnt',wag*.3,(0,0,1))
def rest_pose(amount):
 move('DogROOTSHJnt',(0,0,-.128*amount))
 # Neck folds down while the head stays level over the extended front paws.
 rotate('Dog_Neck_01SHJnt',1.20*amount)
 rotate('Dog_Neck_02SHJnt',.15*amount)
 rotate('Dog_Neck_TopSHJnt',-.85*amount)
 for (side,kind),leg in legs.items():move(leg['target'],(0,(-.12 if kind=='Front' else -.025)*amount,0))
 tail(-.18*amount-.25*(1-amount),0,.45*amount)
def tense(amount=1):
 move('DogROOTSHJnt',(0,.017*amount,-.006*amount))
 rotate('Dog_Neck_01SHJnt',.10*amount)
 rotate('Dog_Neck_TopSHJnt',-.03*amount)
 ears(.65*amount);tail(-1.05*amount-.25*(1-amount))
for semantic,duration in meta.items():
 action=bpy.data.actions.new(semantic);action.use_fake_user=True;rig.animation_data.action=action
 frames=round(duration*24)
 for f in range(frames+1):
  bpy.context.scene.frame_set(f)
  t=f/frames;blend=t*t*(3-2*t);wave=math.sin(t*math.tau)
  for p in rig.pose.bones:p.matrix_basis.identity();p.rotation_mode='QUATERNION'
  for c in constraints:c.influence=1
  tail(-.25,.12*math.sin(t*math.tau*2))
  if semantic=='idle_relaxed':
   rotate('Dog_Neck_TopSHJnt',.045*wave,(0,0,1))
  if semantic=='sit':
   move('DogROOTSHJnt',(0,.025*blend,-.103*blend))
   for n in ['Dog_Spine_01SHJnt','Dog_Spine_02SHJnt','Dog_Spine_03SHJnt','Dog_Spine_04SHJnt']:rotate(n,-.12*blend)
   rotate('Dog_Neck_01SHJnt',.24*blend)
   for (side,kind),leg in legs.items():
    if kind=='Hind':move(leg['target'],(0,-.05*blend,0))
   tail(-.85*blend)
  if semantic in ['lie_down','rest_loop','stand_up']:
   amount=blend if semantic=='lie_down' else (1-blend if semantic=='stand_up' else 1)
   rest_pose(amount)
  if semantic=='rest_side':
   for c in constraints:c.influence=0
   move('DogROOTSHJnt',(0,0,-.12))
   rotate('DogROOTSHJnt',1.35,(0,1,0))
   rotate('Dog_Neck_01SHJnt',.12)
   tail(-.65,0,.35)
  if semantic=='look_at_handler':
   rotate('Dog_Neck_01SHJnt',-.20*blend)
   ears(-.18*blend);tail(-.15,0)
  if semantic in ['sniff','eat']:
   amount=(math.sin(math.pi*t)**.65 if semantic=='eat' else 1)
   move('DogROOTSHJnt',(0,-.008*amount,-.012*amount))
   for n in ['Dog_Spine_01SHJnt','Dog_Spine_02SHJnt','Dog_Spine_03SHJnt','Dog_Spine_04SHJnt']:rotate(n,.10*amount)
   rotate('Dog_Neck_01SHJnt',1.50*amount+.025*wave)
   rotate('Dog_Neck_02SHJnt',.30*amount)
   rotate('Dog_Neck_TopSHJnt',-.45*amount)
   if semantic=='sniff':rotate('Dog_Neck_TopSHJnt',.08*wave,(0,0,1),True)
   else:rotate('Dog_Head_JawSHJnt',.10*(1+math.sin(t*math.tau*8))*amount)
   tail(-.25,.15*math.sin(t*math.tau*2))
  if semantic=='play_bow':
   move('DogROOTSHJnt',(0,0,-.008*blend))
   for n in ['Dog_Spine_01SHJnt','Dog_Spine_02SHJnt','Dog_Spine_03SHJnt','Dog_Spine_04SHJnt']:rotate(n,.115*blend)
   rotate('Dog_Neck_01SHJnt',-.22*blend)
   for (side,kind),leg in legs.items():
    if kind=='Front':move(leg['target'],(0,-.05*blend,0))
   tail(.80*blend,.22*math.sin(t*math.tau*3));ears(-.3*blend)
  if semantic=='turn_away':
   tense(blend)
   yaw=-.60*blend
   rotate('DogMAINSHJnt',yaw,(0,0,1))
   q=Quaternion(Vector((0,0,1)),yaw)
   for leg in legs.values():
    move(leg['target'],q@leg['position']-leg['position'])
    rotate(leg['target'],yaw,(0,0,1))
   rotate('Dog_Neck_01SHJnt',-.32*blend,(0,0,1))
   rotate('Dog_Neck_TopSHJnt',-.30*blend,(0,0,1))
  if semantic=='tense_idle':tense()
  if semantic=='alert_focus':
   move('DogROOTSHJnt',(0,-.014,-.004))
   rotate('Dog_Neck_01SHJnt',-.08)
   ears(-.38);tail(.85,.24*math.sin(t*math.tau*4))
  if semantic=='tired_idle':
   rotate('Dog_Neck_01SHJnt',.35+.025*wave);rotate('Dog_Neck_TopSHJnt',.18)
   tail(-.9);ears(.08)
   # A single slow yawn per cycle; regular breathing is supplied by the morph layer.
   rotate('Dog_Head_JawSHJnt',.30*max(0,math.sin(math.pi*t))**6)
  if semantic=='recover':
   tense(1-blend)
   shake=math.sin(t*math.tau*3)*math.sin(math.pi*t)**2*.13
   rotate('Dog_Neck_TopSHJnt',shake,(0,0,1),True)
  if semantic=='walk':
   move('DogROOTSHJnt',(0,0,.003*math.sin(t*math.tau*2)))
   for (side,kind),leg in legs.items():
    phase=t*math.tau+(math.pi if (side=='l')==(kind=='Front') else 0)
    move(leg['target'],(0,.035*math.cos(phase),.012*max(0,math.sin(phase))))
  bpy.context.view_layer.update()
  for c in constraints:c.keyframe_insert('influence',frame=f)
  for p in rig.pose.bones:
   p.keyframe_insert('location',frame=f,group=p.name);p.keyframe_insert('rotation_quaternion',frame=f,group=p.name)
rig.animation_data.action=None
for p in rig.pose.bones:p.matrix_basis.identity()
for c in constraints:c.influence=0
if mesh.data.shape_keys:
 mesh.data.shape_keys.animation_data_clear()
 for k in mesh.data.shape_keys.key_blocks:k.value=0
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(base/'puppy_training.blend'))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(base/'puppy_training.glb'),use_selection=True,export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_influence_nb=4,export_all_influences=False,export_morph=True,export_tangents=True)
print('PFZ_EXPORT',json.dumps({'file':str(base/'puppy_training.glb'),'actions':[a.name for a in bpy.data.actions],'ik':len(constraints),'vertices':len(mesh.data.vertices)}))
