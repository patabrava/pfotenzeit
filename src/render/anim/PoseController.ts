/**
 * PoseController: one API over two tiers.
 *  - ProceduralPerformer: joint-channel keyframe generators with eased cross-fades (placeholder tier).
 *  - MixerPerformer: AnimationMixer clips from a rigged GLB with cross-fades (code-authored / final tier).
 * Both expose setPose() which resolves at the defined animation event (one-shot end) and never blocks:
 * a missing clip falls back to the idle pose and resolves after a timeout.
 */
import { Quaternion, Vector3, AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import { FrameWriter, applyFrame, copyFrame, createFrame, lerpFrames, type Frame, type Rig } from '../objects/rigBuilder';

export type AssetTier = 'procedural' | 'glb';

export interface SetPoseOptions {
  /** Snap without cross-fade (reduced motion, first apply). */
  instant?: boolean;
  /** Replay a one-shot even if it is already the current pose (present()). */
  restart?: boolean;
  /** Resolve at this clip time (seconds) instead of the clip end, e.g. the `treat_received` event. */
  resolveAtSeconds?: number;
}

export interface Performer<P extends string> {
  readonly object: Object3D;
  readonly tier: AssetTier;
  readonly pose: P;
  setPose(pose: P, options?: SetPoseOptions): Promise<void>;
  setHold(hold: boolean): void;
  /** Dogs: yaw/pitch toward the handler in degrees. */
  setLook(yawDeg: number, pitchDeg: number): void;
  /** Walk cycle phase in cycles; set by the mover so the paws never slide. */
  setWalkPhase(phase: number): void;
  /** Advance by dt seconds. Returns true while more frames are needed. */
  update(dt: number): boolean;
  isAnimating(): boolean;
  /** True while a cross-fade toward the current pose is still running. */
  isBlending(): boolean;
  dispose(): void;
}

const CROSS_FADE_SECONDS = 0.35;
const MISSING_CLIP_TIMEOUT_SECONDS = 1.2;

const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// ---------------------------------------------------------------------------
// Procedural tier
// ---------------------------------------------------------------------------

export interface PoseGeneratorContext {
  hold: boolean;
  walkPhase: number;
  lookYaw: number;
  lookPitch: number;
  scratch: Frame;
}

export type PoseGenerator<C extends PoseGeneratorContext> = (w: FrameWriter, t: number, ctx: C) => void;

export interface ProceduralPerformerOptions<P extends string, C extends PoseGeneratorContext> {
  rig: Rig;
  poses: Record<P, PoseGenerator<C>>;
  oneShotSeconds: Partial<Record<P, number>>;
  initialPose: P;
  context: Omit<C, keyof PoseGeneratorContext>;
}

export class ProceduralPerformer<P extends string, C extends PoseGeneratorContext> implements Performer<P> {
  readonly tier: AssetTier = 'procedural';
  readonly object: Object3D;
  pose: P;

  private readonly rig: Rig;
  private readonly poses: Record<P, PoseGenerator<C>>;
  private readonly oneShotSeconds: Partial<Record<P, number>>;
  private readonly ctx: C;
  private readonly writer: FrameWriter;
  private readonly current: Frame;
  private readonly from: Frame;
  private readonly target: Frame;
  private poseTime = 0;
  private blend = 1;
  private blendDuration = CROSS_FADE_SECONDS;
  private pending: { resolve: () => void; at: number } | null = null;

  constructor(options: ProceduralPerformerOptions<P, C>) {
    this.rig = options.rig;
    this.object = options.rig.root;
    this.poses = options.poses;
    this.oneShotSeconds = options.oneShotSeconds;
    this.pose = options.initialPose;
    this.current = createFrame(this.rig);
    this.from = createFrame(this.rig);
    this.target = createFrame(this.rig);
    this.ctx = { ...options.context, hold: false, walkPhase: 0, lookYaw: 0, lookPitch: 0, scratch: createFrame(this.rig) } as C;
    this.writer = new FrameWriter(this.rig, this.target);
    this.sample(0);
    copyFrame(this.current, this.target);
    applyFrame(this.rig, this.current);
  }

  private sample(t: number): void {
    this.writer.frame = this.target;
    this.poses[this.pose](this.writer, t, this.ctx);
  }

  setPose(pose: P, options: SetPoseOptions = {}): Promise<void> {
    const oneShot = this.oneShotSeconds[pose];
    if (pose === this.pose && !options.restart) {
      if (oneShot !== undefined && this.poseTime < oneShot && !options.instant) {
        return this.waitForSettle(oneShot);
      }
      return Promise.resolve();
    }
    this.resolvePending();
    copyFrame(this.from, this.current);
    this.pose = pose;
    this.poseTime = 0;
    if (options.instant) {
      this.blend = 1;
      this.sample(oneShot ?? 0);
      this.poseTime = oneShot ?? 0;
      copyFrame(this.current, this.target);
      applyFrame(this.rig, this.current);
      return Promise.resolve();
    }
    this.blend = 0;
    this.blendDuration = CROSS_FADE_SECONDS;
    if (options.resolveAtSeconds !== undefined) return this.waitForSettle(options.resolveAtSeconds);
    if (oneShot === undefined) return Promise.resolve();
    return this.waitForSettle(oneShot);
  }

  isBlending(): boolean {
    if (this.blend < 1) return true;
    const oneShot = this.oneShotSeconds[this.pose];
    return oneShot !== undefined && this.poseTime < oneShot;
  }

  private waitForSettle(at: number): Promise<void> {
    this.resolvePending();
    return new Promise<void>((resolve) => {
      this.pending = { resolve, at };
    });
  }

  private resolvePending(): void {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      p.resolve();
    }
  }

  setHold(hold: boolean): void {
    this.ctx.hold = hold;
  }

  setLook(yawDeg: number, pitchDeg: number): void {
    this.ctx.lookYaw = yawDeg;
    this.ctx.lookPitch = pitchDeg;
  }

  setWalkPhase(phase: number): void {
    this.ctx.walkPhase = phase;
  }

  isAnimating(): boolean {
    if (this.blend < 1) return true;
    if (this.pending) return true;
    const oneShot = this.oneShotSeconds[this.pose];
    if (oneShot !== undefined && this.poseTime < oneShot) return true;
    return !this.ctx.hold;
  }

  update(dt: number): boolean {
    this.poseTime += dt;
    this.sample(this.poseTime);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDuration);
      lerpFrames(this.current, this.from, this.target, easeInOut(this.blend));
    } else {
      copyFrame(this.current, this.target);
    }
    applyFrame(this.rig, this.current);
    if (this.pending && this.poseTime >= this.pending.at) this.resolvePending();
    return this.isAnimating();
  }

  dispose(): void {
    this.resolvePending();
  }
}

