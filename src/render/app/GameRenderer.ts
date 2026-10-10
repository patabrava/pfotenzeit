/**
 * GameRenderer: implements RendererHandle (src/render/types.ts).
 *
 * Owns WebGLRenderer, Scene, OrthographicCamera (CameraRig), lights, AssetManager and the actors.
 * Demand rendered: invalidate() schedules at most one frame; frames continue only while something
 * animates; setActive(false) stops everything. The renderer projects SceneDirectives and presents
 * already-committed effects; it never owns progression or health.
 *
 * Colour decision (14 C): outputColorSpace = SRGBColorSpace, toneMapping = NoToneMapping.
 * The 06 palette is flat and matte (roughness 0.8, no emissive, no HDR highlights), so filmic
 * tone mapping would only desaturate the chalk/sage/apricot colours. Instead the lights are
 * budgeted so direct + hemisphere irradiance stays ≤ π (key 2.2 + fill 1.1): albedo is never
 * clipped and colours read exactly as authored.
 */
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  NoToneMapping,
  PCFSoftShadowMap,
  Plane,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { content as defaultContent } from '../../content';
import type { ContentCatalog } from '../../content/types';
import type {
  CareKind,
  DogCharacterId,
  DomainEffect,
  GrowthStage,
  HumanCharacterId,
  PoseId,
  QualityTier,
  SceneDirective,
  WorldActorDirective,
  WorldDirective,
  YardPoint,
} from '../../simulation/types';
import { isWebGLAvailable, tryCreateWebGLRenderer, watchContextLoss } from '../fallback';
import { createAssetManager, type AssetManager } from '../loaders/AssetManager';
import { BACKGROUND_HEX, PALETTE, disposeSharedMaterials } from '../materials/palette';
import { createDogActor, createHumanActor, type DogActorController, type HumanActorController } from '../objects/ActorController';
import { CARE_PROP_IDS, createProps, isCareProp, propHolder, type CarePropId, type PropsSet } from '../objects/Props';
import { STAGE_POSITIONS, SCHOOL_CORE_POINTS, ZONE_FOCUS, contactShadowBytes, createSchoolScene, disposeContactShadows, type SchoolScene } from '../objects/SchoolScene';
import type { AssetTier } from '../anim/PoseController';
import type { PickResult, PresentOptions, RendererHandle, RendererMetrics, RendererOptions, RendererStatus } from '../types';
import { createYardMarkers, type YardMarkers } from '../objects/YardMarkers';
import { FRAMING_TARGETS, createCameraRig, type CameraRig, type FramingReport, type FramingRequest } from './CameraRig';
import { DOG_CLIP_EVENTS } from '../anim/dogPoses';
import { createLoop, type Loop, type LoopTimers } from './loop';
import { observeSize, pixelRatioFor, resolveTier, type ResolvedTier, type Resizer } from './resize';

export interface GameRendererOptions extends RendererOptions {
  /** Character colours and proportions (defaults to src/content). */
  content?: ContentCatalog;
  /** Test seams. */
  timers?: LoopTimers;
  assets?: AssetManager | null;
  /** Disable GLB loading entirely (dev/tests). */
  disableGlb?: boolean;
  /** Lighting preset: the live courtyard rig (default) or a neutral white rig for hero review. */
  lighting?: LightingPreset;
}

export type LightingPreset = 'courtyard' | 'neutral';

interface Tween {
  update(dt: number): boolean;
}

const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const REDUCED_SNAP_MS = 300;
const DEG = Math.PI / 180;
/** D-041 yard: speeds below this count as standing. */
const WORLD_MOVING = 0.05;
/** Yard: after this long with nothing moving or blending the actors are held and frames stop. */
const STILL_HOLD_SECONDS = 4;
/** Yard ground (WORLD_PLAN §2); taps beyond the walls land on the edge. */
const YARD_BOUNDS = { minX: -3.2, maxX: 3.2, minZ: -3.0, maxZ: 3.0 };
/** Toy spot for the 'toy' distraction (WORLD_PLAN §2). */
const TOY_SPOT: YardPoint = { x: 0.8, z: 0.4 };
const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);
/** Raised rest deck (environment GLB: centre (−2.5, −1.5) 1.5 × 1.4, top 0.095; procedural deck at STAGE rest): actors stand on top of it. */
const yardGroundY = (x: number, z: number): number => {
  if (x >= -3.3 && x <= -1.75 && z >= -2.25 && z <= -0.8) return 0.1;
  const r = STAGE_POSITIONS.rest;
  if (Math.abs(x - r.x) <= 0.85 && Math.abs(z - r.z) <= 0.7) return 0.1;
  return 0;
};

/** Dev/test introspection (never used by the UI). */
export interface RendererDebug {
  scene: Scene;
  camera: CameraRig;
  webgl(): WebGLRenderer | null;
  /** Frames actually rendered since creation. */
  frameCount(): number;
  dogs(): DogActorController[];
  humans(): HumanActorController[];
  /** Visible draw calls by scene traversal (what renderer.info reports without culling). */
  countDrawCalls(): { calls: number; triangles: number };
  /** Advance actors/camera/tweens by dt seconds without a WebGL context (checks, snapshots). */
  step(dt: number): boolean;
  /** Measure the focus dog in the current camera (D-034). */
  framingReport(): FramingReport | null;
  /** Last framing request (view, azimuth side, sample count). */
  framingRequest(): FramingRequest | null;
  /** Review harness: lighting preset and yard visibility. */
  setLighting(preset: LightingPreset): void;
  setEnvironmentVisible(visible: boolean): void;
  /** D-041: last world directive applied by updateWorld (null outside the yard). */
  world(): WorldDirective | null;
  /** D-041: true once the yard has been still long enough that actors are held (no frames). */
  worldHeld(): boolean;
  markers: YardMarkers;
  /** present() without the mount gate (Node checks have no WebGL context). */
  present(effect: DomainEffect, options: PresentOptions): Promise<void>;
}

export interface RewardAnchor {
  /** Normalized viewport coordinates: x 0..1 left→right, y 0..1 top→bottom. */
  x: number;
  y: number;
}

