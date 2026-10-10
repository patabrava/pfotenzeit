import {describe,it,expect} from 'vitest';
import {Vector3} from 'three';
import {loadGltfFromFile} from '../../src/render/dev/nodeGltf';
import {MixerPerformer} from '../../src/render/anim/PoseController';
import {DOG_LOOP_POSES} from '../../src/render/objects/ActorController';
import {POSE_IDS, type PoseId} from '../../src/simulation/types';

describe('shipped lesson dog animation contract', () => {
  for (const file of ['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy']) it(file + ' has distinct head, ear, tail and resting motion', async () => {
    const gltf=await loadGltfFromFile(`public/assets/models/${file}.glb`);
    expect(gltf.animations.map(a=>a.name).sort()).toEqual([...POSE_IDS].sort());
    const p=new MixerPerformer<PoseId>({root:gltf.scene,clips:gltf.animations,loops:DOG_LOOP_POSES,initialPose:'idle_relaxed',fallbackPose:'idle_relaxed',walkPose:'walk',label:file});
    const point=(name:string)=>{gltf.scene.updateMatrixWorld(true);return gltf.scene.getObjectByName(name)!.getWorldPosition(new Vector3());};
    const sample=async(pose:PoseId)=>{await p.setPose(pose,{instant:true,restart:true});for(let i=0;i<120;i++)p.update(1/60);return {head:point('Dog_Neck_TopSHJnt'),tail:point('Dog_Tail_01_05SHJnt'),ear:gltf.scene.getObjectByName('Dog_l_Ear_01_01SHJnt')!.quaternion.clone()};};
    const idle=await sample('idle_relaxed'),sniff=await sample('sniff'),alert=await sample('alert_focus'),tense=await sample('tense_idle'),rest=await sample('rest_loop'),side=await sample('rest_side');
    console.log(file, {idle:idle.tail.y,tense:tense.tail.y,alert:alert.tail.y,headRest:rest.head.y,headSniff:sniff.head.y});
    expect(sniff.head.y).toBeLessThan(idle.head.y*.65);
    expect(rest.head.y).toBeLessThan(idle.head.y*.4);
    expect(side.head.y).toBeLessThan(idle.head.y*.45);
    expect(tense.tail.y).toBeLessThan(idle.tail.y*.8);
    expect(alert.tail.y).toBeGreaterThan(idle.tail.y*1.4);
    expect(alert.ear.angleTo(tense.ear)).toBeGreaterThan(.5);
    await p.setPose('alert_focus',{instant:true});const q=point('Dog_Tail_01_05SHJnt');let sweep=0;for(let i=0;i<60;i++){p.update(1/60);sweep=Math.max(sweep,point('Dog_Tail_01_05SHJnt').distanceTo(q));}expect(sweep).toBeGreaterThan(.015);
    await p.setPose('rest_loop',{instant:true});const tail=point('Dog_Tail_01_05SHJnt');for(let i=0;i<40;i++)p.update(1/60);expect(point('Dog_Tail_01_05SHJnt').distanceTo(tail)).toBeLessThan(.001);
    let morphs:any;gltf.scene.traverse((n:any)=>{if(n.morphTargetDictionary)morphs=n;});expect(morphs.morphTargetInfluences[morphs.morphTargetDictionary.blink]).toBe(.9);
    const before=morphs.morphTargetInfluences[morphs.morphTargetDictionary.breath];p.update(.4);expect(morphs.morphTargetInfluences[morphs.morphTargetDictionary.breath]).not.toBe(before);
    await p.setPose('look_at_handler',{instant:true});p.setGaze(true);p.setLook(50,-15);p.update(.01);const head=gltf.scene.getObjectByName('Dog_Neck_TopSHJnt')!.quaternion.clone();for(let i=0;i<100;i++)p.update(.01);expect(head.angleTo(gltf.scene.getObjectByName('Dog_Neck_TopSHJnt')!.quaternion)).toBeLessThan(.001);
    p.dispose();
  });
});