// ---------------------------------------------------------------------------
// GLB tier (AnimationMixer)
// ---------------------------------------------------------------------------

export interface MixerPerformerOptions<P extends string> {
  /** Actor root (ground origin). The cloned GLB scene is its child. */
  root: Object3D;
  clips: AnimationClip[];
  /** Poses that loop; everything else plays once and clamps on its last frame. */
  loops: ReadonlySet<P>;
  initialPose: P;
  /** Pose used when a clip is missing. */
  fallbackPose: P;
  /** Pose driven by the walk phase instead of the clock. */
  walkPose?: P;
  label: string;
}

export class MixerPerformer<P extends string> implements Performer<P> {
  readonly tier: AssetTier = 'glb';
  readonly object: Object3D;
  pose: P;

  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly loops: ReadonlySet<P>;
  private readonly fallbackPose: P;
  private readonly walkPose: P | undefined;
  private readonly label: string;
  private readonly warned = new Set<string>();
  private active: AnimationAction | null = null;
  private fadeRemaining = 0;
  private hold = false;
  private walkPhase = 0;
  private pending: { resolve: () => void; action: AnimationAction | null; timeout: number; atTime?: number } | null = null;
  private oneShotRunning = false;
  private gazeBones: Object3D[] | null = null;
  private gazeBase = new Map<Object3D, Quaternion>();
  private bodyTime = 0;
  private gazeYaw = 0;
  private gazePitch = 0;
  private gazeOn = false;

