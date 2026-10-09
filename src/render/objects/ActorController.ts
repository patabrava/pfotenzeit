/**
 * Actor controllers: wrap a Performer (procedural or GLB) with stage movement, facing, look
 * targets, hold, growth rebuilds and the tier swap. The UI never sees which tier is active.
 */
import { Group, Vector3 } from 'three';
import type { DogCharacter, HumanCharacter } from '../../content/types';
import type { DogCharacterId, DogDirective, GestureId, GrowthStage, HumanCharacterId, HumanDirective, PoseId, StagePosition } from '../../simulation/types';
import { POSE_IDS } from '../../simulation/types';
import { DOG_ONE_SHOT_SECONDS, DOG_POSES, walkCycleLength, walkSpeed, type DogPoseContext } from '../anim/dogPoses';
import { HUMAN_ONE_SHOT_SECONDS, HUMAN_POSES, type HumanPoseContext } from '../anim/humanPoses';
import { MixerPerformer, ProceduralPerformer, type AssetTier, type Performer, type SetPoseOptions } from '../anim/PoseController';
import type { AssetManager } from '../loaders/AssetManager';
import { buildDogRig, dogAssetKey, dogProportions, type DogProportions } from './DogActor';
import { buildHumanRig, humanAssetKey } from './HumanActor';
import { disposeRig } from './rigBuilder';
import { STAGE_POSITIONS, createContactShadow } from './SchoolScene';

const DEG = Math.PI / 180;
const FACING_SECONDS = 0.4;
const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const DOG_LOOP_POSES: ReadonlySet<PoseId> = new Set<PoseId>(['idle_relaxed', 'sniff', 'walk', 'rest_loop', 'tense_idle', 'tired_idle']);
export const HUMAN_LOOP_POSES: ReadonlySet<GestureId> = new Set<GestureId>(['idle', 'gesture_explain', 'kneel']);

export interface ActorBase<P extends string> {
  readonly root: Group;
  tier(): AssetTier;
  pose(): P;
  position(): Vector3;
  facing(): number;
  setHold(hold: boolean): void;
  play(pose: P, options?: SetPoseOptions): Promise<void>;
  update(dt: number): boolean;
  isAnimating(): boolean;
  triangles(): number;
  dispose(): void;
}

export interface DogActorController extends ActorBase<PoseId> {
  readonly id: DogCharacterId;
  growth(): GrowthStage;
  proportions(): DogProportions;
  /** Visual extent (body + tail) used by the camera rig. */
  extent(): number;
  /** Where the dog will stand once any walk completes. */
  destination(): Vector3;
  applyDirective(directive: DogDirective, options: { instant: boolean; lookTarget: Vector3 | null }): void;
  /** Rebuild for a growth stage (never mid-animation: callers wait for present() to finish). */
  setGrowth(stage: GrowthStage): void;
  /** Uniform visual scale (growth presentation only). */
  setVisualScale(scale: number): void;
  isMoving(): boolean;
}

export interface HumanActorController extends ActorBase<GestureId> {
  readonly id: HumanCharacterId;
  applyDirective(directive: HumanDirective, options: { instant: boolean }): void;
}

interface Mover {
  from: Vector3;
  to: Vector3;
  length: number;
  travelled: number;
  speed: number;
  cycle: number;
}

function stagePoint(position: StagePosition): Vector3 {
  return STAGE_POSITIONS[position].clone();
}

export interface DogActorOptions {
  id: DogCharacterId;
  growth: GrowthStage;
  character: DogCharacter;
  assets: AssetManager | null;
  onTierChange?: (id: DogCharacterId, tier: AssetTier) => void;
  onInvalidate?: () => void;
}

