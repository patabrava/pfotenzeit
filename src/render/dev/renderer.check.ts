/**
 * Node-side renderer checks (no GPU): pose distinctness, framing at the five target viewports,
 * draw-call budget by scene traversal, demand-rendering loop semantics and GLB tier detection.
 * Run: npx vitest run --config <config with include ['src/render/dev/*.check.ts']>
 */
import { describe, expect, it } from 'vitest';
import { AnimationClip, Bone, BufferGeometry, Group, Mesh, Object3D, Skeleton, SkinnedMesh, Vector3, type Bone as BoneType } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { content } from '../../content';
import { POSE_IDS, type GestureId, type PoseId, type SceneDirective } from '../../simulation/types';
import { DOG_ONE_SHOT_SECONDS, DOG_POSES, type DogPoseContext } from '../anim/dogPoses';
import { HUMAN_ONE_SHOT_SECONDS, HUMAN_POSES, type HumanPoseContext } from '../anim/humanPoses';
import { ProceduralPerformer } from '../anim/PoseController';
import { createGameRenderer } from '../app/GameRenderer';
import { createLoop } from '../app/loop';
import { createAssetManager } from '../loaders/AssetManager';
import { buildDogRig } from '../objects/DogActor';
import { buildHumanRig } from '../objects/HumanActor';
import { defaultDirective } from '../devScene';
import type { AssetManifest } from '../types';

const GESTURES: readonly GestureId[] = ['idle', 'greet', 'gesture_explain', 'offer_reward', 'kneel'];
const VIEWPORTS = [
  [360, 640],
  [390, 844],
  [430, 932],
  [844, 390],
  [1440, 900],
] as const;

function rotationsOf(root: Object3D): number[] {
  const out: number[] = [];
  root.traverse((node) => {
    if ((node as BoneType).isBone) out.push(node.rotation.x, node.rotation.y, node.rotation.z, node.position.y);
  });
  return out;
}

function maxDiffDegrees(a: number[], b: number[]): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs((a[i] as number) - (b[i] as number)));
  return (max * 180) / Math.PI;
}