export interface GameRendererHandle extends RendererHandle {
  debug: RendererDebug;
  updateWorld(world: WorldDirective): void;
  pick(clientX: number, clientY: number): PickResult | null;
  /** UI hook: where the mark glint should appear (defaults to the header counter, top centre-right). */
  setRewardAnchor(anchor: RewardAnchor | null): void;
}

export function createRenderer(options: GameRendererOptions): RendererHandle {
  return createGameRenderer(options);
}

export function createGameRenderer(options: GameRendererOptions): GameRendererHandle {
  const content: ContentCatalog = options.content ?? defaultContent;
  let status: RendererStatus = 'idle';
  const statusListeners = new Set<(status: RendererStatus) => void>();
  let reducedMotion = options.reducedMotion;
  let tier: ResolvedTier = resolveTier(options.qualityTier);
  let renderer: WebGLRenderer | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let container: HTMLElement | null = null;
  let resizer: Resizer | null = null;
  let unwatchContext: (() => void) | null = null;
  let disposed = false;
  let dpr = 1;
  let viewport = { width: 1, height: 1 };

  const scene = new Scene();
  scene.background = new Color(BACKGROUND_HEX);
  const rig: CameraRig = createCameraRig();
  // Grounded lighting (D-034): warm key front-left-above (camera left = −x), hemisphere fill with a
  // cooler ground bounce; direct + fill stays ≤ π so NoToneMapping + sRGB cannot clip the palette.
  const hemi = new HemisphereLight('#FFF3E2', '#A3ACA6', 1.1);
  hemi.name = 'fill';
  const key = new DirectionalLight('#FFE6C6', 2.2);
  key.name = 'key';
  key.position.set(-3.5, 6.5, 4.5);
  key.target.position.set(0, 0, -0.5);
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5.5;
  key.shadow.camera.right = 5.5;
  key.shadow.camera.top = 5.5;
  key.shadow.camera.bottom = -5.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 25;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(hemi, key, key.target, rig.camera);
  const setLighting = (preset: LightingPreset): void => {
    if (preset === 'neutral') {
      // White hemisphere + soft white key, no colour cast: material/texture review.
      hemi.color.set('#FFFFFF');
      hemi.groundColor.set('#D8D8D8');
      hemi.intensity = 1.4;
      key.color.set('#FFFFFF');
      key.intensity = 1.5;
      key.position.set(-2.5, 6.5, 5.5);
    } else {
      hemi.color.set('#FFF3E2');
      hemi.groundColor.set('#A3ACA6');
      hemi.intensity = 1.1;
      key.color.set('#FFE6C6');
      key.intensity = 2.2;
      key.position.set(-3.5, 6.5, 4.5);
    }
  };
  if (options.lighting) setLighting(options.lighting);

  const assets: AssetManager | null = options.disableGlb ? null : (options.assets ?? createAssetManager({ baseUrl: options.baseUrl, maxAnisotropy: tier === 'high' ? 8 : 4 }));
  const school: SchoolScene = createSchoolScene();
  const props: PropsSet = createProps();
  const markers: YardMarkers = createYardMarkers();
  markers.group.visible = false;
  scene.add(school.group, props.group, markers.group);
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const scratch = new Vector3();

  const dogs = new Map<DogCharacterId, DogActorController>();
  const humans = new Map<HumanCharacterId, HumanActorController>();
  // Ines is a separate player instance; Mira and Alex remain at their own yard spots.
  let player: HumanActorController | null = null;
  const tiers: Record<string, AssetTier> = {};
  let directive: SceneDirective | null = null;
  let firstApply = true;
  let propsDisplaced = false;
  let settleCheck = false;
  // D-041 yard state (see updateWorld).
  let world: WorldDirective | null = null;
  let worldFirst = true;
  let worldMoving = false;
  let worldStill = 0;
  let worldHeld = false;
  let promptZone: string | null = null;
  const worldWaiters: Array<{ pose: PoseId; resolve: () => void }> = [];
  let rewardAnchor: RewardAnchor | null = null;
  const tweens: Tween[] = [];
  let clock = 0;
  /** Growth stage override set by present(growth) until the directive catches up. */
  const growthOverride = new Map<DogCharacterId, GrowthStage>();

  // FPS sampler (1 s window while active).
  let fpsFrames = 0;
  let fpsWindowStart = 0;
  let fpsEstimate = 0;
  let lastDrawCalls = 0;
  let lastTriangles = 0;
  let frameCount = 0;

  const setStatus = (next: RendererStatus): void => {
    if (status === next) return;
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  const applyShadows = (): void => {
    if (!renderer) return;
    const on = tier === 'high';
    renderer.shadowMap.enabled = on;
    renderer.shadowMap.type = PCFSoftShadowMap;
    key.castShadow = on;
    school.yard.receiveShadow = on;
    // Material programs must be recompiled when the shadow map toggles.
    scene.traverse((node) => {
      const mesh = node as { material?: { needsUpdate?: boolean } | { needsUpdate?: boolean }[] };
      if (!mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) m.needsUpdate = true;
    });
  };

  const applySize = (): void => {
    if (!renderer) return;
    dpr = pixelRatioFor(tier, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(viewport.width, viewport.height, false);
    rig.setViewport(viewport.width, viewport.height);
  };

  const step = (dt: number): boolean => {
    clock += dt;
    let animating = false;
    for (const dog of dogs.values()) animating = dog.update(dt) || animating;
    for (const human of humans.values()) animating = human.update(dt) || animating;
    if (player) animating = player.update(dt) || animating;
    animating = rig.update(dt) || animating;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tween = tweens[i] as Tween;
      if (!tween.update(dt)) tweens.splice(i, 1);
      else animating = true;
    }
    if (directive) {
      animating = props.animateEdge(clock, directive.environment === 'courtyard_loud', reducedMotion) || animating;
      const watching = focusDog(directive);
      if (watching?.pose() === 'alert_focus') watching.lookAt(lookTargetFor(directive));
      // Bounds-driven framing (D-034): once the focus dog has settled into its pose, re-measure and
      // ease the camera only if the share left its band (hysteresis keeps lessons calm).
      if (settleCheck && !rig.isMoving()) {
        const dog = focusDog(directive);
        if (!dog || (!dog.isBlending() && !dog.isMoving())) {
          settleCheck = false;
          if (dog && !framingHolds(directive)) frameCamera(directive, reducedMotion);
        }
      }
      if (world && directive.view === 'yard') {
        checkWorldWaiters();
        let blending = false;
        for (const dog of dogs.values()) blending = blending || dog.isBlending();
        for (const human of humans.values()) blending = blending || human.isBlending();
        blending = blending || (player?.isBlending() ?? false);
        if (worldMoving || blending || rig.isMoving() || tweens.length > 0) worldStill = 0;
        else worldStill += dt;
        if (!worldHeld && worldStill >= STILL_HOLD_SECONDS) setWorldHold(true);
        animating = markers.animate(clock, reducedMotion || worldHeld) || animating;
      }
    }
    return animating;
  };

  /** Yard still-hold: freeze idle loops once nothing moves so demand rendering goes back to zero frames. */
  const setWorldHold = (held: boolean): void => {
    worldHeld = held;
    worldStill = 0;
    player?.setHold(held || reducedMotion || (directive?.hold ?? false));
    for (const dog of dogs.values()) dog.setHold(held || reducedMotion);
    for (const human of humans.values()) human.setHold(held || (directive?.hold ?? false));
  };

  const frame = (dt: number, now: number): boolean => {
    if (!renderer || status !== 'ready') return false;
    let animating = step(dt);
    animating = animating || rig.isMoving();
    renderer.render(scene, rig.camera);
    frameCount += 1;
    lastDrawCalls = renderer.info.render.calls;
    lastTriangles = renderer.info.render.triangles;
    fpsFrames += 1;
    if (now - fpsWindowStart >= 1000) {
      fpsEstimate = Math.round((fpsFrames * 1000) / Math.max(1, now - fpsWindowStart));
      fpsFrames = 0;
      fpsWindowStart = now;
    }
    return animating;
  };

  const loop: Loop = createLoop({ frame }, options.timers);
  const invalidate = (): void => {
    if (status === 'ready') loop.invalidate();
  };

  const onTierChange = (id: string, nextTier: AssetTier): void => {
    tiers[id] = nextTier;
    // The swapped-in model has its own silhouette: re-measure the framing once it has settled.
    settleCheck = true;
  };

  const ensureDog = (id: DogCharacterId, growth: GrowthStage): DogActorController => {
    let dog = dogs.get(id);
    if (!dog) {
      dog = createDogActor({ id, growth, character: content.dogs[id], assets, onTierChange, onInvalidate: invalidate });
      dogs.set(id, dog);
      scene.add(dog.root);
      tiers[id] = dog.tier();
    }
    return dog;
  };

  const ensureHuman = (id: HumanCharacterId): HumanActorController => {
    let human = humans.get(id);
    if (!human) {
      human = createHumanActor({ id, character: content.humans[id], assets, onTierChange, onInvalidate: invalidate });
      humans.set(id, human);
      scene.add(human.root);
      tiers[id] = human.tier();
    }
    return human;
  };

  const focusDog = (d: SceneDirective): DogActorController | null => {
    if (d.focusDogId && dogs.has(d.focusDogId)) return dogs.get(d.focusDogId) as DogActorController;
    if (dogs.has('dog_nala')) return dogs.get('dog_nala') as DogActorController;
    const first = dogs.values().next();
    return first.done ? null : first.value;
  };

  const isDogId = (id: string): id is DogCharacterId => Object.prototype.hasOwnProperty.call(content.dogs, id);
  const isHumanId = (id: string): id is HumanCharacterId => Object.prototype.hasOwnProperty.call(content.humans, id);

  const worldDog = (w: WorldDirective): { actor: WorldActorDirective; dog: DogActorController } | null => {
    const actor = w.actors.find((a) => a.key === 'dog');
    if (!actor || !isDogId(actor.characterId)) return null;
    const dog = dogs.get(actor.characterId);
    return dog ? { actor, dog } : null;
  };

  /**
   * Yard framing: the dog's coarse surface plus the whole player body and a lead point ahead of whoever walks (≤ 0.6 m); the rig keeps the dog ≥ 12 %
   * and centres the union.
   */
  const yardRequest = (w: WorldDirective): FramingRequest => {
    const wd = worldDog(w);
    const handler = w.actors.find((a) => a.key === 'handler');
    const ground = wd ? wd.dog.position() : new Vector3(w.focus.x, 0, w.focus.z);
    const points = wd ? wd.dog.measureCoarse() : [ground.clone(), ground.clone().setY(0.4)];
    const companions: Vector3[] = [];
    let handlerPoint: Vector3 | null = null;
    if (handler) {
      handlerPoint = new Vector3(handler.position.x, 0, handler.position.z);
      for (const [dx, dz] of [[-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]] as const) companions.push(handlerPoint.clone().add(new Vector3(dx, 0, dz)));
      companions.push(handlerPoint.clone().setY((player?.topHeight() ?? 1.7) + 0.12));
    }
    const mover = handler && handler.speed > WORLD_MOVING ? handler : wd && wd.actor.speed > WORLD_MOVING ? wd.actor : null;
    if (mover) {
      const l = Math.min(0.6, 0.4 * mover.speed);
      companions.push(new Vector3(mover.position.x + Math.sin(mover.facing * DEG) * l, 0, mover.position.z + Math.cos(mover.facing * DEG) * l));
    }
    return { view: 'yard', points, ground, zone: null, facing: wd ? wd.dog.facing() * DEG : 0, handler: handlerPoint, companions };
  };

  const framingRequest = (d: SceneDirective): FramingRequest => {
    if (d.view === 'yard' && world) return yardRequest(world);
    const dog = focusDog(d);
    const zone = d.environment === 'rest_place' || d.environment === 'sniff_corner' ? ZONE_FOCUS[d.environment] : null;
    if (!dog) {
      // No dog (review harness with a human subject): frame the first human instead.
      const h0 = d.humans[0];
      const human = h0 ? humans.get(h0.id) : undefined;
      if (human) return { view: d.view, points: human.measure(), ground: human.position(), zone, facing: (human.facing() * Math.PI) / 180, handler: null };
      return { view: d.view, points: [], ground: new Vector3(0, 0, 0), zone, facing: 0, handler: null };
    }
    // Sample the deformed surface at the current pose, shifted to where the dog will stand.
    const ground = dog.destination();
    const shift = ground.clone().sub(dog.position());
    const points = dog.measure().map(point => point.clone());
    if (shift.lengthSq() > 1e-8) for (const p of points) p.add(shift);
    // Keep the moving stimulus in the same teaching frame as the dog's signals.
    if (d.view !== 'school') for (const id of ['ball', 'toy_rolling'] as const) {
      if (!d.props.includes(id)) continue;
      const centre = propHolder(props, id).getWorldPosition(new Vector3());
      for (const dx of [-.12, .12]) for (const dy of [0, .15]) for (const dz of [-.12, .12]) points.push(centre.clone().add(new Vector3(dx, dy, dz)));
    }
    // Front three-quarter on the handler's side (closeup / lesson); the school keeps its fixed side.
    const h = d.humans[0];
    let handler = h && humans.has(h.id) ? (humans.get(h.id) as HumanActorController).position() : null;
    // View edge zones from the courtyard interior so rails/planters do not cover the teaching pose.
    if (d.view !== 'school' && Math.abs(ground.x) > 1.8) {
      handler = ground.clone().add(new Vector3(ground.x < 0 ? 2 : -2, 0, 1));
    }
    const facing = (dog.facing() * Math.PI) / 180;
    return { view: d.view, points, ground, zone, facing, handler, yard: d.view === 'school' ? SCHOOL_CORE_POINTS : undefined };
  };

  const frameCamera = (d: SceneDirective, instant: boolean): void => {
    rig.frame(framingRequest(d), instant);
    settleCheck = true;
  };

  /** D-034 band check on the current camera against the dog's current surface. */
  const framingHolds = (d: SceneDirective): boolean => {
    // The yard camera is re-fitted by updateWorld every step.
    if (d.view === 'yard') return true;
    const dog = focusDog(d);
    if (!dog) return true;
    const r = rig.report(dog.measure(), d.view);
    const t = FRAMING_TARGETS[d.view];
    return r.heightShare >= t.min && r.heightShare <= t.max && r.minMargin >= t.margin;
  };

  const framingReport = (): FramingReport | null => {
    if (!directive) return null;
    const dog = focusDog(directive);
    return dog ? rig.report(dog.measure(), directive.view) : null;
  };

  /** Clip event time (seconds) for a pose: manifest clipMeta when a GLB is used, else the procedural table. */
  const clipEvent = (dog: DogActorController, pose: PoseId, event: string): number | undefined => {
    const meta = assets?.clipMeta(dog.assetKey(), pose);
    const fromManifest = meta?.events?.[event];
    if (typeof fromManifest === 'number') return fromManifest;
    return DOG_CLIP_EVENTS[pose]?.[event];
  };

  const lookTargetFor = (d: SceneDirective): Vector3 | null => {
    // Distraction scenes direct the dog's attention to the visible toy instead of the handler.
    const focusPose = d.dogs.find((dog) => dog.id === d.focusDogId)?.pose;
    const distraction = focusPose === 'alert_focus'
      ? d.props.find((id) => id === 'ball' || id === 'toy_rolling')
      : undefined;
    if (distraction) {
      const target = new Vector3();
      propHolder(props, distraction).getWorldPosition(target);
      target.y += distraction === 'ball' ? 0.12 : 0.18;
      return target;
    }
    const human = d.humans[0];
    if (human && humans.has(human.id)) {
      const h = humans.get(human.id) as HumanActorController;
      // Head height from the measured body top (no bone names).
      return h.position().setY(h.topHeight() * 0.92);
    }
    // No handler present: look toward the camera side.
    return new Vector3(2, 1.4, 6);
  };

  /** Resolve present('exercise'|'moment') waiters once the yard dog stands in the awaited pose with the blend finished. */
  const checkWorldWaiters = (): void => {
    if (worldWaiters.length === 0 || !world) return;
    const wd = worldDog(world);
    if (!wd) return;
    if (wd.actor.speed > WORLD_MOVING || wd.dog.isBlending()) return;
    for (let i = worldWaiters.length - 1; i >= 0; i--) {
      const waiter = worldWaiters[i] as { pose: PoseId; resolve: () => void };
      if (wd.actor.pose === waiter.pose && wd.dog.pose() === waiter.pose) {
        worldWaiters.splice(i, 1);
        waiter.resolve();
      }
    }
  };

  /**
   * D-041: per-step world update while the directive carries view 'yard'. Positions, facings and
   * speeds go straight to the actors; the handler is a visible human with a player marker; the
   * camera follows handler + dog; frames continue only while something moves or blends.
   */
  let lastWorldSignature = '';
  const updateWorld = (w: WorldDirective): void => {
    const signature = JSON.stringify(w);
    const unchanged = signature === lastWorldSignature;
    lastWorldSignature = signature;
    world = w;
    if (!directive || directive.view !== 'yard') return;
    // Repeated still directives must not re-fit the camera against animated idle
    // bounds or request a frame. The animation loop handles blends and still-hold.
    if (unchanged && !worldFirst) return;
    const instant = worldFirst || reducedMotion;
    worldFirst = false;
    markers.group.visible = true;
    let anyMoving = false;
    for (const actor of w.actors) {
      if (actor.speed > WORLD_MOVING) anyMoving = true;
      if (actor.key === 'handler' || actor.characterId === 'handler') {
        markers.setHandler(actor.position.x, actor.position.z, actor.facing);
        if (!player) {
          player = createHumanActor({
            id: 'human_mira',
            character: { ...content.humans.human_mira, name: 'Ines', role: 'Nalas Bezugsperson' },
            assets,
            onInvalidate: invalidate,
          });
          player.root.name = 'player_actor';
          player.root.userData.characterName = 'Ines';
          scene.add(player.root);
        }
        player.root.visible = true;
        player.setHold(worldHeld || reducedMotion || (directive?.hold ?? false));
        player.setWorld(actor, instant, yardGroundY(actor.position.x, actor.position.z));
        continue;
      }
      const id = actor.characterId;
      const groundY = yardGroundY(actor.position.x, actor.position.z);
      if (isDogId(id)) {
        const stage = growthOverride.get(id) ?? directive.dogs.find((d) => d.id === id)?.growthStage ?? dogs.get(id)?.growth() ?? 'arriving';
        ensureDog(id, stage).setWorld(actor, instant, groundY);
      } else if (isHumanId(id)) {
        ensureHuman(id).setWorld(actor, instant, groundY);
      }
    }
    worldMoving = anyMoving;
    const zone = w.prompt?.zoneId ?? null;
    if (w.prompt) markers.setPrompt(w.prompt.position.x, w.prompt.position.z, w.prompt.radius, true);
    else markers.setPrompt(0, 0, 1, false);
    if (w.momentSpot) markers.setMoment(w.momentSpot.x, w.momentSpot.z, true);
    else markers.setMoment(0, 0, false);
    const ball = propHolder(props, 'ball');
    if (w.distraction === 'toy') {
      ball.visible = true;
      ball.position.set(TOY_SPOT.x, 0, TOY_SPOT.z);
      propsDisplaced = true;
    } else if (!directive.props.includes('ball')) {
      ball.visible = false;
    }
    // Movement or a new prompt wakes the scene from the still-hold.
    if ((anyMoving || zone !== promptZone) && worldHeld) setWorldHold(false);
    if (anyMoving || zone !== promptZone) worldStill = 0;
    promptZone = zone;
    rig.frame(yardRequest(w), instant);
    checkWorldWaiters();
    invalidate();
  };

  /** Hit box for picking: dog/human from the measured body (footprint radius × height), handler from the visible player body. */
  const actorBox = (actor: WorldActorDirective): Box3 | null => {
    const { x, z } = actor.position;
    if (actor.key === 'handler' || actor.characterId === 'handler') {
      const y = player?.position().y ?? 0;
      return new Box3(new Vector3(x - 0.36, y - 0.05, z - 0.36), new Vector3(x + 0.36, y + (player?.topHeight() ?? 1.7) + 0.05, z + 0.36));
    }
    const id = actor.characterId;
    const body = isDogId(id) ? dogs.get(id) : isHumanId(id) ? humans.get(id) : undefined;
    if (!body) return null;
    const r = Math.max(0.3, body.bodyLength() * 0.55);
    const y = body.position().y;
    return new Box3(new Vector3(x - r, y - 0.05, z - r), new Vector3(x + r, y + body.topHeight() + 0.05, z + r));
  };

  /**
   * D-041 hit test. Client pixels → canvas rect → NDC → ray through the orthographic camera.
   * Actors first (dog, then the others) by bounding sphere; then the ground plane: inside the active
   * prompt disc → zone, otherwise ground clamped to the yard bounds. null outside the yard view or
   * outside the canvas.
   */
  const pick = (clientX: number, clientY: number): PickResult | null => {
    if (!directive || directive.view !== 'yard' || !world) return null;
    const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0, ...rig.viewport() };
    if (rect.width <= 0 || rect.height <= 0) return null;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
    if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return null;
    rig.camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer.set(nx, ny), rig.camera);
    const order = [...world.actors].sort((a, b) => Number(b.key === 'dog') - Number(a.key === 'dog'));
    for (const actor of order) {
      const box = actorBox(actor);
      if (box && raycaster.ray.intersectsBox(box)) return { kind: 'actor', actor: actor.key, point: { x: actor.position.x, z: actor.position.z } };
    }
    const hit = raycaster.ray.intersectPlane(GROUND_PLANE, scratch);
    if (!hit) return null;
    const round = (v: number): number => Math.round(v * 1000) / 1000;
    const point: YardPoint = { x: round(hit.x), z: round(hit.z) };
    const p = world.prompt;
    if (p && Math.hypot(point.x - p.position.x, point.z - p.position.z) <= p.radius) return { kind: 'zone', zoneId: p.zoneId, point };
    return {
      kind: 'ground',
      point: { x: Math.max(YARD_BOUNDS.minX, Math.min(YARD_BOUNDS.maxX, point.x)), z: Math.max(YARD_BOUNDS.minZ, Math.min(YARD_BOUNDS.maxZ, point.z)) },
    };
  };

  const apply = (next: SceneDirective): void => {
    const instant = firstApply || reducedMotion;
    firstApply = false;
    const previous = directive;
    directive = next;
    lastWorldSignature = '';
    const inYard = next.view === 'yard' && Boolean(next.world ?? world);
    if (next.world) world = next.world;
    if (!inYard) {
      // Leaving the yard: markers off, still-hold released, waiters resolve via their deadline.
      if (world || worldHeld) {
        worldHeld = false;
        worldStill = 0;
      }
      world = null;
      worldFirst = true;
      promptZone = null;
      markers.group.visible = false;
      if (player) { player.root.visible = false; player.setHold(true); }
    }
    const worldIds = new Set<string>(inYard && world ? world.actors.map((a) => a.characterId) : []);

    school.setEnvironment(next.environment);
    const upgrades = new Set(next.upgrades);
    for (const p of next.props) if (!isCareProp(p)) upgrades.add(p);
    school.setUpgrades([...upgrades]);
    if (propsDisplaced) {
      props.homeAll();
      propsDisplaced = false;
    }
    props.setVisible(next.props);
    if (next.view !== 'school') {
      const focus = next.dogs.find(dog => dog.id === next.focusDogId);
      if (focus) {
        // In the yard the care props go where the dog actually stands (D-041), not to the stage positions.
        const yardDog = inYard && world ? worldDog(world) : null;
        const yardPoint = yardDog ? new Vector3(yardDog.actor.position.x, 0, yardDog.actor.position.z) : null;
        const facingDeg = yardDog ? yardDog.actor.facing : focus.facing;
        const point = yardPoint ?? STAGE_POSITIONS[focus.position];
        const forward = new Vector3(Math.sin(facingDeg * Math.PI / 180), 0, Math.cos(facingDeg * Math.PI / 180));
        if (next.props.includes('leaf') && focus.pose === 'sniff') {
          propHolder(props, 'leaf').position.copy(point).addScaledVector(forward, .40).setY(.01);
          propsDisplaced = true;
        }
        if (next.props.includes('blanket') || next.environment === 'rest_place') {
          propHolder(props, 'blanket').position.copy(yardPoint ?? STAGE_POSITIONS.rest).setY(.095);
          propHolder(props, 'blanket').visible = true;
          propsDisplaced = true;
        }
      }
    }

    // Humans first so dogs can look at them.
    const wantedHumans = new Set(next.humans.map((h) => h.id));
    for (const [id, human] of humans) {
      if (!wantedHumans.has(id)) {
        human.dispose();
        humans.delete(id);
        delete tiers[id];
      }
    }
    for (const h of next.humans) {
      const human = ensureHuman(h.id);
      human.setHold(next.hold);
      if (!worldIds.has(h.id)) human.applyDirective(h, { instant });
    }

    const wantedDogs = new Set(next.dogs.map((d) => d.id));
    for (const [id, dog] of dogs) {
      if (!wantedDogs.has(id)) {
        dog.dispose();
        dogs.delete(id);
        delete tiers[id];
      }
    }
    for (const d of next.dogs) {
      const override = growthOverride.get(d.id);
      const stage = override ?? d.growthStage;
      if (override && override === d.growthStage) growthOverride.delete(d.id);
      const dog = ensureDog(d.id, stage);
      if (dog.growth() !== stage) {
        // Proportion swap happens here (the UI applies growth only outside lessons).
        dog.setGrowth(stage);
      }
      dog.setHold(reducedMotion);
      if (!worldIds.has(d.id)) dog.applyDirective(d, { instant, lookTarget: lookTargetFor(next) });
    }
    if (inYard && world) {
      // World-driven actors take their positions from the world directive (instant on entry).
      worldHeld = false;
      updateWorld(world);
      return;
    }

    const viewChanged = !previous || previous.view !== next.view || previous.environment !== next.environment || previous.focusDogId !== next.focusDogId;
    let dogMoving = false;
    for (const dog of dogs.values()) dogMoving = dogMoving || dog.isMoving();
    // Camera moves are eased only between views (06); a subject that walks is followed with the same ease.
    frameCamera(next, instant || !(viewChanged || dogMoving));
    invalidate();
  };

  // ---------------------------------------------------------------------------
  // present()
  // ---------------------------------------------------------------------------

  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

  const withDeadline = (work: Promise<void>, maxDurationMs: number): Promise<void> =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, Math.max(0, maxDurationMs));
      work.then(finish, finish);
    });

  const moveProp = (id: CarePropId, to: Vector3, seconds: number, snap: boolean): Promise<void> => {
    const holder = propHolder(props, id);
    holder.visible = true;
    propsDisplaced = true;
    if (snap || seconds <= 0) {
      holder.position.copy(to);
      invalidate();
      return Promise.resolve();
    }
    const from = holder.position.clone();
    let t = 0;
    return new Promise<void>((resolve) => {
      tweens.push({
        update(dt) {
          t = Math.min(1, t + dt / seconds);
          const k = easeInOut(t);
          holder.position.lerpVectors(from, to, k);
          if (id === 'ball' || id === 'toy_rolling') holder.rotation.x = (from.distanceTo(holder.position) / 0.06) % (Math.PI * 2);
          if (t >= 1) {
            resolve();
            return false;
          }
          return true;
        },
      });
      invalidate();
    });
  };

  const inFrontOf = (dog: DogActorController, distance: number): Vector3 => {
    const facing = (dog.facing() * Math.PI) / 180;
    const p = dog.position();
    return new Vector3(p.x + Math.sin(facing) * distance, 0, p.z + Math.cos(facing) * distance);
  };

  const presentCare = async (kind: CareKind, pose: PoseId, snap: boolean): Promise<void> => {
    const dog = dogs.get('dog_nala') ?? focusDog(directive ?? emptyDirective());
    if (!dog) return;
    // Reach from the measured body length (bounds-based, works for vendor models).
    const reach = dog.bodyLength() * 0.55 + 0.1;
    if (kind === 'meal') {
      await moveProp('bowl', inFrontOf(dog, reach), 0.9, snap);
      // Resolves at the clip event `treat_received` (08 clip metadata) or the clip end / maxDurationMs.
      await dog.play(pose, { instant: snap, restart: true, resolveAtSeconds: clipEvent(dog, pose, 'treat_received') });
      invalidate();
      return;
    }
    if (kind === 'rest') {
      const under = dog.position();
      under.y = 0.0;
      await moveProp('blanket', under, 0.8, snap);
      if (pose === 'rest_loop' && dog.pose() !== 'lie_down' && dog.pose() !== 'rest_loop') {
        await dog.play('lie_down', { instant: snap, restart: true });
      }
      await dog.play(pose, { instant: snap, restart: true });
      if (!snap) await wait(1200);
      invalidate();
      return;
    }
    if (kind === 'play') {
      await moveProp('ball', inFrontOf(dog, reach + 0.1), 0.9, snap);
      await dog.play(pose, { instant: snap, restart: true });
      if (!snap) await wait(600);
      invalidate();
      return;
    }
    // calm: give distance → recover (no prop)
    await dog.play(pose, { instant: snap, restart: true });
    if (!snap) await wait(400);
    invalidate();
  };

  /**
   * Decision → reaction → feedback (D-035): a 300 ms camera accent toward the dog (4 % of the
   * frustum), the reaction cross-fade, the handler's gesture when the directive provides one, a
   * ≤ 600 ms settle, then resolve and release the accent. Reduced motion: no accent, instant pose.
   */
  const presentDecision = async (dogId: DogCharacterId, poseAfter: PoseId, snap: boolean): Promise<void> => {
    const dog = dogs.get(dogId);
    if (!dog) return;
    if (snap) {
      await dog.play(poseAfter, { instant: true, restart: true });
      invalidate();
      return;
    }
    rig.pushIn(0.04);
    invalidate();
    const reaction = dog.play(poseAfter, { restart: true });
    const gesture = directive?.humans[0];
    if (gesture && humans.has(gesture.id) && gesture.gesture !== 'idle') {
      void (humans.get(gesture.id) as HumanActorController).play(gesture.gesture, { restart: true });
    }
    await Promise.race([reaction, wait(5000)]);
    await wait(Math.min(600, 350));
    rig.release();
    invalidate();
  };

  const presentGrowth = async (to: GrowthStage, snap: boolean): Promise<void> => {
    const dog = dogs.get('dog_nala');
    if (!dog) return;
    if (dog.growth() === to) return;
    growthOverride.set('dog_nala', to);
    if (!snap) {
      const fromH = dog.proportions().shoulderHeight;
      const toH = content.dogs.dog_nala.shoulderHeightM[to === 'arriving' ? 'arriving' : 'growing'];
      const ratio = toH / fromH;
      let t = 0;
      await new Promise<void>((resolve) => {
        tweens.push({
          update(dt) {
            t = Math.min(1, t + dt / 1.5);
            dog.setVisualScale(1 + (ratio - 1) * easeInOut(t));
            if (t >= 1) {
              resolve();
              return false;
            }
            return true;
          },
        });
        invalidate();
      });
    }
    // Swap proportions only after the blend, never mid-animation.
    dog.setVisualScale(1);
    dog.setGrowth(to);
    if (directive) frameCamera(directive, true);
    invalidate();
  };

  /**
   * Mark glint (D-035): 6–10 gold sprites for 500 ms at the header counter anchor (top, never over
   * the dog); resolves when the glint has faded (≤ 700 ms).
   */
  const presentReward = (snap: boolean): Promise<void> => {
    if (snap) return Promise.resolve();
    const count = 8;
    const positions = new Float32Array(count * 3);
    const velocities: Vector3[] = [];
    const f = rig.current();
    for (let i = 0; i < count; i++) {
      const a = Math.PI * 0.15 + (i / (count - 1)) * Math.PI * 0.7;
      const speed = 0.5 + (i % 3) * 0.18;
      velocities.push(new Vector3(Math.cos(a) * speed, Math.sin(a) * speed + 0.2, 0));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({ color: new Color(PALETTE.gold), size: 6, sizeAttenuation: false, transparent: true, opacity: 0.95, depthTest: false });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 10;
    // Camera space: the header mark counter (UI hook setRewardAnchor), default top centre-right.
    const anchor = rewardAnchor ?? { x: 0.72, y: 0.08 };
    points.position.set((anchor.x * 2 - 1) * f.halfWidth, (1 - anchor.y * 2) * f.halfHeight, -5);
    rig.camera.add(points);
    let t = 0;
    const life = 0.5;
    return new Promise<void>((resolve) => {
      tweens.push({
        update(dt) {
          t += dt;
          const k = Math.min(1, t / life);
          const pos = geometry.getAttribute('position') as BufferAttribute;
          for (let i = 0; i < count; i++) {
            const v = velocities[i] as Vector3;
            pos.setXYZ(i, v.x * t * f.halfWidth * 0.3, (v.y * t - 1.2 * t * t) * f.halfHeight * 0.3, 0);
          }
          pos.needsUpdate = true;
          material.opacity = 0.95 * (1 - k * k);
          if (k >= 1) {
            rig.camera.remove(points);
            geometry.dispose();
            material.dispose();
            resolve();
            return false;
          }
          return true;
        },
      });
      invalidate();
    });
  };

  /**
   * D-041 exercise/moment response: in the yard the world controller moves the dog (the UI feeds
   * the response into the yard directive), so this resolves on the first updateWorld where the dog
   * stands still in the response pose with the blend finished, or at maxDurationMs. Outside the
   * yard the pose plays on the stage like a decision.
   */
  const presentWorldPose = (dogId: DogCharacterId, pose: PoseId, snap: boolean): Promise<void> => {
    const dog = dogs.get(dogId) ?? focusDog(directive ?? emptyDirective());
    if (!dog) return Promise.resolve();
    if (world && directive?.view === 'yard') {
      return new Promise<void>((resolve) => {
        worldWaiters.push({ pose, resolve });
        checkWorldWaiters();
      });
    }
    return dog.play(pose, { instant: snap, restart: true }).then(() => invalidate());
  };

  const present = (effect: DomainEffect, opts: PresentOptions): Promise<void> => {
    if (status !== 'ready') return Promise.resolve();
    return presentEffect(effect, opts);
  };

  const presentEffect = (effect: DomainEffect, opts: PresentOptions): Promise<void> => {
    const snap = opts.reducedMotion || reducedMotion;
    const budget = snap ? Math.min(REDUCED_SNAP_MS, opts.maxDurationMs) : opts.maxDurationMs;
    let work: Promise<void>;
    switch (effect.type) {
      case 'care':
        work = presentCare(effect.kind, effect.pose, snap);
        break;
      case 'decision':
        work = presentDecision(effect.dogId, effect.poseAfter, snap);
        break;
      case 'visitRewarded':
      case 'upgradeBought':
        work = presentReward(snap);
        break;
      case 'growth':
        work = presentGrowth(effect.to, snap);
        break;
      case 'exercise':
        work = presentWorldPose(effect.dogId, effect.pose, snap);
        break;
      case 'moment':
        work = presentWorldPose('dog_nala', effect.pose, snap);
        break;
      case 'offlineApplied':
      case 'band':
      case 'lost':
      default:
        work = Promise.resolve();
    }
    invalidate();
    return withDeadline(work, budget);
  };

  // ---------------------------------------------------------------------------
  // mount / lifecycle
  // ---------------------------------------------------------------------------

  const mount = async (target: HTMLElement): Promise<RendererStatus> => {
    if (disposed) return status;
    container = target;
    setStatus('loading');
    if (!isWebGLAvailable()) {
      setStatus('failed');
      return status;
    }
    canvas = document.createElement('canvas');
    canvas.className = 'scene-canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.backgroundColor = BACKGROUND_HEX;
    target.appendChild(canvas);
    const initialDpr = pixelRatioFor(tier, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    const created = tryCreateWebGLRenderer(canvas, initialDpr <= 1.5);
    if (!created.renderer) {
      console.warn('[render] WebGLRenderer failed:', created.error);
      canvas.remove();
      canvas = null;
      setStatus('failed');
      return status;
    }
    renderer = created.renderer;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    renderer.setClearColor(new Color(BACKGROUND_HEX), 1);
    renderer.info.autoReset = true;
    applyShadows();
    unwatchContext = watchContextLoss(canvas, {
      onLost: () => {
        loop.setActive(false);
        setStatus('contextLost');
      },
      onRestored: () => {
        applyShadows();
        applySize();
        setStatus('ready');
        loop.setActive(true);
        invalidate();
      },
    });
    resizer = observeSize(target, (w, h) => {
      viewport = { width: w, height: h };
      applySize();
      invalidate();
    });
    setStatus('ready');
    if (directive) {
      firstApply = true;
      apply(directive);
    }
    void loadStaticAssets();
    invalidate();
    return status;
  };

  /** environment.school, props.care, props.upgrades: swap in when the manifest marks them usable. */
  const loadStaticAssets = async (): Promise<void> => {
    if (!assets) return;
    await assets.loadManifest();
    const env = await assets.load('environment.school', { requireSkinned: false, requiredClips: [] });
    if (env && !disposed) {
      const instance = assets.instantiate('environment.school');
      if (instance) {
        instance.traverse((node) => {
          (node as { receiveShadow?: boolean }).receiveShadow = true;
        });
        school.setExternalEnvironment(instance);
        tiers['environment.school'] = 'glb';
        invalidate();
      }
    }
    const care = await assets.load('props.care', { requireSkinned: false, requiredClips: [] });
    if (care && !disposed) {
      const instance = assets.instantiate('props.care');
      if (instance) {
        let used = 0;
        for (const id of CARE_PROP_IDS) {
          const node = instance.getObjectByName(id);
          if (!node) continue;
          node.removeFromParent();
          props.setExternal(id, node);
          used += 1;
        }
        if (used > 0) tiers['props.care'] = 'glb';
        else assets.release('props.care');
        invalidate();
      }
    }
    const upgrades = await assets.load('props.upgrades', { requireSkinned: false, requiredClips: [] });
    if (upgrades && !disposed) {
      const instance = assets.instantiate('props.upgrades');
      if (instance) {
        let used = 0;
        for (const id of ['rest_place', 'sniff_corner'] as const) {
          const node = instance.getObjectByName(id);
          if (!node) continue;
          node.removeFromParent();
          school.setExternalUpgrade(id, node);
          used += 1;
        }
        if (used > 0) tiers['props.upgrades'] = 'glb';
        else assets.release('props.upgrades');
        invalidate();
      }
    }
  };

  const countDrawCalls = (): { calls: number; triangles: number } => {
    let calls = 0;
    let triangles = 0;
    scene.updateMatrixWorld(true);
    scene.traverse((node) => {
      const mesh = node as { isMesh?: boolean; isPoints?: boolean; visible: boolean; geometry?: BufferGeometry; parent: unknown };
      if (!(mesh.isMesh || mesh.isPoints)) return;
      let visible = true;
      let p: { visible: boolean; parent: unknown } | null = node as { visible: boolean; parent: unknown };
      while (p) {
        if (!p.visible) visible = false;
        p = p.parent as { visible: boolean; parent: unknown } | null;
      }
      if (!visible) return;
      calls += 1;
      const g = mesh.geometry;
      if (g) {
        const index = g.getIndex();
        triangles += Math.floor((index ? index.count : g.getAttribute('position').count) / 3);
      }
    });
    return { calls, triangles };
  };

  const handle: GameRendererHandle = {
    debug: {
      scene,
      camera: rig,
      webgl: () => renderer,
      frameCount: () => frameCount,
      dogs: () => [...dogs.values()],
      humans: () => [...humans.values(), ...(player?.root.visible ? [player] : [])],
      countDrawCalls,
      step,
      framingReport,
      framingRequest: () => rig.lastRequest(),
      setLighting(preset) {
        setLighting(preset);
        invalidate();
      },
      setEnvironmentVisible(visible) {
        school.group.visible = visible;
        invalidate();
      },
      world: () => world,
      worldHeld: () => worldHeld,
      markers,
      present: presentEffect,
    },
    setRewardAnchor(anchor) {
      rewardAnchor = anchor;
    },
    mount,
    apply,
    present,
    updateWorld,
    pick,
    setActive(active) {
      loop.setActive(active);
      if (active) {
        fpsFrames = 0;
        fpsWindowStart = options.timers?.now() ?? (typeof performance !== 'undefined' ? performance.now() : 0);
        invalidate();
      }
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
    setQuality(next: QualityTier) {
      const resolved = resolveTier(next);
      if (resolved === tier) return;
      tier = resolved;
      applyShadows();
      applySize();
      invalidate();
    },
    invalidate,
    getStatus: () => status,
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    getMetrics(): RendererMetrics {
      return {
        drawCalls: lastDrawCalls,
        triangles: lastTriangles,
        fpsEstimate: loop.isActive() ? fpsEstimate : 0,
        dpr,
        textureBytesEstimate: contactShadowBytes() + (assets?.textureBytes() ?? 0) + (tier === 'high' && renderer ? 1024 * 1024 * 4 : 0),
        assetTiers: { ...tiers },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      resizer?.dispose();
      unwatchContext?.();
      for (const dog of dogs.values()) dog.dispose();
      for (const human of humans.values()) human.dispose();
      player?.dispose();
      player = null;
      dogs.clear();
      humans.clear();
      school.dispose();
      props.dispose();
      markers.dispose();
      for (const waiter of worldWaiters.splice(0)) waiter.resolve();
      assets?.dispose();
      disposeContactShadows();
      disposeSharedMaterials();
      renderer?.dispose();
      renderer = null;
      canvas?.remove();
      canvas = null;
      container = null;
      setStatus('idle');
    },
  };
  return handle;
}

function emptyDirective(): SceneDirective {
  return { view: 'school', environment: 'courtyard', upgrades: [], dogs: [], humans: [], props: [], focusDogId: null, hold: false };
}

export { CARE_PROP_IDS };
