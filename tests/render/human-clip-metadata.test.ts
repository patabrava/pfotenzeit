import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {content} from '../../src/content';
import {createHumanActor} from '../../src/render/objects/ActorController';
import {createAssetManager} from '../../src/render/loaders/AssetManager';
import {loadGltfFromFile} from '../../src/render/dev/nodeGltf';
import type {AssetManifest} from '../../src/render/types';

it('holds the vendor kneeling endpoint instead of repeatedly standing back up',async()=>{
 const manifest=JSON.parse(await readFile('public/assets/manifest.json','utf8')) as AssetManifest;
 const assets=createAssetManager({baseUrl:'./',fetchManifest:async()=>manifest,loadGltf:url=>loadGltfFromFile(`public/${url.replace(/^\.\//,'')}`)});
 let loaded!:()=>void;const ready=new Promise<void>(r=>{loaded=r});
 const actor=createHumanActor({id:'human_mira',character:content.humans.human_mira,assets,onTierChange:(_id,tier)=>{if(tier==='glb')loaded()}});
 await ready;
 await actor.play('kneel',{instant:true});actor.root.updateMatrixWorld(true);
 const hips=actor.root.getObjectByName('Hips')!;
 const before=hips.getWorldPosition(new Vector3());
 for(let i=0;i<195;i++)actor.update(1/60);
 actor.root.updateMatrixWorld(true);
 expect(hips.getWorldPosition(new Vector3()).distanceTo(before)).toBeLessThan(1e-4);
 expect(before.y).toBeLessThan(.6);
 actor.dispose();assets.dispose();
});
