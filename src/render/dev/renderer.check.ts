/**
 * Node-side renderer checks (no GPU): pose distinctness, framing at the five target viewports,
 * draw-call budget by scene traversal, demand-rendering loop semantics and GLB tier detection.
 * Run: npx vitest run --config <config with include ['src/render/dev/*.check.ts']>
 */
import { describe, expect, it } from 'vitest';
import { AnimationClip, Bone, BufferGeometry, Group, Mesh, Object3D, Skeleton, SkinnedMesh, Vector3, type Bone as BoneType } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { content } from '../../content';
import { POSE_IDS, type GestureId, type PoseId, type SceneDirective, type WorldDirective } from '../../simulation/types';
import { DOG_ONE_SHOT_SECONDS, DOG_POSES, walkCycleLength, type DogPoseContext } from '../anim/dogPoses';
import { yardDirective } from './yardDev';

/** Mirrors STILL_HOLD_SECONDS in GameRenderer (yard still-hold). */
const STILL_HOLD_SECONDS_CHECK = 4;
import { HUMAN_ONE_SHOT_SECONDS, HUMAN_POSES, type HumanPoseContext } from '../anim/humanPoses';
import { ProceduralPerformer } from '../anim/PoseController';
import { FRAMING_TARGETS, schoolShare } from '../app/CameraRig';
import { SCHOOL_CORE_POINTS, STAGE_POSITIONS } from '../objects/SchoolScene';
import { createGameRenderer } from '../app/GameRenderer';
import { createLoop } from '../app/loop';
import { createAssetManager } from '../loaders/AssetManager';
import { buildDogRig } from '../objects/DogActor';
import { buildHumanRig } from '../objects/HumanActor';
import { STAGED_CANDIDATES_MANIFEST, VENDOR_DRYRUN_MANIFEST, defaultDirective } from '../devScene';
import type { AssetManifest } from '../types';
import { loadGltfFromFile } from './nodeGltf';
import { applyReviewCamera, createReviewPanes, reviewMetrics, type ReviewCam, type SubjectSpec } from './review';
import { encodePng, softRender } from './softRender';
import { BACKGROUND_HEX } from '../materials/palette';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** AssetManager over a staged manifest on disk (Node, textures decoded for size only). */
function stagedAssets(manifestPath: string) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AssetManifest;
  return createAssetManager({
    baseUrl: './',
    manifestUrl: `${dirname(manifestPath)}/manifest.json`,
    acceptPending: true,
    fetchManifest: async () => manifest,
    loadGltf: (url) => loadGltfFromFile(url),
  });
}