export function createDogActor(options: DogActorOptions): DogActorController {
  const { id, character } = options;
  const root = new Group();
  root.name = `${id}_actor`;
  let growth = options.growth;
  let props = dogProportions(id, growth, character);
  let performer: Performer<PoseId> | null = null;
  let glbKey: string | null = null;
  let triangles = 0;
  let disposed = false;
  let generation = 0;
  let currentPose: PoseId = 'idle_relaxed';
  let hold = false;
  let look: { yaw: number; pitch: number } = { yaw: 0, pitch: 0 };
  let lookTarget: Vector3 | null = null;
  const shadow = createContactShadow(1);
  root.add(shadow);

  // Facing (radians) and movement.
  let facingNow = 0;
  let facingFrom = 0;
  let facingTo = 0;
  let facingT = 1;
  let mover: Mover | null = null;
  let deferredPose: PoseId | null = null;
  let visualScale = 1;
  /** Facing requested by the last directive (applied after a walk). */
  let lastFacingRequest: number | null = null;

  const fitShadow = (): void => {
    const r = props.bodyLength * 0.75;
    shadow.scale.set(r, r * 0.8, 1);
    shadow.position.z = -props.bodyLength * 0.1;
  };

  const attach = (next: Performer<PoseId>, key: string | null): void => {
    if (performer) {
      performer.dispose();
      performer.object.removeFromParent();
      if (glbKey && options.assets) options.assets.release(glbKey);
    }
    performer = next;
    glbKey = key;
    root.add(next.object);
    next.object.scale.setScalar(visualScale);
    next.setHold(hold);
    next.setLook(look.yaw, look.pitch);
    void next.setPose(currentPose, { instant: true });
    fitShadow();
    options.onTierChange?.(id, next.tier);
    options.onInvalidate?.();
  };

  const buildProcedural = (): void => {
    const rig = buildDogRig(id, growth, character);
    rig.mesh.castShadow = true;
    triangles = rig.triangles;
    const context: Omit<DogPoseContext, 'hold' | 'walkPhase' | 'lookYaw' | 'lookPitch' | 'scratch'> = {
      p: rig.proportions,
      earStyle: rig.proportions.earStyle,
    };
    const next = new ProceduralPerformer<PoseId, DogPoseContext>({
      rig,
      poses: DOG_POSES,
      oneShotSeconds: DOG_ONE_SHOT_SECONDS,
      initialPose: currentPose,
      context,
    });
    // Procedural rigs own their geometry: dispose it when the performer is replaced.
    const originalDispose = next.dispose.bind(next);
    next.dispose = () => {
      originalDispose();
      disposeRig(rig);
    };
    attach(next, null);
  };

  const tryGlb = (): void => {
    const assets = options.assets;
    if (!assets) return;
    const key = dogAssetKey(id, growth);
    const myGeneration = generation;
    void assets
      .load(key, { requireSkinned: true, requiredClips: ['idle_relaxed'] })
      .then((asset) => {
        if (!asset || disposed || myGeneration !== generation) return;
        const instance = assets.instantiate(key);
        if (!instance) return;
        const holder = new Group();
        holder.name = `${id}_glb`;
        holder.add(instance);
        const next = new MixerPerformer<PoseId>({
          root: holder,
          clips: asset.clips,
          loops: DOG_LOOP_POSES,
          initialPose: currentPose,
          fallbackPose: 'idle_relaxed',
          walkPose: 'walk',
          label: key,
        });
        triangles = asset.triangles;
        attach(next, key);
      });
  };

  const rebuild = (): void => {
    generation += 1;
    props = dogProportions(id, growth, character);
    buildProcedural();
    tryGlb();
  };

  const setFacing = (degrees: number, instant: boolean): void => {
    const target = degrees * DEG;
    if (instant || Math.abs(shortestAngle(facingNow, target)) < 1e-3) {
      facingNow = target;
      facingTo = target;
      facingT = 1;
      root.rotation.y = facingNow;
      return;
    }
    facingFrom = facingNow;
    facingTo = facingNow + shortestAngle(facingNow, target);
    facingT = 0;
  };

  const updateLook = (): void => {
    if (!lookTarget) {
      look = { yaw: 0, pitch: -8 };
    } else {
      const dx = lookTarget.x - root.position.x;
      const dz = lookTarget.z - root.position.z;
      const world = Math.atan2(dx, dz);
      const yaw = shortestAngle(facingNow, world) / DEG;
      const dist = Math.max(0.3, Math.hypot(dx, dz));
      const pitch = -Math.atan2(Math.max(0.3, lookTarget.y) - props.shoulderHeight, dist) / DEG;
      look = { yaw, pitch };
    }
    performer?.setLook(look.yaw, look.pitch);
  };

  const dog: DogActorController = {
    id,
    root,
    tier: () => performer?.tier ?? 'procedural',
    pose: () => currentPose,
    position: () => root.position.clone(),
    destination: () => (mover ? mover.to.clone() : root.position.clone()),
    facing: () => facingNow / DEG,
    growth: () => growth,
    proportions: () => props,
    extent: () => props.bodyLength + props.tailLength * 0.6 + props.headRadius * 2,
    isMoving: () => mover !== null,
    setHold(next) {
      hold = next;
      performer?.setHold(next);
    },
    play(pose, opts) {
      currentPose = pose;
      deferredPose = null;
      return performer ? performer.setPose(pose, opts) : Promise.resolve();
    },
    applyDirective(directive, { instant, lookTarget: target }) {
      lastFacingRequest = directive.facing;
      lookTarget = target ? target.clone() : null;
      const dest = stagePoint(directive.position);
      const dist = dest.distanceTo(root.position);
      if (dist > 0.01) {
        if (instant) {
          mover = null;
          root.position.copy(dest);
          setFacing(directive.facing, true);
        } else {
          const from = root.position.clone();
          mover = { from, to: dest, length: dist, travelled: 0, speed: walkSpeed(props), cycle: walkCycleLength(props) };
          setFacing(Math.atan2(dest.x - from.x, dest.z - from.z) / DEG, false);
          deferredPose = directive.pose;
          currentPose = 'walk';
          void performer?.setPose('walk');
          updateLook();
          return;
        }
      }
      if (!mover) {
        setFacing(directive.facing, instant);
        currentPose = directive.pose;
        deferredPose = null;
        void performer?.setPose(directive.pose, { instant });
      } else {
        deferredPose = directive.pose;
        mover.to.copy(dest);
        mover.length = mover.from.distanceTo(dest);
      }
      updateLook();
    },
    setGrowth(stage) {
      if (stage === growth) return;
      growth = stage;
      rebuild();
    },
    setVisualScale(scale) {
      visualScale = scale;
      performer?.object.scale.setScalar(scale);
    },
    update(dt) {
      let animating = false;
      if (mover) {
        mover.travelled += mover.speed * dt;
        const k = Math.min(1, mover.travelled / mover.length);
        root.position.lerpVectors(mover.from, mover.to, k);
        performer?.setWalkPhase(mover.travelled / mover.cycle);
        animating = true;
        if (k >= 1) {
          const finalPose = deferredPose ?? 'idle_relaxed';
          mover = null;
          deferredPose = null;
          currentPose = finalPose;
          void performer?.setPose(finalPose);
          // Face the directive facing after arriving.
          if (lastFacingRequest !== null) setFacing(lastFacingRequest, false);
        }
      }
      if (facingT < 1) {
        facingT = Math.min(1, facingT + dt / FACING_SECONDS);
        facingNow = facingFrom + (facingTo - facingFrom) * easeInOut(facingT);
        root.rotation.y = facingNow;
        animating = true;
        if (lookTarget) updateLook();
      }
      if (performer) animating = performer.update(dt) || animating;
      return animating;
    },
    isAnimating() {
      return mover !== null || facingT < 1 || (performer?.isAnimating() ?? false);
    },
    triangles: () => triangles,
    dispose() {
      disposed = true;
      if (performer) {
        performer.dispose();
        performer.object.removeFromParent();
        if (glbKey && options.assets) options.assets.release(glbKey);
      }
      performer = null;
      shadow.geometry.dispose();
      root.removeFromParent();
    },
  };

  rebuild();
  return dog;
}

