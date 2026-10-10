/**
 * Actor controllers: wrap a Performer (procedural or GLB) with stage movement, facing, look
 * targets, hold, growth rebuilds and the tier swap. The UI never sees which tier is active.
 */
import { Group, Vector3 } from 'three';
import type { DogCharacter, HumanCharacter } from '../../content/types';
import type { DogCharacterId, DogDirective, GestureId, GrowthStage, HumanCharacterId, HumanDirective, PoseId, StagePosition, WorldActorDirective } from '../../simulation/types';
import { POSE_IDS } from '../../simulation/types';
import { DOG_ONE_SHOT_SECONDS, DOG_POSES, walkCycleLength, walkSpeed, type DogPoseContext } from '../anim/dogPoses';
import { createHumanWalk } from '../anim/humanWalk';
import { HUMAN_ONE_SHOT_SECONDS, HUMAN_POSES, type HumanPoseContext } from '../anim/humanPoses';
import { MixerPerformer, ProceduralPerformer, type AssetTier, type Performer, type SetPoseOptions } from '../anim/PoseController';
import type { AssetManager } from '../loaders/AssetManager';
import { buildDogRig, dogAssetKey, dogProportions, type DogProportions } from './DogActor';
import { buildHumanRig, humanAssetKey } from './HumanActor';
import { disposeRig } from './rigBuilder';
import { STAGE_POSITIONS, createContactShadow } from './SchoolScene';
import { extentAlong, sampleSkinnedPoints, surfaceFootprint } from './bounds';

const DEG = Math.PI / 180;
const FACING_SECONDS = 0.4;
const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const DOG_LOOP_POSES: ReadonlySet<PoseId> = new Set<PoseId>(['idle_relaxed', 'sniff', 'walk', 'rest_loop', 'rest_side', 'alert_focus', 'tense_idle', 'tired_idle']);
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
  /** True while the pose cross-fade has not finished. */
  isBlending(): boolean;
  /** World-space surface samples of the current deformed pose (ears, tail, paws). */
  measure(): Vector3[];
  /** Measured body length along the facing (metres) and top height of the current pose; bounds-based, no bone names. */
  bodyLength(): number;
  topHeight(): number;
  /** Extra yaw (radians) on top of the directive facing: turntable in the review harness. */
  setSpin(radians: number): void;
  triangles(): number;
  dispose(): void;
}

export interface DogActorController extends ActorBase<PoseId> {
  readonly id: DogCharacterId;
  growth(): GrowthStage;
  proportions(): DogProportions;
  /** Where the dog will stand once any walk completes. */
  destination(): Vector3;
  /** Manifest key of the GLB this actor would use at its growth stage. */
  assetKey(): string;
  applyDirective(directive: DogDirective, options: { instant: boolean; lookTarget: Vector3 | null }): void;
  lookAt(target: Vector3 | null): void;
  /** Rebuild for a growth stage (never mid-animation: callers wait for present() to finish). */
  setGrowth(stage: GrowthStage): void;
  /** Uniform visual scale (growth presentation only). */
  setVisualScale(scale: number): void;
  isMoving(): boolean;
  /**
   * D-041 yard mode: absolute position/facing per step (20–60 Hz). Cancels any stage walk; the walk
   * clip phase accumulates from the distance moved (so clip time scales with speed), the body blends
   * to the directive pose once speed is 0. No structural work.
   */
  setWorld(actor: WorldActorDirective, instant: boolean, groundY?: number): void;
  /** Accumulated walk phase in cycles (yard mode). */
  walkPhase(): number;
  /** Coarse surface samples (stride 16) for per-step framing in the yard. */
  measureCoarse(): Vector3[];
}

export interface HumanActorController extends ActorBase<GestureId> {
  readonly id: HumanCharacterId;
  applyDirective(directive: HumanDirective, options: { instant: boolean }): void;
  /** D-041 yard mode: absolute position/facing/gesture per step. */
  setWorld(actor: WorldActorDirective, instant: boolean, groundY?: number): void;
}