describe('procedural poses', () => {
  it('all 13 dog poses are pairwise distinct (Nala arriving, Bruno)', () => {
    for (const id of ['dog_nala', 'dog_bruno'] as const) {
      const rig = buildDogRig(id, 'arriving', content.dogs[id]);
      const performer = new ProceduralPerformer<PoseId, DogPoseContext>({
        rig,
        poses: DOG_POSES,
        oneShotSeconds: DOG_ONE_SHOT_SECONDS,
        initialPose: 'idle_relaxed',
        context: { p: rig.proportions, earStyle: rig.proportions.earStyle },
      });
      performer.setLook(40, -15);
      performer.setWalkPhase(0.25);
      const frames = new Map<PoseId, number[]>();
      for (const pose of POSE_IDS) {
        if (pose === 'recover') {
          // recover is a 2 s transition that ends in idle_relaxed by design: sample it mid-way.
          void performer.setPose('tense_idle', { instant: true });
          void performer.setPose('recover');
          for (let i = 0; i < 48; i++) performer.update(1 / 60);
        } else {
          void performer.setPose(pose, { instant: true });
          performer.update(0);
        }
        frames.set(pose, rotationsOf(rig.root));
      }
      const pairs: string[] = [];
      for (const a of POSE_IDS) {
        for (const b of POSE_IDS) {
          if (a >= b) continue;
          const diff = maxDiffDegrees(frames.get(a) as number[], frames.get(b) as number[]);
          if (diff < 6) pairs.push(`${a}/${b}=${diff.toFixed(1)}°`);
        }
      }
      expect(pairs, `${id} near-identical pose pairs`).toEqual([]);
    }
  });

  it('all 5 gestures are pairwise distinct (Mira, Alex)', () => {
    for (const id of ['human_mira', 'human_alex'] as const) {
      const rig = buildHumanRig(id, content.humans[id]);
      const performer = new ProceduralPerformer<GestureId, HumanPoseContext>({
        rig,
        poses: HUMAN_POSES,
        oneShotSeconds: HUMAN_ONE_SHOT_SECONDS,
        initialPose: 'idle',
        context: { p: rig.proportions },
      });
      const frames = new Map<GestureId, number[]>();
      for (const g of GESTURES) {
        void performer.setPose(g, { instant: true });
        performer.update(0);
        frames.set(g, rotationsOf(rig.root));
      }
      for (const a of GESTURES) {
        for (const b of GESTURES) {
          if (a >= b) continue;
          expect(maxDiffDegrees(frames.get(a) as number[], frames.get(b) as number[]), `${id} ${a} vs ${b}`).toBeGreaterThan(10);
        }
      }
    }
  });

  it('hold freezes idle variation; one-shots settle and resolve', async () => {
    const rig = buildDogRig('dog_nala', 'growing', content.dogs.dog_nala);
    const performer = new ProceduralPerformer<PoseId, DogPoseContext>({
      rig,
      poses: DOG_POSES,
      oneShotSeconds: DOG_ONE_SHOT_SECONDS,
      initialPose: 'idle_relaxed',
      context: { p: rig.proportions, earStyle: 'floppy' },
    });
    performer.setHold(true);
    for (let i = 0; i < 60; i++) performer.update(1 / 60);
    const a = rotationsOf(rig.root);
    for (let i = 0; i < 60; i++) performer.update(1 / 60);
    expect(maxDiffDegrees(a, rotationsOf(rig.root))).toBe(0);
    expect(performer.isAnimating()).toBe(false);
    performer.setHold(false);
    expect(performer.isAnimating()).toBe(true);
    let settled = false;
    void performer.setPose('sit').then(() => {
      settled = true;
    });
    for (let i = 0; i < 30; i++) performer.update(1 / 60);
    await Promise.resolve();
    expect(settled).toBe(false);
    for (let i = 0; i < 80; i++) performer.update(1 / 60);
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it('paws stay on the ground in standing poses and the belly rests on it when lying', () => {
    const rig = buildDogRig('dog_nala', 'arriving', content.dogs.dog_nala);
    const performer = new ProceduralPerformer<PoseId, DogPoseContext>({
      rig,
      poses: DOG_POSES,
      oneShotSeconds: DOG_ONE_SHOT_SECONDS,
      initialPose: 'idle_relaxed',
      context: { p: rig.proportions, earStyle: 'floppy' },
    });
    const pawY = (): number[] =>
      ['paw_fl', 'paw_fr', 'paw_bl', 'paw_br'].map((name) => {
        const bone = rig.bones[rig.index.get(name) as number] as Bone;
        return bone.getWorldPosition(new Vector3()).y;
      });
    for (const pose of ['idle_relaxed', 'sniff', 'tense_idle', 'eat'] as const) {
      void performer.setPose(pose, { instant: true });
      performer.update(0);
      rig.root.updateMatrixWorld(true);
      for (const y of pawY()) expect(Math.abs(y - rig.proportions.pawHeight), `${pose} paw height`).toBeLessThan(0.02);
    }
    void performer.setPose('rest_loop', { instant: true });
    performer.update(0);
    rig.root.updateMatrixWorld(true);
    const pelvis = (rig.bones[rig.index.get('pelvis') as number] as Bone).getWorldPosition(new Vector3());
    expect(pelvis.y).toBeLessThan(rig.proportions.bellyRadius * 0.8);
  });
});

describe('framing', () => {
  const makeRenderer = () => createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, disableGlb: true });

  const dogNdc = (handle: ReturnType<typeof makeRenderer>): { xs: number[]; ys: number[] } => {
    const dog = handle.debug.dogs()[0];
    if (!dog) throw new Error('no dog');
    handle.debug.scene.updateMatrixWorld(true);
    const xs: number[] = [];
    const ys: number[] = [];
    const p = dog.proportions();
    const margin = p.chestRadius;
    dog.root.traverse((node) => {
      if (!(node as BoneType).isBone) return;
      const w = node.getWorldPosition(new Vector3());
      const offsets: Array<[number, number, number]> = [
        [margin, 0, 0],
        [-margin, 0, 0],
        [0, margin, 0],
        [0, -margin * 0.5, 0],
        [0, 0, margin],
        [0, 0, -margin],
      ];
      for (const [dx, dy, dz] of offsets) {
        const ndc = handle.debug.camera.project(new Vector3(w.x + dx, w.y + dy, w.z + dz));
        xs.push(ndc.x);
        ys.push(ndc.y);
      }
    });
    return { xs, ys };
  };

  it('lesson and closeup keep the focus dog (paws, tail, ears) inside the frame on all five viewports; lesson keeps it in the middle 55% of portrait', () => {
    const report: string[] = [];
    for (const growth of ['arriving', 'growing'] as const) {
      for (const pose of ['idle_relaxed', 'sit', 'lie_down', 'play_bow', 'sniff'] as const) {
        for (const view of ['lesson', 'closeup', 'school'] as const) {
          for (const [w, h] of VIEWPORTS) {
            const handle = makeRenderer();
            const d: SceneDirective = { ...defaultDirective(), view, dogs: [{ ...defaultDirective().dogs[0]!, growthStage: growth, pose }] };
            handle.debug.camera.setViewport(w, h);
            handle.apply(d);
            for (const dog of handle.debug.dogs()) dog.update(0);
            handle.debug.camera.update(1);
            const { xs, ys } = dogNdc(handle);
            const maxX = Math.max(...xs.map(Math.abs));
            const maxY = Math.max(...ys.map(Math.abs));
            const limit = view === 'lesson' && w < h ? 0.55 : 0.98;
            if (maxX > limit || maxY > limit) report.push(`${growth} ${pose} ${view} ${w}x${h}: |x|≤${maxX.toFixed(2)} |y|≤${maxY.toFixed(2)} > ${limit}`);
            handle.dispose();
          }
        }
      }
    }
    expect(report).toEqual([]);
  });

  it('school view keeps the core yard (training circle, shelter, rest deck) inside the frame and Nala in the lower middle', () => {
    for (const [w, h] of VIEWPORTS) {
      const handle = makeRenderer();
      handle.debug.camera.setViewport(w, h);
      handle.apply({ ...defaultDirective(), view: 'school' });
      handle.debug.camera.update(1);
      const corners: Array<[number, number, number]> = [
        [-2.1, 0, 0.1],
        [2.1, 0, 0.1],
        [0, 0, 2.2],
        [0, 0, -2.0],
        [-2.3, 0.1, -1.5],
        [-0.6, 2.4, -3.4],
      ];
      for (const [x, y, z] of corners) {
        const ndc = handle.debug.camera.project(new Vector3(x, y, z));
        expect(Math.abs(ndc.x), `${w}x${h} corner x`).toBeLessThan(1);
        expect(Math.abs(ndc.y), `${w}x${h} corner y`).toBeLessThan(1);
      }
      const nala = handle.debug.camera.project(handle.debug.dogs()[0]!.position());
      expect(nala.y, `${w}x${h} Nala below centre`).toBeLessThan(0);
      expect(nala.y, `${w}x${h} Nala not at the edge`).toBeGreaterThan(-0.7);
      expect(Math.abs(nala.x)).toBeLessThan(0.3);
      handle.dispose();
    }
  });

  it('camera moves are eased between views and instant with reduced motion', () => {
    const handle = makeRenderer();
    handle.debug.camera.setViewport(390, 844);
    handle.apply({ ...defaultDirective(), view: 'school' });
    handle.apply({ ...defaultDirective(), view: 'closeup' });
    expect(handle.debug.camera.isMoving()).toBe(true);
    expect(handle.debug.camera.update(0.1)).toBe(true);
    expect(handle.debug.camera.update(0.3)).toBe(false);
    handle.setReducedMotion(true);
    handle.apply({ ...defaultDirective(), view: 'school' });
    expect(handle.debug.camera.isMoving()).toBe(false);
    handle.dispose();
  });
});

