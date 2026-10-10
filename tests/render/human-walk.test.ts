import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { content } from '../../src/content';
import { createHumanActor } from '../../src/render/objects/ActorController';
import { createAssetManager } from '../../src/render/loaders/AssetManager';
import { loadGltfFromFile } from '../../src/render/dev/nodeGltf';
import type { AssetManifest } from '../../src/render/types';

it('walks the vendor human from travelled distance, then settles and holds without pose drift', async () => {
  const manifest = JSON.parse(await readFile('public/assets/manifest.json', 'utf8')) as AssetManifest;
  const assets = createAssetManager({ baseUrl: './', fetchManifest: async () => manifest, loadGltf: url => loadGltfFromFile(`public/${url.replace(/^\.\//, '')}`) });
  let loaded!: () => void;
  const ready = new Promise<void>(resolve => { loaded = resolve; });
  const actor = createHumanActor({ id: 'human_mira', character: { ...content.humans.human_mira, name: 'Ines' }, assets, onTierChange: (_id, tier) => { if (tier === 'glb') loaded(); } });
  await ready;
  const leg = actor.root.getObjectByName('LeftUpLeg')!;
  actor.setHold(true);
  actor.update(1 / 60);
  const idle = leg.quaternion.clone().normalize();
  actor.setHold(false);
  for (let i = 1; i <= 20; i++) {
    actor.setWorld({ key: 'handler', characterId: 'handler', position: { x: 0, z: i * 0.02 }, facing: 0, speed: 1.2, pose: 'idle' }, false);
    actor.update(1 / 60);
  }
  expect(leg.quaternion.clone().normalize().angleTo(idle)).toBeGreaterThan(0.1);
  actor.setWorld({ key: 'handler', characterId: 'handler', position: { x: 0, z: 0.4 }, facing: 0, speed: 0, pose: 'idle' }, false);
  for (let i = 0; i < 120; i++) actor.update(1 / 60);
  actor.setHold(true);
  actor.update(1 / 60);
  const stopped = leg.quaternion.clone().normalize();
  for (let i = 0; i < 120; i++) actor.update(1 / 60);
  expect(leg.quaternion.clone().normalize().angleTo(stopped)).toBeLessThan(1e-5);
  expect(leg.quaternion.clone().normalize().angleTo(idle)).toBeLessThan(0.02);
  actor.dispose();
  assets.dispose();
});