export interface HumanActorOptions {
  id: HumanCharacterId;
  character: HumanCharacter;
  assets: AssetManager | null;
  onTierChange?: (id: HumanCharacterId, tier: AssetTier) => void;
  onInvalidate?: () => void;
}

export function createHumanActor(options: HumanActorOptions): HumanActorController {
  const { id, character } = options;
  const root = new Group();
  root.name = `${id}_actor`;
  let performer: Performer<GestureId> | null = null;
  let glbKey: string | null = null;
  let triangles = 0;
  let disposed = false;
  let currentPose: GestureId = 'idle';
  let hold = false;
  let facingNow = 0;
  let facingFrom = 0;
  let facingTo = 0;
  let facingT = 1;
  const shadow = createContactShadow(0.42);
  shadow.scale.set(1, 0.7, 1);
  root.add(shadow);

  const attach = (next: Performer<GestureId>, key: string | null): void => {
    if (performer) {
      performer.dispose();
      performer.object.removeFromParent();
      if (glbKey && options.assets) options.assets.release(glbKey);
    }
    performer = next;
    glbKey = key;
    root.add(next.object);
    next.setHold(hold);
    void next.setPose(currentPose, { instant: true });
    options.onTierChange?.(id, next.tier);
    options.onInvalidate?.();
  };

  const rig = buildHumanRig(id, character);
  rig.mesh.castShadow = true;
  triangles = rig.triangles;
  const procedural = new ProceduralPerformer<GestureId, HumanPoseContext>({
    rig,
    poses: HUMAN_POSES,
    oneShotSeconds: HUMAN_ONE_SHOT_SECONDS,
    initialPose: 'idle',
    context: { p: rig.proportions },
  });
  const originalDispose = procedural.dispose.bind(procedural);
  procedural.dispose = () => {
    originalDispose();
    disposeRig(rig);
  };
  attach(procedural, null);

  if (options.assets) {
    const assets = options.assets;
    const key = humanAssetKey(id);
    void assets.load(key, { requireSkinned: true, requiredClips: ['idle'] }).then((asset) => {
      if (!asset || disposed) return;
      const instance = assets.instantiate(key);
      if (!instance) return;
      const holder = new Group();
      holder.name = `${id}_glb`;
      holder.add(instance);
      const next = new MixerPerformer<GestureId>({
        root: holder,
        clips: asset.clips,
        loops: HUMAN_LOOP_POSES,
        initialPose: currentPose,
        fallbackPose: 'idle',
        label: key,
      });
      triangles = asset.triangles;
      attach(next, key);
    });
  }

  const setFacing = (degrees: number, instant: boolean): void => {
    const target = degrees * DEG;
    if (instant || Math.abs(shortestAngle(facingNow, target)) < 1e-3) {
      facingNow = target;
      facingTo = target;
      facingT = 1;
      root.rotation.y = facingNow;
      return;
    }
    facingFrom = facingNow;
    facingTo = facingNow + shortestAngle(facingNow, target);
    facingT = 0;
  };

  return {
    id,
    root,
    tier: () => performer?.tier ?? 'procedural',
    pose: () => currentPose,
    position: () => root.position.clone(),
    facing: () => facingNow / DEG,
    setHold(next) {
      hold = next;
      performer?.setHold(next);
    },
    play(pose, opts) {
      currentPose = pose;
      return performer ? performer.setPose(pose, opts) : Promise.resolve();
    },
    applyDirective(directive, { instant }) {
      root.position.copy(stagePoint(directive.position));
      setFacing(directive.facing, instant);
      currentPose = directive.gesture;
      void performer?.setPose(directive.gesture, { instant });
    },
    update(dt) {
      let animating = false;
      if (facingT < 1) {
        facingT = Math.min(1, facingT + dt / FACING_SECONDS);
        facingNow = facingFrom + (facingTo - facingFrom) * easeInOut(facingT);
        root.rotation.y = facingNow;
        animating = true;
      }
      if (performer) animating = performer.update(dt) || animating;
      return animating;
    },
    isAnimating() {
      return facingT < 1 || (performer?.isAnimating() ?? false);
    },
    triangles: () => triangles,
    dispose() {
      disposed = true;
      if (performer) {
        performer.dispose();
        performer.object.removeFromParent();
        if (glbKey && options.assets) options.assets.release(glbKey);
      }
      performer = null;
      shadow.geometry.dispose();
      root.removeFromParent();
    },
  };
}

export const ALL_DOG_POSES: readonly PoseId[] = POSE_IDS;