  constructor(options: MixerPerformerOptions<P>) {
    this.object = options.root;
    this.mixer = new AnimationMixer(options.root);
    this.loops = options.loops;
    this.fallbackPose = options.fallbackPose;
    this.walkPose = options.walkPose;
    this.label = options.label;
    for (const clip of options.clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.pose = options.initialPose;
    this.mixer.addEventListener('finished', (event) => {
      const finished = (event as unknown as { action: AnimationAction }).action;
      if (this.pending && this.pending.action === finished) this.resolvePending();
      if (finished === this.active) this.oneShotRunning = false;
    });
    const first = this.actions.get(options.initialPose);
    if (first) {
      // A swapped-in model lands on the already-settled pose: one-shots start on their final frame.
      this.configure(first, options.initialPose);
      first.play();
      if (!this.loops.has(options.initialPose)) first.time = Math.max(0, first.getClip().duration - 1e-4);
      this.active = first;
      this.mixer.update(0);
    }
  }

  private configure(action: AnimationAction, pose: P): void {
    if (this.loops.has(pose)) {
      action.setLoop(LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    } else {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.enabled = true;
    action.paused = false;
    action.timeScale = 1;
  }

  setPose(pose: P, options: SetPoseOptions = {}): Promise<void> {
    if (pose === this.pose && !options.restart && this.active) {
      if (this.oneShotRunning && !options.instant) return this.waitFor(this.active, this.active.getClip().duration);
      return Promise.resolve();
    }
    this.restoreGaze();
    this.resolvePending();
    this.pose = pose;
    let action = this.actions.get(pose);
    let missing = false;
    if (!action) {
      missing = true;
      if (!this.warned.has(pose)) {
        this.warned.add(pose);
        console.warn(`[render] ${this.label}: clip "${pose}" missing, using "${this.fallbackPose}"`);
      }
      action = this.actions.get(this.fallbackPose);
    }
    if (!action) return Promise.resolve();
    const effectivePose = missing ? this.fallbackPose : pose;
    this.configure(action, effectivePose);
    const fade = options.instant ? 0 : CROSS_FADE_SECONDS;
    if (options.instant) for (const other of this.actions.values()) if (other !== action) other.stop();
    if (this.active && this.active !== action) {
      this.active.fadeOut(fade);
    }
    action.reset();
    action.setEffectiveWeight(1);
    if (fade > 0) action.fadeIn(fade);
    action.play();
    this.active = action;
    this.fadeRemaining = fade;
    const loop = this.loops.has(effectivePose);
    this.oneShotRunning = !loop;
    if (this.walkPose !== undefined && effectivePose === this.walkPose) {
      action.paused = true;
    }
    if (options.instant) {
      if (!loop) action.time = Math.max(0, action.getClip().duration - 1e-4);
      this.mixer.update(0);
      this.oneShotRunning = false;
      return Promise.resolve();
    }
    if (missing) return this.waitFor(null, MISSING_CLIP_TIMEOUT_SECONDS);
    if (options.resolveAtSeconds !== undefined) return this.waitFor(action, options.resolveAtSeconds + 0.5, options.resolveAtSeconds);
    if (loop) return Promise.resolve();
    return this.waitFor(action, action.getClip().duration + 0.5);
  }

  isBlending(): boolean {
    return this.fadeRemaining > 0 || this.oneShotRunning;
  }

  private waitFor(action: AnimationAction | null, timeoutSeconds: number, atTime?: number): Promise<void> {
    this.resolvePending();
    return new Promise<void>((resolve) => {
      this.pending = { resolve, action, timeout: timeoutSeconds, atTime };
    });
  }

  private resolvePending(): void {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      p.resolve();
    }
  }

  setHold(hold: boolean): void {
    this.hold = hold;
    this.applyHold();
  }

  private applyHold(): void {
    if (!this.active) return;
    if (this.walkPose !== undefined && this.pose === this.walkPose) return;
    const loop = this.loops.has(this.pose);
    this.active.paused = loop && this.hold && this.fadeRemaining <= 0;
  }

  /**
   * Gaze layer: turn the shipped neck and head toward the handler or moving ball.
   * Each frame removes the previous offset before applying the next one.
   */
  setLook(yawDeg: number, pitchDeg: number): void {
    this.gazeYaw = Math.max(-70, Math.min(70, yawDeg));
    this.gazePitch = Math.max(-30, Math.min(30, pitchDeg));
  }

  setGaze(on: boolean): void {
    this.gazeOn = on;
  }

  /** Remove last frame's additive gaze before sampling the clip again (also works for held clips). */
  private restoreGaze(): void {
    for (const [bone, base] of this.gazeBase) bone.quaternion.copy(base);
    this.gazeBase.clear();
  }

  private applyGaze(): void {
    if (!this.gazeOn) return;
    if (this.gazeBones === null) {
      // The shipped puppy has neck joints, not eye_l/eye_r. Turn the head itself toward the target.
      const names = this.object.getObjectByName('Dog_Neck_01SHJnt')
        ? ['Dog_Neck_01SHJnt', 'Dog_Neck_TopSHJnt'] : ['neck', 'head'];
      this.gazeBones = names.map(name => this.object.getObjectByName(name)).filter((bone): bone is Object3D => !!bone);
    }
    this.object.updateWorldMatrix(true, true);
    const actorRotation = this.object.getWorldQuaternion(new Quaternion());
    const yawAxis = new Vector3(0, 1, 0).applyQuaternion(actorRotation);
    const pitchAxis = new Vector3(1, 0, 0).applyQuaternion(actorRotation);
    const share = 1 / Math.max(1, this.gazeBones.length);
    for (const bone of this.gazeBones) {
      this.gazeBase.set(bone, bone.quaternion.clone());
      const parent = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
      const world = new Quaternion().setFromAxisAngle(yawAxis, this.gazeYaw * Math.PI / 180 * share)
        .multiply(new Quaternion().setFromAxisAngle(pitchAxis, this.gazePitch * Math.PI / 180 * share));
      const local = parent.clone().invert().multiply(world).multiply(parent);
      bone.quaternion.premultiply(local);
      bone.updateWorldMatrix(false, true);
    }
  }

  private applyBodyLanguage(): void {
    const resting = this.pose === 'rest_loop' || this.pose === 'rest_side';
    const sleepy = this.pose === 'tired_idle';
    const period = resting ? 4.6 : sleepy ? 4.2 : 3.2;
    const breath = this.hold ? 0 : (1 + Math.sin(this.bodyTime * Math.PI * 2 / period)) * .22;
    const blinkPhase = this.bodyTime % 5;
    const blink = resting ? .9 : sleepy ? .45 : this.hold ? 0 : Math.max(0, 1 - Math.abs(blinkPhase - 4.6) / .12);
    this.object.traverse(node => {
      const mesh = node as Object3D & { morphTargetDictionary?: Record<string, number>; morphTargetInfluences?: number[] };
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
      for (const [name, value] of [['breath', breath], ['blink', blink]] as const) {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) mesh.morphTargetInfluences[index] = value;
      }
    });
  }

  setWalkPhase(phase: number): void {
    this.walkPhase = phase;
  }

  isAnimating(): boolean {
    if (this.fadeRemaining > 0) return true;
    if (this.pending) return true;
    if (this.oneShotRunning) return true;
    return !this.hold;
  }

  update(dt: number): boolean {
    this.restoreGaze();
    this.bodyTime += dt;
    if (this.walkPose !== undefined && this.pose === this.walkPose && this.active) {
      const d = this.active.getClip().duration;
      this.active.time = ((this.walkPhase % 1) + 1) % 1 * d;
    }
    this.mixer.update(dt);
    this.applyGaze();
    this.applyBodyLanguage();
    if (this.fadeRemaining > 0) {
      this.fadeRemaining -= dt;
      if (this.fadeRemaining <= 0) this.applyHold();
    }
    if (this.pending) {
      this.pending.timeout -= dt;
      if (this.pending.atTime !== undefined && this.pending.action && this.pending.action.time >= this.pending.atTime) this.resolvePending();
      else if (this.pending.timeout <= 0) this.resolvePending();
    }
    return this.isAnimating();
  }

  dispose(): void {
    this.resolvePending();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.object);
  }
}