describe('draw calls and triangles (scene traversal, procedural tier)', () => {
  it('stays well under the 100 draw-call budget in the lesson view and in the fullest scene', () => {
    const handle = createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, disableGlb: true });
    handle.apply(defaultDirective());
    const lesson = handle.debug.countDrawCalls();
    handle.apply({
      view: 'lesson',
      environment: 'courtyard_loud',
      upgrades: ['rest_place', 'sniff_corner'],
      dogs: [
        { id: 'dog_nala', name: 'Nala', growthStage: 'growing', pose: 'look_at_handler', position: 'center', facing: 20 },
        { id: 'dog_bruno', name: 'Bruno', growthStage: 'arriving', pose: 'tense_idle', position: 'right', facing: -30 },
      ],
      humans: [
        { id: 'human_mira', gesture: 'gesture_explain', position: 'left', facing: -40 },
        { id: 'human_alex', gesture: 'idle', position: 'edge', facing: -120 },
      ],
      props: ['bowl', 'water', 'blanket', 'ball', 'toy_rolling', 'leaf'],
      focusDogId: 'dog_nala',
      hold: false,
    });
    const full = handle.debug.countDrawCalls();
    console.info(`[metrics] lesson view: ${lesson.calls} draw calls, ${lesson.triangles} triangles; fullest scene: ${full.calls} draw calls, ${full.triangles} triangles`);
    for (const dog of handle.debug.dogs()) console.info(`[metrics] ${dog.id} ${dog.growth()}: ${dog.triangles()} triangles`);
    for (const human of handle.debug.humans()) console.info(`[metrics] ${human.id}: ${human.triangles()} triangles`);
    expect(lesson.calls).toBeLessThanOrEqual(100);
    expect(full.calls).toBeLessThanOrEqual(100);
    handle.dispose();
  });
});