const WORLD_MOVING = 0.05;
const isDogPose = (pose: string): pose is PoseId => (POSE_IDS as readonly string[]).includes(pose);

interface Mover {
  from: Vector3;
  to: Vector3;
  length: number;
  travelled: number;
  elapsed: number;
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
  let spin = 0;
  /** Latest coarse surface sample (world) and the standing reference height measured at rebuild. */
  let coarse: Vector3[] = [];
  let refHeight = props.shoulderHeight * 1.4;

  // Facing (radians) and movement.
  let facingNow = 0;
  const applyRotation = (): void => {
    root.rotation.y = facingNow + spin;
  };
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

  /** Coarse surface sample of the current pose (every 16th vertex) shared by shadow, reach and look. */
  const sampleCoarse = (): Vector3[] => {
    root.updateMatrixWorld(true);
    coarse = performer ? sampleSkinnedPoints(performer.object, 16, coarse) : [];
    return coarse;
  };

  /**
   * Elliptical, directional contact shadow from the deformed-surface footprint (no bone names, so a
   * vendor rig's control bones cannot distort it); fades as the body lifts off the ground.
   */
  const updateShadow = (): void => {
    const f = surfaceFootprint(sampleCoarse());
    if (!f) return;
    // Footprint is in world space; the shadow lives under the (rotated) root → convert to local.
    const yaw = facingNow + spin;
    const lx = f.centreX - root.position.x;
    const lz = f.centreZ - root.position.z;
    const c = Math.cos(-yaw);
    const sn = Math.sin(-yaw);
    shadow.position.x = lx * c - lz * sn + 0.03;
    shadow.position.z = lx * sn + lz * c - 0.02;
    const rx = Math.max(0.08, f.halfX * 0.9 + 0.02);
    const rz = Math.max(0.08, f.halfZ * 0.9 + 0.02);
    // Ellipse axes in local space follow the body's world footprint rotated back.
    const ex = Math.abs(rx * c) + Math.abs(rz * sn);
    const ez = Math.abs(rx * sn) + Math.abs(rz * c);
    shadow.scale.set(ex, ez, 1);
    const lift = Math.max(0, Math.min(1, (f.meanY - refHeight * 0.3) / (refHeight * 0.35)));
    (shadow.material as { opacity: number }).opacity = 0.42 * (1 - 0.45 * lift);
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
    // Standing reference height from the model itself (first pose after the swap).
    const f = surfaceFootprint(sampleCoarse());
    if (f && f.maxY > 0.05) refHeight = f.maxY;
    updateShadow();
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
      applyRotation();
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
      // Eye height from the measured body top (bounds, not bone names).
      const pitch = -Math.atan2(Math.max(0.3, lookTarget.y) - refHeight * 0.85, dist) / DEG;
      look = { yaw, pitch };
    }
    performer?.setLook(look.yaw, look.pitch);
    (performer as { setGaze?: (on: boolean) => void } | null)?.setGaze?.(
      Boolean(lookTarget) && (currentPose === 'look_at_handler' || currentPose === 'alert_focus'),
    );
  };

  let poseRequest = 0;
  let worldPhase = 0;
  let worldPose: PoseId | null = null;
  let movementReady = true;
  const movementWaiters: Array<() => void> = [];
  const grounded = (pose: PoseId): boolean => pose === 'lie_down' || pose === 'rest_loop' || pose === 'rest_side';
  /** Pose with a grounding transition where needed (lie_down before resting, stand_up after); synchronous when none is needed. */
  const settlePose = (pose: PoseId, opts: SetPoseOptions = {}): Promise<void> => {
    const request = ++poseRequest;
    const previous = performer?.pose;
    let via: PoseId | null = null;
    if (!opts.instant && previous && previous !== pose) {
      if ((previous === 'lie_down' || !grounded(previous)) && (pose === 'rest_loop' || pose === 'rest_side')) via = 'lie_down';
      else if (grounded(previous) && !grounded(pose)) via = 'stand_up';
    }
    if (!via || !performer) return performer ? performer.setPose(pose, opts) : Promise.resolve();
    const transition = performer;
    return transition.setPose(via, opts).then(() => {
      if (request === poseRequest) return performer?.setPose(pose, opts);
      return undefined;
    });
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
    isMoving: () => mover !== null,
    assetKey: () => dogAssetKey(id, growth),
    isBlending: () => performer?.isBlending() ?? false,
    bodyLength: () => {
      const pts = coarse.length > 0 ? coarse : sampleCoarse();
      const l = extentAlong(pts, facingNow + spin);
      return l > 0.05 ? l : props.bodyLength + props.headRadius * 2;
    },
    topHeight: () => refHeight,
    setSpin(radians) {
      spin = radians;
      applyRotation();
      updateShadow();
    },
    measure: () => {
      // The actor root's facing/position may have changed this frame: refresh the whole chain first.
      root.updateMatrixWorld(true);
      return performer ? sampleSkinnedPoints(performer.object, 5) : [root.position.clone()];
    },
    setHold(next) {
      hold = next;
      performer?.setHold(next);
    },
    lookAt(target) {
      lookTarget = target ? target.clone() : null;
      updateLook();
    },
    play(pose, opts) {
      if (mover && !opts?.instant) {
        deferredPose = pose;
        return new Promise<void>(resolve => movementWaiters.push(resolve));
      }
      if (mover && opts?.instant) {
        root.position.copy(mover.to);
        mover = null;
      }
      currentPose = pose;
      deferredPose = null;
      const promise = settlePose(pose, opts);
      updateLook();
      return promise;
    },
    setWorld(actor, instant, groundY = 0) {
      if (mover) {
        mover = null;
        deferredPose = null;
        for (const resolve of movementWaiters.splice(0)) resolve();
      }
      lastFacingRequest = null;
      const dx = actor.position.x - root.position.x;
      const dz = actor.position.z - root.position.z;
      const moved = Math.hypot(dx, dz);
      if (moved > 1e-6 || Math.abs(root.position.y - groundY) > 1e-6) {
        worldPhase += moved / walkCycleLength(props);
        root.position.set(actor.position.x, groundY, actor.position.z);
        performer?.setWalkPhase(worldPhase);
      }
      const moving = actor.speed > WORLD_MOVING;
      // Facing follows the path directly while walking; a stopped dog turns with the usual ease. A
      // repeated identical target must not restart the ease (per-step calls would stall it).
      const targetRad = actor.facing * DEG;
      if (Math.abs(shortestAngle(facingTo, targetRad)) > 1e-3 || (moving && Math.abs(shortestAngle(facingNow, targetRad)) > 1e-3)) {
        setFacing(actor.facing, instant || moving);
      }
      const desired: PoseId = moving ? 'walk' : isDogPose(actor.pose) ? actor.pose : 'idle_relaxed';
      if (worldPose !== desired) {
        worldPose = desired;
        currentPose = desired;
        void settlePose(desired, { instant });
        updateLook();
      }
      updateShadow();
    },
    walkPhase: () => worldPhase,
    measureCoarse: () => {
      root.updateMatrixWorld(true);
      return performer ? sampleSkinnedPoints(performer.object, 16) : [root.position.clone()];
    },
    applyDirective(directive, { instant, lookTarget: target }) {
      worldPose = null;
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
          mover = { from, to: dest, length: dist, travelled: 0, elapsed: 0, speed: walkSpeed(props), cycle: walkCycleLength(props) };
          setFacing(Math.atan2(dest.x - from.x, dest.z - from.z) / DEG, false);
          deferredPose = directive.pose;
          currentPose = 'walk';
          // A lying dog stands up before it walks; otherwise the walk starts this frame.
          const standingFirst = performer !== null && grounded(performer.pose);
          movementReady = !standingFirst;
          const walkReady = settlePose('walk');
          if (standingFirst) void walkReady.then(() => { movementReady = true; });
          updateLook();
          return;
        }
      }
      if (!mover) {
        setFacing(directive.facing, instant);
        currentPose = directive.pose;
        deferredPose = null;
        void settlePose(directive.pose, { instant });
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
      if (mover && movementReady) {
        mover.elapsed += dt;
        // A tired dog follows in short stretches, pausing between them.
        const tiredPause = deferredPose === 'tired_idle' && mover.elapsed % 1.8 > 1.4;
        if (!tiredPause) mover.travelled += mover.speed * dt;
        const k = Math.min(1, mover.travelled / mover.length);
        root.position.lerpVectors(mover.from, mover.to, k);
        performer?.setWalkPhase(mover.travelled / mover.cycle);
        animating = true;
        if (k >= 1) {
          const finalPose = deferredPose ?? 'idle_relaxed';
          mover = null;
          deferredPose = null;
          currentPose = finalPose;
          void settlePose(finalPose).then(() => {
            for (const resolve of movementWaiters.splice(0)) resolve();
          });
          updateLook();
          // Face the directive facing after arriving.
          if (lastFacingRequest !== null) setFacing(lastFacingRequest, false);
        }
      }
      if (facingT < 1) {
        facingT = Math.min(1, facingT + dt / FACING_SECONDS);
        facingNow = facingFrom + (facingTo - facingFrom) * easeInOut(facingT);
        applyRotation();
        animating = true;
        if (lookTarget) updateLook();
      }
      if (performer) animating = performer.update(dt) || animating;
      if (animating) updateShadow();
      return animating;
    },
    isAnimating() {
      return mover !== null || facingT < 1 || (performer?.isAnimating() ?? false);
    },
    triangles: () => triangles,
    dispose() {
      disposed = true;
      for (const resolve of movementWaiters.splice(0)) resolve();
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
  const walk = createHumanWalk(root);
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
  let spin = 0;
  const refHeight = 1.7;
  const applyRotation = (): void => {
    root.rotation.y = facingNow + spin;
  };

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
        // Authored vendor gestures carry their own loop contract (kneeling must clamp).
        loops: new Set<GestureId>(asset.clips
          .filter((clip) => asset.entry.clipMeta?.[clip.name]?.loop ?? HUMAN_LOOP_POSES.has(clip.name as GestureId))
          .map((clip) => clip.name as GestureId)),
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
      applyRotation();
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
      walk.move(0, false);
      root.position.copy(stagePoint(directive.position));
      setFacing(directive.facing, instant);
      currentPose = directive.gesture;
      void performer?.setPose(directive.gesture, { instant });
    },
    setWorld(actor, instant, groundY = 0) {
      walk.move(Math.hypot(actor.position.x - root.position.x, actor.position.z - root.position.z), actor.speed > WORLD_MOVING);
      root.position.set(actor.position.x, groundY, actor.position.z);
      const targetRad = actor.facing * DEG;
      if (Math.abs(shortestAngle(facingTo, targetRad)) > 1e-3) setFacing(actor.facing, instant || actor.speed > WORLD_MOVING);
      const gesture = (HUMAN_POSES as Record<string, unknown>)[actor.pose] ? (actor.pose as GestureId) : 'idle';
      if (currentPose !== gesture) {
        currentPose = gesture;
        void performer?.setPose(gesture, { instant });
      }
    },
    update(dt) {
      walk.restore();
      let animating = false;
      if (facingT < 1) {
        facingT = Math.min(1, facingT + dt / FACING_SECONDS);
        facingNow = facingFrom + (facingTo - facingFrom) * easeInOut(facingT);
        applyRotation();
        animating = true;
      }
      if (performer) animating = performer.update(dt) || animating;
      animating = walk.update(dt, hold) || animating;
      return animating;
    },
    isAnimating() {
      return facingT < 1 || (performer?.isAnimating() ?? false);
    },
    isBlending: () => performer?.isBlending() ?? false,
    measure: () => {
      root.updateMatrixWorld(true);
      return performer ? sampleSkinnedPoints(performer.object, 8) : [root.position.clone()];
    },
    bodyLength: () => 0.5,
    topHeight: () => refHeight,
    setSpin(radians) {
      spin = radians;
      applyRotation();
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