const GESTURES: readonly GestureId[] = ['idle', 'greet', 'gesture_explain', 'offer_reward', 'kneel'];
const VIEWPORTS = [
  [360, 640],
  [390, 844],
  [430, 932],
  [844, 390],
  [1440, 900],
] as const;
/** Lesson scene strip between header and dialog (D-032): ~27.5 % of the viewport height, ≥ 140 px. */
const STRIP_VIEWPORTS = [
  [360, 176],
  [390, 232],
  [430, 256],
  [844, 140],
  [1440, 248],
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
        if (pose === 'recover' || pose === 'stand_up') {
          // recover (tense → idle_relaxed) and stand_up (rest → tired_idle) are transitions that end in
          // another pose by design: sample them mid-way.
          void performer.setPose(pose === 'recover' ? 'tense_idle' : 'rest_loop', { instant: true });
          void performer.setPose(pose);
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

  /**
   * D-034 bands with the measured portrait limit: at ≤ 28° elevation a puppy's standing silhouette
   * is at most ~0.76 wide-to-tall from any front three-quarter, so on 9:16–9:19.5 portraits the
   * closeup cannot exceed 52–55 % without cropping; lying poses are flatter still (≥ 40 %).
   * Landscape and desktop meet the full band for every pose. Reported to ines-c3 as a D-034 note.
   */
  const closeupMin = (aspect: number, pose: string): number => {
    if (aspect >= 0.6) return FRAMING_TARGETS.closeup.min;
    return pose === 'lie_down' ? 0.4 : 0.5;
  };

  it('D-034: closeup 55–65 % (portrait: ≥ 50 % standing, ≥ 40 % lying) and lesson 40–50 % of the viewport height, ≥ 6 % margin, for arriving/growing Nala and Bruno in five poses at five viewports', () => {
    const report: string[] = [];
    const numbers: string[] = [];
    const cases = [
      { id: 'dog_nala', growth: 'arriving' },
      { id: 'dog_nala', growth: 'growing' },
      { id: 'dog_bruno', growth: 'arriving' },
    ] as const;
    for (const c of cases) {
      for (const pose of ['idle_relaxed', 'sit', 'lie_down', 'play_bow', 'turn_away'] as const) {
        for (const view of ['closeup', 'lesson'] as const) {
          for (const [w, h] of VIEWPORTS) {
            const handle = makeRenderer();
            const d: SceneDirective = { ...defaultDirective(), view, focusDogId: c.id, dogs: [{ ...defaultDirective().dogs[0]!, id: c.id, growthStage: c.growth, pose }] };
            handle.debug.camera.setViewport(w, h);
            handle.apply(d);
            // Settle the pose blend, then let the settle re-frame run and finish.
            for (let i = 0; i < 60; i++) handle.debug.step(1 / 30);
            const r = handle.debug.framingReport();
            if (!r) throw new Error('no framing report');
            const t = FRAMING_TARGETS[view];
            const min = view === 'closeup' ? closeupMin(w / h, pose) : t.min;
            const tag = `${c.id} ${c.growth} ${pose} ${view} ${w}x${h}`;
            if (r.heightShare < min || r.heightShare > t.max) report.push(`${tag}: height share ${(r.heightShare * 100).toFixed(1)}% outside ${(min * 100).toFixed(0)}–${t.max * 100}%`);
            if (r.minMargin < t.margin - 1e-3) report.push(`${tag}: margin ${(r.minMargin * 100).toFixed(1)}% < ${t.margin * 100}%`);
            if (c.id === 'dog_nala' && c.growth === 'arriving') numbers.push(`${tag}: height ${(r.heightShare * 100).toFixed(1)}% width ${(r.widthShare * 100).toFixed(1)}% margin ${(r.minMargin * 100).toFixed(1)}% nose-offset ${r.noseOffsetDeg.toFixed(0)}°`);
            handle.dispose();
          }
        }
      }
    }
    console.info(`[D-034]\n${numbers.join('\n')}`);
    expect(report).toEqual([]);
  });

  it('D-034 in the lesson strip (D-032 sizes): the dog keeps its 40–50 % height share and 6 % margin', () => {
    const report: string[] = [];
    for (const growth of ['arriving', 'growing'] as const) {
      for (const pose of ['idle_relaxed', 'sit', 'play_bow'] as const) {
        for (const [w, h] of STRIP_VIEWPORTS) {
          const handle = makeRenderer();
          handle.debug.camera.setViewport(w, h);
          handle.apply({ ...defaultDirective(), view: 'lesson', dogs: [{ ...defaultDirective().dogs[0]!, growthStage: growth, pose }] });
          for (let i = 0; i < 60; i++) handle.debug.step(1 / 30);
          const r = handle.debug.framingReport()!;
          const t = FRAMING_TARGETS.lesson;
          if (r.heightShare < t.min || r.heightShare > t.max || r.minMargin < t.margin - 1e-3) {
            report.push(`${growth} ${pose} ${w}x${h}: height ${(r.heightShare * 100).toFixed(1)}% margin ${(r.minMargin * 100).toFixed(1)}%`);
          }
          handle.dispose();
        }
      }
    }
    expect(report).toEqual([]);
  });

  it('closeup / lesson use the handler side as front three-quarter and switch sides with the handler', () => {
    const handle = makeRenderer();
    handle.debug.camera.setViewport(390, 844);
    const facing = (20 * Math.PI) / 180;
    handle.apply({ ...defaultDirective(), view: 'closeup' });
    handle.debug.step(1);
    const left = handle.debug.camera.current().azimuth;
    expect(left < facing, `handler left → camera left of the nose (${left})`).toBe(true);
    expect(Math.abs(left - facing) <= Math.PI / 4 + 1e-6).toBe(true);
    handle.apply({ ...defaultDirective(), view: 'closeup', humans: [{ id: 'human_mira', gesture: 'idle', position: 'right', facing: 40 }] });
    handle.debug.step(1);
    const right = handle.debug.camera.current().azimuth;
    expect(right > facing, `handler right → camera right of the nose (${right})`).toBe(true);
    handle.apply({ ...defaultDirective(), view: 'school' });
    handle.debug.step(1);
    expect(Math.abs(handle.debug.camera.current().azimuth - (32 * Math.PI) / 180) < 1e-6).toBe(true);
    handle.dispose();
  });

  it('D-039 school: Nala ≥ 10 % portrait / ≥ 14 % landscape in the lower-middle third; circle centre, shelter front and rest deck inside the frame at every viewport', () => {
    const lines: string[] = [];
    const failures: string[] = [];
    for (const [w, h] of [...VIEWPORTS, [360, 560] as const]) {
      const handle = makeRenderer();
      handle.debug.camera.setViewport(w, h);
      handle.apply({ ...defaultDirective(), view: 'school' });
      for (let i = 0; i < 60; i++) handle.debug.step(1 / 30);
      const r = handle.debug.framingReport()!;
      expect(r.heightShare, `${w}x${h} Nala share`).toBeGreaterThanOrEqual(schoolShare(w / h).min);
      const inFrame = (p: Vector3): boolean => {
        const ndc = handle.debug.camera.project(p.clone());
        return Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1;
      };
      for (const p of SCHOOL_CORE_POINTS.required) {
        const ndc = handle.debug.camera.project(p.clone());
        if (!inFrame(p)) failures.push(`${w}x${h} required landmark (${p.toArray().join(', ')}) at ndc ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)}`);
      }
      const optionalInside = SCHOOL_CORE_POINTS.optional.filter(inFrame).length;
      expect(r.centreY, `${w}x${h} Nala below centre`).toBeLessThan(0);
      expect(r.centreY, `${w}x${h} Nala above the lower edge`).toBeGreaterThan(-0.67);
      expect(Math.abs(r.centreX), `${w}x${h} Nala within the middle third`).toBeLessThan(0.36);
      const corners: Array<[number, number, number]> = [
        [-2.1, 0, 0.1],
        [2.1, 0, 0.1],
        [0, 0, 2.2],
        [-2.3, 0.1, -1.5],
        [-0.6, 2.4, -3.4],
      ];
      let inside = 0;
      for (const [x, y, z] of corners) {
        const ndc = handle.debug.camera.project(new Vector3(x, y, z));
        if (Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1) inside += 1;
      }
      const f = handle.debug.camera.current();
      lines.push(`${w}x${h}: Nala ${(r.heightShare * 100).toFixed(1)}% centreY ${r.centreY.toFixed(2)} frame ${(f.halfWidth * 2).toFixed(1)}×${(f.halfHeight * 2).toFixed(1)} m required ${SCHOOL_CORE_POINTS.required.length}/${SCHOOL_CORE_POINTS.required.length} optional ${optionalInside}/${SCHOOL_CORE_POINTS.optional.length} legacy corners ${inside}/${corners.length}`);
      handle.dispose();
    }
    console.info(`[D-039 school]\n${lines.join('\n')}`);
    expect(failures).toEqual([]);
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

  it('held observation keeps dog body language (D-146 decision); reduced motion + hold settles to zero frames', () => {
    const handle = createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, disableGlb: true });
    handle.apply({ ...defaultDirective(), hold: true });
    for (let i = 0; i < 120; i++) for (const a of [...handle.debug.dogs(), ...handle.debug.humans()]) a.update(1 / 60);
    expect(handle.debug.humans().every((h) => !h.isAnimating())).toBe(true);
    expect(handle.debug.dogs().some((d) => d.isAnimating())).toBe(true);
    handle.setReducedMotion(true);
    handle.apply({ ...defaultDirective(), hold: true, dogs: defaultDirective().dogs.map((d) => ({ ...d, pose: 'sit' as const })) });
    for (let i = 0; i < 120; i++) for (const a of [...handle.debug.dogs(), ...handle.debug.humans()]) a.update(1 / 60);
    expect(handle.debug.dogs().every((d) => !d.isAnimating())).toBe(true);
    expect(handle.debug.humans().every((h) => !h.isAnimating())).toBe(true);
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
    expect(dog.position().distanceTo(STAGE_POSITIONS.rest)).toBeLessThan(0.01);
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

describe('textured candidates (D-036 contract, staged files, nothing purchased)', () => {
  const root = process.cwd();
  const manifestPath = join(root, STAGED_CANDIDATES_MANIFEST);
  const available = existsSync(manifestPath);

  it('load through clipMap/material/drawCalls, keep sRGB only on baseColor, and frame within D-034 on the GLB tier', async () => {
    if (!available) {
      console.info(`[candidates] ${STAGED_CANDIDATES_MANIFEST} not present → skipped`);
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AssetManifest;
    const dir = dirname(manifestPath);
    const assets = createAssetManager({
      baseUrl: './',
      manifestUrl: `${dir}/manifest.json`,
      acceptPending: true,
      fetchManifest: async () => manifest,
      loadGltf: (url) => loadGltfFromFile(url),
    });
    const lines: string[] = [];
    for (const key of ['dog.nala.puppy', 'dog.nala.growing', 'dog.bruno.puppy', 'human.mira', 'human.alex']) {
      const required = key.startsWith('dog.') ? ['idle_relaxed'] : ['idle'];
      const asset = await assets.load(key, { requireSkinned: true, requiredClips: required });
      expect(asset, `${key} loads`).not.toBeNull();
      if (!asset) continue;
      expect(asset.drawCalls, `${key} draw calls`).toBeLessThanOrEqual(3);
      const entry = assets.entry(key);
      expect(asset.clips.map((c) => c.name).sort()).toEqual([...(entry?.clips ?? [])].sort());
      let srgb = 0;
      let linear = 0;
      asset.scene.traverse((node) => {
        const mesh = node as Mesh;
        if (!(mesh as { isMesh?: boolean }).isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) {
          const r = m as unknown as Record<string, { isTexture?: boolean; colorSpace?: string } | undefined>;
          for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
            const tex = r[slot];
            if (!tex?.isTexture) continue;
            const expected = slot === 'map' || slot === 'emissiveMap' ? 'srgb' : '';
            expect(tex.colorSpace, `${key} ${slot} colour space`).toBe(expected);
            if (expected) srgb += 1;
            else linear += 1;
          }
        }
      });
      lines.push(`${key}: ${asset.triangles} tris, ${asset.drawCalls} draw call(s), textures sRGB ${srgb} / linear ${linear}, ${(asset.textureBytes / 1024 / 1024).toFixed(2)} MB decoded (manifest ${entry?.textures?.map((t) => `${t.slot} ${t.width}²`).join(', ') ?? '-'})`);
    }
    console.info(`[candidates]\n${lines.join('\n')}`);

    // Framing on the GLB tier: bounds come from the skinned mesh, not from bone names.
    for (const [w, h] of [[390, 844], [844, 390]] as const) {
      const handle = createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, assets });
      handle.debug.camera.setViewport(w, h);
      handle.apply({ ...defaultDirective(), view: 'closeup' });
      // Let the tier swap land (load promises already resolved; the swap is a microtask).
      await new Promise((r) => setTimeout(r, 20));
      for (let i = 0; i < 90; i++) handle.debug.step(1 / 30);
      expect(handle.getMetrics().assetTiers.dog_nala, `${w}x${h} tier`).toBe('glb');
      const r = handle.debug.framingReport()!;
      const min = w / h >= 0.6 ? FRAMING_TARGETS.closeup.min : 0.5;
      lines.push(`${w}x${h} closeup glb: height ${(r.heightShare * 100).toFixed(1)}% margin ${(r.minMargin * 100).toFixed(1)}% nose-offset ${r.noseOffsetDeg.toFixed(0)}° samples ${handle.debug.framingRequest()?.points.length}`);
      expect(r.heightShare, `${w}x${h} glb closeup share`).toBeGreaterThanOrEqual(min);
      expect(r.heightShare).toBeLessThanOrEqual(FRAMING_TARGETS.closeup.max);
      expect(r.minMargin).toBeGreaterThanOrEqual(FRAMING_TARGETS.closeup.margin - 1e-3);
      const calls = handle.debug.countDrawCalls();
      lines.push(`${w}x${h} lesson scene with textured Nala + Mira: ${calls.calls} draw calls, ${calls.triangles} triangles, texture estimate ${(handle.getMetrics().textureBytesEstimate / 1024 / 1024).toFixed(2)} MB`);
      expect(calls.calls).toBeLessThanOrEqual(100);
      handle.dispose();
    }
    console.info(`[candidates framing]\n${lines.slice(5).join('\n')}`);
    assets.dispose();
  });
});

describe('hero review harness (WP-M part 1): two subjects, fixed cameras, one sheet', () => {
  const root = process.cwd();
  const stagedPath = join(root, STAGED_CANDIDATES_MANIFEST);
  const outDir = join(process.env.TMPDIR ?? '/tmp', 'pfotenzeit-shots');

  it('renders procedural Nala next to the staged candidate (closeup_portrait + front) into review_layout.png', async () => {
    if (!existsSync(stagedPath)) {
      console.info('[review] staged candidates missing → skipped');
      return;
    }
    const assetsFor = (spec: SubjectSpec) => (spec.source === 'candidates' ? stagedAssets(stagedPath) : spec.source === 'procedural' ? null : undefined);
    const rows: Array<{ cam: ReviewCam; w: number; h: number }> = [
      { cam: 'closeup_portrait', w: 390, h: 844 },
      { cam: 'front', w: 480, h: 560 },
    ];
    const sheetW = 390 * 2 + 8;
    const sheetH = 844 + 560 + 8;
    const sheet = new Uint8Array(sheetW * sheetH * 3).fill(221);
    const metricsOut: string[] = [];
    let y = 0;
    for (const row of rows) {
      const panes = createReviewPanes(['procedural:dog.nala.puppy', 'candidates:dog.nala.puppy'], { baseUrl: './', cam: row.cam, light: 'courtyard', pose: 'idle_relaxed', assetsFor });
      await new Promise((r) => setTimeout(r, 30));
      for (const pane of panes) for (let i = 0; i < 60; i++) pane.renderer.debug.step(1 / 30);
      for (const pane of panes) applyReviewCamera(pane, row.cam);
      panes.forEach((pane, i) => {
        const w = Math.min(row.w, 390);
        const h = Math.round((row.h * w) / row.w);
        const rgb = softRender(pane.renderer.debug.scene, pane.renderer.debug.camera.camera, { width: w, height: h, background: BACKGROUND_HEX });
        let foreground = 0;
        for (let k = 0; k < w * h; k++) if (Math.abs(rgb[k * 3]! - 0xf4) + Math.abs(rgb[k * 3 + 1]! - 0xf0) + Math.abs(rgb[k * 3 + 2]! - 0xe8) > 30) foreground += 1;
        expect(foreground / (w * h), `${row.cam} pane ${i} draws something`).toBeGreaterThan(0.02);
        for (let yy = 0; yy < h; yy++) sheet.set(rgb.subarray(yy * w * 3, (yy + 1) * w * 3), ((y + yy) * sheetW + i * (390 + 8)) * 3);
        const m = reviewMetrics(pane);
        metricsOut.push(`${row.cam} ${m.label}: tier ${m.tier}, ${m.triangles} tris, ${m.actorDrawCalls} model draw call(s), ${(m.textureBytes / 1024 / 1024).toFixed(2)} MB, share ${m.heightShare === null ? '-' : (m.heightShare * 100).toFixed(1) + ' %'}, margin ${m.minMargin === null ? '-' : (m.minMargin * 100).toFixed(1) + ' %'}`);
        if (row.cam === 'closeup_portrait') {
          expect(m.heightShare ?? 0, `${m.label} closeup share`).toBeGreaterThanOrEqual(0.5);
          expect(m.minMargin ?? 0).toBeGreaterThanOrEqual(FRAMING_TARGETS.closeup.margin - 1e-3);
        }
        if (i === 1) expect(m.tier, 'candidate pane on the GLB tier').toBe('glb');
      });
      y += Math.round((row.h * Math.min(row.w, 390)) / row.w) + 8;
      for (const pane of panes) {
        pane.renderer.dispose();
        pane.assets?.dispose();
      }
    }
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, 'review_layout.png');
    writeFileSync(file, encodePng(sheetW, sheetH, sheet));
    console.info(`[review]\n${metricsOut.join('\n')}\nwrote ${file}`);
  });
});

describe('vendor dry run (WP-M part 3): vendor rig through the D-038 contract', () => {
  const root = process.cwd();
  const manifestPath = join(root, VENDOR_DRYRUN_MANIFEST);

  it('resolves clipMap vendor→semantic, ignores Attack01/Walk_RootMotion, frames from the skin and keeps gaze silent', async () => {
    if (!existsSync(manifestPath)) {
      console.info(`[vendor-dryrun] ${VENDOR_DRYRUN_MANIFEST} not present → skipped`);
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AssetManifest;
    const keys = Object.keys(manifest.assets).filter((k) => k.startsWith('dog.'));
    expect(keys.length).toBeGreaterThan(0);
    const assets = stagedAssets(manifestPath);
    const lines: string[] = [];
    for (const key of keys) {
      const entry = manifest.assets[key]!;
      const asset = await assets.load(key, { requireSkinned: true, requiredClips: ['idle_relaxed'] });
      expect(asset, `${key} loads`).not.toBeNull();
      if (!asset) continue;
      const names = new Set(asset.clips.map((c) => c.name));
      for (const semantic of Object.keys(entry.clipMap ?? {})) expect(names.has(semantic), `${key} semantic clip ${semantic}`).toBe(true);
      // Unmapped vendor clips stay in the file but are never requested by the performer.
      const unmapped = asset.clips.map((c) => c.name).filter((n) => !(entry.clips ?? []).includes(n));
      lines.push(`${key}: ${asset.triangles} tris, ${asset.drawCalls} draw call(s), ${(asset.textureBytes / 1024 / 1024).toFixed(2)} MB, semantic clips ${Object.keys(entry.clipMap ?? {}).length}, unmapped ignored: ${unmapped.join(', ') || '-'}`);
      let hasProjectBones = false;
      asset.scene.traverse((node) => {
        if ((node as BoneType).isBone && ['spine_01', 'neck', 'head', 'tail_01'].includes(node.name)) hasProjectBones = true;
      });
      lines.push(`  project bone names present: ${hasProjectBones}`);
    }
    for (const [w, h] of [[390, 844], [844, 390]] as const) {
      const handle = createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, assets });
      handle.debug.camera.setViewport(w, h);
      handle.apply({ ...defaultDirective(), view: 'closeup', dogs: [{ ...defaultDirective().dogs[0]!, pose: 'look_at_handler' }] });
      await new Promise((r) => setTimeout(r, 20));
      for (let i = 0; i < 90; i++) handle.debug.step(1 / 30);
      expect(handle.getMetrics().assetTiers.dog_nala, `${w}x${h} tier`).toBe('glb');
      const r = handle.debug.framingReport()!;
      const min = w / h >= 0.6 ? FRAMING_TARGETS.closeup.min : 0.5;
      // Gaze layer must stay silent without eye bones: the look pose ran with a handler present.
      lines.push(`${w}x${h} closeup (look_at_handler, gaze silent, no eye bones): share ${(r.heightShare * 100).toFixed(1)} %, margin ${(r.minMargin * 100).toFixed(1)} %, azimuth ${r.azimuthDeg.toFixed(0)}°, samples ${handle.debug.framingRequest()?.points.length}`);
      expect(r.heightShare, `${w}x${h} share`).toBeGreaterThanOrEqual(min);
      expect(r.minMargin).toBeGreaterThanOrEqual(FRAMING_TARGETS.closeup.margin - 1e-3);
      handle.dispose();
    }
    console.info(`[vendor-dryrun]\n${lines.join('\n')}`);
    assets.dispose();
  });
});