describe('demand rendering loop', () => {
  it('schedules at most one frame, keeps going only while animating, nothing while inactive', () => {
    const requests: Array<(t: number) => void> = [];
    let cancelled = 0;
    let animating = true;
    const loop = createLoop(
      { frame: () => animating },
      { request: (cb) => requests.push(cb), cancel: () => void cancelled++, now: () => 0 },
    );
    loop.invalidate();
    loop.invalidate();
    expect(requests.length).toBe(1);
    requests.shift()?.(16);
    expect(requests.length).toBe(1);
    animating = false;
    requests.shift()?.(32);
    expect(requests.length).toBe(0);
    loop.invalidate();
    expect(requests.length).toBe(1);
    loop.setActive(false);
    expect(cancelled).toBe(1);
    loop.invalidate();
    requests.length = 0;
    expect(requests.length).toBe(0);
    loop.setActive(true);
    expect(requests.length).toBe(1);
    loop.dispose();
  });

  it('actors stop requesting frames once held and settled', () => {
    const handle = createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, disableGlb: true });
    handle.apply({ ...defaultDirective(), hold: true });
    for (let i = 0; i < 120; i++) for (const a of [...handle.debug.dogs(), ...handle.debug.humans()]) a.update(1 / 60);
    expect(handle.debug.dogs().every((d) => !d.isAnimating())).toBe(true);
    expect(handle.debug.humans().every((h) => !h.isAnimating())).toBe(true);
    handle.apply({ ...defaultDirective(), hold: false });
    expect(handle.debug.dogs().some((d) => d.isAnimating())).toBe(true);
    handle.dispose();
  });

  it('walking between stage positions ties the step cycle to distance and ends in the directive pose', () => {
    const handle = createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, disableGlb: true });
    handle.apply(defaultDirective());
    const dog = handle.debug.dogs()[0]!;
    handle.apply({ ...defaultDirective(), dogs: [{ ...defaultDirective().dogs[0]!, position: 'rest', pose: 'sit' }] });
    expect(dog.isMoving()).toBe(true);
    expect(dog.pose()).toBe('walk');
    for (let i = 0; i < 60 * 12 && dog.isMoving(); i++) dog.update(1 / 60);
    expect(dog.isMoving()).toBe(false);
    expect(dog.pose()).toBe('sit');
    expect(dog.position().distanceTo(new Vector3(-2.3, 0, -1.5))).toBeLessThan(0.01);
    handle.dispose();
  });
});