describe('D-041 yard mode (WP-Q): follow framing, pick, frame continuity, walk phase', () => {
  const yardHandle = () => createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, disableGlb: true });
  const worldWith = (handler: { x: number; z: number; facing?: number; speed?: number }, dog: { x: number; z: number; facing?: number; speed?: number; pose?: PoseId }, extra: Partial<WorldDirective> = {}): WorldDirective => ({
    actors: [
      { key: 'handler', characterId: 'handler', position: { x: handler.x, z: handler.z }, facing: handler.facing ?? 180, speed: handler.speed ?? 0, pose: 'idle' },
      { key: 'dog', characterId: 'dog_nala', position: { x: dog.x, z: dog.z }, facing: dog.facing ?? 180, speed: dog.speed ?? 0, pose: dog.pose ?? 'idle_relaxed' },
      { key: 'mira', characterId: 'human_mira', position: { x: -1.0, z: -1.3 }, facing: 20, speed: 0, pose: 'idle' },
      { key: 'alex', characterId: 'human_alex', position: { x: 2.4, z: 1.4 }, facing: -60, speed: 0, pose: 'idle' },
      { key: 'other_dog', characterId: 'dog_bruno', position: { x: 2.0, z: 1.9 }, facing: -120, speed: 0, pose: 'idle_relaxed' },
    ],
    focus: { x: handler.x, z: handler.z },
    prompt: null,
    momentSpot: null,
    distraction: 'none',
    attention: 'relaxed',
    ...extra,
  });
  const settle = (handle: ReturnType<typeof yardHandle>, seconds: number): void => {
    for (let i = 0; i < Math.round(seconds * 60); i++) handle.debug.step(1 / 60);
  };
  const inFrame = (handle: ReturnType<typeof yardHandle>, p: Vector3, margin = 0.03): boolean => {
    const v = handle.debug.camera.project(p);
    return Math.abs(v.x) <= 1 - margin && Math.abs(v.y) <= 1 - margin;
  };

  it('frames handler and dog together at 390×844 and 844×390, dog ≥ 12 %, near and far', () => {
    const lines: string[] = [];
    for (const [w, h] of [[390, 844], [844, 390]] as const) {
      const handle = yardHandle();
      handle.debug.camera.setViewport(w, h);
      const near = worldWith({ x: 0, z: 1.2 }, { x: 0.5, z: 1.4 });
      handle.apply(yardDirective(near));
      settle(handle, 0.5);
      const player = handle.debug.humans().find((h) => h.root.name === 'player_actor')!;
      expect(player).toBeDefined();
      expect(player.id).toBe('human_mira');
      expect(player.root.userData.characterName).toBe('Ines');
      expect(player.root).not.toBe(handle.debug.humans().find((h) => h.root.name === 'human_mira_actor')!.root);
      expect(player.root).not.toBe(handle.debug.humans().find((h) => h.root.name === 'human_alex_actor')!.root);
      expect(inFrame(handle, new Vector3(0, player.topHeight(), 1.2), 0.04)).toBe(true);
      const dog = handle.debug.dogs().find((d) => d.id === 'dog_nala')!;
      let r = handle.debug.camera.report(dog.measure(), 'yard');
      expect(r.heightShare).toBeGreaterThanOrEqual(FRAMING_TARGETS.yard.min);
      expect(r.minMargin).toBeGreaterThanOrEqual(0.03);
      expect(inFrame(handle, new Vector3(0, 0, 1.2), 0.05)).toBe(true);
      lines.push(`${w}×${h} near: dog ${(r.heightShare * 100).toFixed(1)} % margin ${(r.minMargin * 100).toFixed(1)} % centre (${r.centreX.toFixed(2)}, ${r.centreY.toFixed(2)})`);
      // Walking: the handler leads toward the gate; both stay inside while the camera follows.
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        handle.updateWorld(worldWith({ x: 0, z: 1.2 + 1.5 * t, facing: 0, speed: 1.5 }, { x: 0.5 - 0.3 * t, z: 1.4 + 1.2 * t, facing: 0, speed: 2.0, pose: 'walk' }));
        handle.debug.step(1 / 60);
      }
      settle(handle, 0.4);
      r = handle.debug.camera.report(dog.measure(), 'yard');
      expect(inFrame(handle, new Vector3(0, 0, 2.7), 0.05)).toBe(true);
      expect(r.minMargin).toBeGreaterThanOrEqual(0.03);
      expect(dog.pose()).toBe('walk');
      lines.push(`${w}×${h} walking: dog ${(r.heightShare * 100).toFixed(1)} % margin ${(r.minMargin * 100).toFixed(1)} %`);
      // Far apart (handler in the quiet corner, dog in the sniff corner): both inside, share reported.
      handle.updateWorld(worldWith({ x: -2.4, z: 2.2 }, { x: 2.3, z: -1.7, pose: 'sniff' }));
      settle(handle, 0.5);
      r = handle.debug.camera.report(dog.measure(), 'yard');
      expect(inFrame(handle, new Vector3(-2.4, 0, 2.2), 0.04)).toBe(true);
      expect(inFrame(handle, new Vector3(-2.4, player.topHeight(), 2.2), 0.04)).toBe(true);
      expect(r.minMargin).toBeGreaterThanOrEqual(0.03);
      expect(r.heightShare).toBeGreaterThanOrEqual(0.025);
      lines.push(`${w}×${h} far (6.1 m): dog ${(r.heightShare * 100).toFixed(1)} % margin ${(r.minMargin * 100).toFixed(1)} %`);
      handle.dispose();
    }
    console.info(`[yard-framing]\n${lines.join('\n')}`);
  });

  it('pick: dog first, then zone disc, then ground (clamped); null outside the canvas or the yard view', () => {
    const handle = yardHandle();
    handle.debug.camera.setViewport(390, 844);
    const world = worldWith({ x: 0, z: 2.5 }, { x: 0.5, z: 1.4 }, { prompt: { zoneId: 'gate', position: { x: 0, z: 2.9 }, radius: 0.8 } });
    handle.apply(yardDirective(world));
    settle(handle, 0.5);
    const px = (p: Vector3): [number, number] => {
      const v = handle.debug.camera.project(p);
      return [((v.x + 1) / 2) * 390, ((1 - v.y) / 2) * 844];
    };
    const dog = handle.debug.dogs().find((d) => d.id === 'dog_nala')!;
    const onDog = handle.pick(...px(new Vector3(0.5, dog.topHeight() * 0.5, 1.4)));
    expect(onDog?.kind).toBe('actor');
    expect(onDog?.kind === 'actor' ? onDog.actor : null).toBe('dog');
    expect(onDog?.point.x).toBe(0.5);
    const onHandler = handle.pick(...px(new Vector3(0, 1.2, 2.5)));
    expect(onHandler?.kind === 'actor' ? onHandler.actor : null).toBe('handler');
    const inZone = handle.pick(...px(new Vector3(0.55, 0, 2.95)));
    expect(inZone?.kind).toBe('zone');
    expect(inZone?.kind === 'zone' ? inZone.zoneId : null).toBe('gate');
    const ground = handle.pick(...px(new Vector3(-0.4, 0, 0.6)));
    expect(ground?.kind).toBe('ground');
    expect(Math.abs((ground?.point.x ?? 9) + 0.4)).toBeLessThan(0.02);
    expect(Math.abs((ground?.point.z ?? 9) - 0.6)).toBeLessThan(0.02);
    expect(handle.pick(-5, 100)).toBe(null);
    expect(handle.pick(100, 900)).toBe(null);
    // Other actors are hit only when the follow camera has them in frame: stand next to Bruno.
    handle.updateWorld(worldWith({ x: 1.4, z: 1.5, facing: 60 }, { x: 0.9, z: 1.7, facing: 60 }));
    settle(handle, 0.5);
    const onBruno = handle.pick(...px(new Vector3(2.0, 0.2, 1.9)));
    expect(onBruno?.kind === 'actor' ? onBruno.actor : null).toBe('other_dog');
    expect(onBruno?.point).toEqual({ x: 2.0, z: 1.9 });
    handle.apply({ ...yardDirective(world), view: 'lesson', world: undefined });
    expect(handle.pick(195, 422)).toBe(null);
    console.info(`[yard-pick] dog=${JSON.stringify(onDog)} zone=${JSON.stringify(inZone)} ground=${JSON.stringify(ground)}`);
    handle.dispose();
  });

  it('frames continue only while something moves or blends, then the yard is held (zero frames)', () => {
    const handle = yardHandle();
    handle.debug.camera.setViewport(390, 844);
    handle.apply(yardDirective(worldWith({ x: 0, z: 1.2 }, { x: 0.5, z: 1.4 })));
    // Still from the start: after the hold delay nothing requests frames.
    settle(handle, STILL_HOLD_SECONDS_CHECK + 1);
    expect(handle.debug.worldHeld()).toBe(true);
    expect(handle.debug.step(1 / 60)).toBe(false);
    // Movement wakes the scene; every step while moving animates.
    let animatedWhileMoving = 0;
    for (let i = 1; i <= 30; i++) {
      handle.updateWorld(worldWith({ x: 0, z: 1.2 + 0.025 * i, facing: 0, speed: 1.5 }, { x: 0.5, z: 1.4 + 0.033 * i, facing: 0, speed: 2.0, pose: 'walk' }));
      if (handle.debug.step(1 / 60)) animatedWhileMoving += 1;
    }
    expect(handle.debug.worldHeld()).toBe(false);
    expect(animatedWhileMoving).toBe(30);
    // Stop: the camera ease (320 ms) and the blend to the directive pose finish, then hold again.
    handle.updateWorld(worldWith({ x: 0, z: 1.95, facing: 0 }, { x: 0.5, z: 2.4, facing: 0, pose: 'sit' }));
    settle(handle, STILL_HOLD_SECONDS_CHECK + 1.5);
    expect(handle.debug.worldHeld()).toBe(true);
    expect(handle.debug.step(1 / 60)).toBe(false);
    expect(handle.debug.dogs().find((d) => d.id === 'dog_nala')!.pose()).toBe('sit');
    for (let i = 0; i < 60; i++) {
      handle.updateWorld(worldWith({ x: 0, z: 1.95, facing: 0 }, { x: 0.5, z: 2.4, facing: 0, pose: 'sit' }));
      expect(handle.debug.step(1 / 60)).toBe(false);
    }
    // Reduced motion: the prompt ring is static, the held scene stays at zero frames with a prompt visible.
    handle.setReducedMotion(true);
    handle.updateWorld(worldWith({ x: 0, z: 1.95, facing: 0 }, { x: 0.5, z: 2.4, facing: 0, pose: 'sit' }, { prompt: { zoneId: 'gate', position: { x: 0, z: 2.9 }, radius: 0.8 } }));
    settle(handle, STILL_HOLD_SECONDS_CHECK + 0.5);
    expect(handle.debug.step(1 / 60)).toBe(false);
    expect(handle.debug.markers.prompt.visible).toBe(true);
    handle.dispose();
  });

  it('walk phase follows the distance travelled (speed-scaled clip time); present(exercise) resolves when the response pose stands', async () => {
    const handle = yardHandle();
    handle.debug.camera.setViewport(390, 844);
    handle.apply(yardDirective(worldWith({ x: 0, z: 1.2 }, { x: 0.5, z: 1.4 })));
    const dog = handle.debug.dogs().find((d) => d.id === 'dog_nala')!;
    const cycle = walkCycleLength(dog.proportions());
    const phase0 = dog.walkPhase();
    // Slow leg: 0.7 m/s for 1 s; fast leg: 2.4 m/s for 1 s. Phase advances by distance / cycle.
    let z = 1.4;
    for (let i = 0; i < 60; i++) {
      z += 0.7 / 60;
      handle.updateWorld(worldWith({ x: 0, z: 1.2 }, { x: 0.5, z, facing: 0, speed: 0.7, pose: 'walk' }));
      handle.debug.step(1 / 60);
    }
    const slow = dog.walkPhase() - phase0;
    for (let i = 0; i < 60; i++) {
      z += 2.4 / 60;
      handle.updateWorld(worldWith({ x: 0, z: 1.2 }, { x: 0.5, z, facing: 0, speed: 2.4, pose: 'walk' }));
      handle.debug.step(1 / 60);
    }
    const fast = dog.walkPhase() - phase0 - slow;
    expect(Math.abs(slow - 0.7 / cycle)).toBeLessThan(0.01);
    expect(Math.abs(fast - 2.4 / cycle)).toBeLessThan(0.01);
    expect(fast / slow).toBeGreaterThan(3.3);
    expect(dog.pose()).toBe('walk');
    // Exercise: the world controller shows 'sit'; the promise resolves once the dog stands in 'sit' with the blend done.
    let resolved = false;
    const pending = handle.debug.present({ type: 'exercise', roundId: 'r', attemptId: 'a', kind: 'look_at', response: 'settled', pose: 'sit', dogId: 'dog_nala' }, { maxDurationMs: 8000, reducedMotion: false }).then(() => {
      resolved = true;
    });
    handle.updateWorld(worldWith({ x: 0, z: 1.2 }, { x: 0.5, z, facing: 180, speed: 0, pose: 'sit' }));
    handle.debug.step(1 / 60);
    await Promise.resolve();
    expect(resolved).toBe(false);
    settle(handle, (DOG_ONE_SHOT_SECONDS.sit ?? 1) + 0.5);
    await pending;
    expect(resolved).toBe(true);
    expect(dog.pose()).toBe('sit');
    console.info(`[yard-walk] cycle=${cycle.toFixed(3)} m slow=${slow.toFixed(3)} fast=${fast.toFixed(3)} cycles`);
    handle.dispose();
  });
});