describe('GLB tier detection', () => {
  const manifest: AssetManifest = {
    version: 1,
    assets: {
      'dog.nala.puppy': { url: 'assets/models/dog_nala_puppy.glb', status: 'code-authored', bytes: 1, triangles: 1, clips: ['idle_relaxed', 'sit'], textureSizes: [], boundsMeters: null, source: 'test', license: 'test' },
      'dog.bruno.puppy': { url: 'assets/models/dog_bruno_puppy.glb', status: 'placeholder', bytes: null, triangles: null, clips: [], textureSizes: [], boundsMeters: null, source: 'test', license: 'test' },
      'human.mira': { url: 'assets/models/human_mira.glb', status: 'final', bytes: 1, triangles: 1, clips: ['idle'], textureSizes: [], boundsMeters: null, source: 'test', license: 'test' },
      'human.alex': { url: null, status: 'pending', bytes: null, triangles: null, clips: [], textureSizes: [], boundsMeters: null, source: 'test', license: 'test' },
    },
  };

  const skinnedScene = (clipNames: string[]): GLTF => {
    const scene = new Group();
    const bone = new Bone();
    const mesh = new SkinnedMesh(new BufferGeometry());
    mesh.add(bone);
    mesh.bind(new Skeleton([bone]));
    scene.add(mesh);
    return { scene, animations: clipNames.map((name) => new AnimationClip(name, 1, [])) } as unknown as GLTF;
  };

  it('uses GLBs only for code-authored/final entries that load and validate; everything else stays procedural', async () => {
    const loads: string[] = [];
    const manager = createAssetManager({
      baseUrl: '/base',
      fetchManifest: async () => manifest,
      loadGltf: async (url) => {
        loads.push(url);
        if (url.includes('human_mira')) {
          const scene = new Group();
          scene.add(new Mesh(new BufferGeometry()));
          return { scene, animations: [new AnimationClip('idle', 1, [])] } as unknown as GLTF;
        }
        return skinnedScene(['idle_relaxed', 'sit']);
      },
    });
    const nala = await manager.load('dog.nala.puppy', { requireSkinned: true, requiredClips: ['idle_relaxed'] });
    expect(nala?.skinned).toBe(true);
    expect(loads).toEqual(['/base/assets/models/dog_nala_puppy.glb']);
    expect(await manager.load('dog.bruno.puppy', { requireSkinned: true, requiredClips: ['idle_relaxed'] })).toBeNull();
    expect(await manager.load('human.alex', { requireSkinned: true, requiredClips: ['idle'] })).toBeNull();
    // final status but no SkinnedMesh → validation failure → procedural
    expect(await manager.load('human.mira', { requireSkinned: true, requiredClips: ['idle'] })).toBeNull();
    expect(loads.length).toBe(2);
    const a = manager.instantiate('dog.nala.puppy');
    const b = manager.instantiate('dog.nala.puppy');
    expect(a).not.toBe(b);
    expect(a).not.toBeNull();
    manager.release('dog.nala.puppy');
    expect(manager.loadedKeys()).toEqual(['dog.nala.puppy']);
    manager.release('dog.nala.puppy');
    expect(manager.loadedKeys()).toEqual([]);
  });

  it('rejects a file whose manifest clips are missing from the GLB', async () => {
    const manager = createAssetManager({ baseUrl: './', fetchManifest: async () => manifest, loadGltf: async () => skinnedScene(['idle_relaxed']) });
    expect(await manager.load('dog.nala.puppy', { requireSkinned: true, requiredClips: ['idle_relaxed'] })).toBeNull();
  });

  it('actors swap to the GLB tier when the asset resolves and report it in the metrics', async () => {
    const assets = createAssetManager({ baseUrl: './', fetchManifest: async () => manifest, loadGltf: async () => skinnedScene(['idle_relaxed', 'sit']) });
    const handle = createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, assets });
    handle.apply(defaultDirective());
    expect(handle.getMetrics().assetTiers.dog_nala).toBe('procedural');
    await new Promise((r) => setTimeout(r, 10));
    expect(handle.getMetrics().assetTiers.dog_nala).toBe('glb');
    expect(handle.getMetrics().assetTiers.human_mira).toBe('procedural');
    const dog = handle.debug.dogs()[0]!;
    expect(dog.tier()).toBe('glb');
    // Missing clip → fallback pose + timeout, never a blocked promise.
    let resolved = false;
    void dog.play('play_bow').then(() => {
      resolved = true;
    });
    for (let i = 0; i < 100; i++) dog.update(1 / 60);
    await Promise.resolve();
    expect(resolved).toBe(true);
    handle.dispose();
  });
});
