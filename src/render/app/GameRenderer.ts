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
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  NoToneMapping,
  PCFSoftShadowMap,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
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
} from '../../simulation/types';
import { isWebGLAvailable, tryCreateWebGLRenderer, watchContextLoss } from '../fallback';
import { createAssetManager, type AssetManager } from '../loaders/AssetManager';
import { BACKGROUND_HEX, PALETTE, disposeSharedMaterials } from '../materials/palette';
import { createDogActor, createHumanActor, type DogActorController, type HumanActorController } from '../objects/ActorController';
import { CARE_PROP_IDS, createProps, isCareProp, propHolder, type CarePropId, type PropsSet } from '../objects/Props';
import { ZONE_FOCUS, contactShadowBytes, createSchoolScene, disposeContactShadows, type SchoolScene } from '../objects/SchoolScene';
import type { AssetTier } from '../anim/PoseController';
import type { PresentOptions, RendererHandle, RendererMetrics, RendererOptions, RendererStatus } from '../types';
import { createCameraRig, type CameraRig } from './CameraRig';
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
}

interface Tween {
  update(dt: number): boolean;
}

const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const REDUCED_SNAP_MS = 300;

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
}

export interface GameRendererHandle extends RendererHandle {
  debug: RendererDebug;
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
  const hemi = new HemisphereLight('#FFF3E2', '#B5AD8E', 1.1);
  hemi.name = 'fill';
  const key = new DirectionalLight('#FFE6C6', 2.2);
  key.name = 'key';
  key.position.set(3.5, 6.5, 4.5);
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

  const assets: AssetManager | null = options.disableGlb ? null : (options.assets ?? createAssetManager({ baseUrl: options.baseUrl }));
  const school: SchoolScene = createSchoolScene();
  const props: PropsSet = createProps();
  scene.add(school.group, props.group);

  const dogs = new Map<DogCharacterId, DogActorController>();
  const humans = new Map<HumanCharacterId, HumanActorController>();
  const tiers: Record<string, AssetTier> = {};
  let directive: SceneDirective | null = null;
  let firstApply = true;
  let propsDisplaced = false;
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

  const frame = (dt: number, now: number): boolean => {
    if (!renderer || status !== 'ready') return false;
    clock += dt;
    let animating = false;
    for (const dog of dogs.values()) animating = dog.update(dt) || animating;
    for (const human of humans.values()) animating = human.update(dt) || animating;
    animating = rig.update(dt) || animating;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tween = tweens[i] as Tween;
      if (!tween.update(dt)) tweens.splice(i, 1);
      else animating = true;
    }
    if (directive) {
      animating = props.animateEdge(clock, directive.environment === 'courtyard_loud', directive.hold) || animating;
    }
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

  const frameCamera = (d: SceneDirective, instant: boolean): void => {
    const dog = focusDog(d);
    const subject = dog ? dog.destination() : new Vector3(0, 0, 0);
    const extent = dog ? dog.extent() : 0.8;
    const zone = d.environment === 'rest_place' || d.environment === 'sniff_corner' ? ZONE_FOCUS[d.environment] : null;
    rig.frame({ view: d.view, subject, subjectExtent: extent, zone }, instant);
  };

  const lookTargetFor = (d: SceneDirective): Vector3 | null => {
    const human = d.humans[0];
    if (human && humans.has(human.id)) {
      const h = humans.get(human.id) as HumanActorController;
      return h.position().setY(1.0);
    }
    // No handler present: look toward the camera side.
    return new Vector3(2, 1.4, 6);
  };

  const apply = (next: SceneDirective): void => {
    const instant = firstApply || reducedMotion;
    firstApply = false;
    const previous = directive;
    directive = next;

    school.setEnvironment(next.environment);
    const upgrades = new Set(next.upgrades);
    for (const p of next.props) if (!isCareProp(p)) upgrades.add(p);
    school.setUpgrades([...upgrades]);
    if (propsDisplaced) {
      props.homeAll();
      propsDisplaced = false;
    }
    props.setVisible(next.props);

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
      human.applyDirective(h, { instant });
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
      dog.setHold(next.hold);
      dog.applyDirective(d, { instant, lookTarget: lookTargetFor(next) });
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
    const reach = dog.proportions().bodyLength * 0.55 + 0.1;
    if (kind === 'meal') {
      await moveProp('bowl', inFrontOf(dog, reach), 0.9, snap);
      await dog.play(pose, { instant: snap, restart: true });
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

  const presentReward = (snap: boolean): Promise<void> => {
    if (snap) return Promise.resolve();
    const count = 26;
    const positions = new Float32Array(count * 3);
    const velocities: Vector3[] = [];
    const f = rig.current();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const speed = 0.25 + Math.random() * 0.45;
      velocities.push(new Vector3(Math.cos(a) * speed, Math.sin(a) * speed * 0.8 + 0.3, 0));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({ color: new Color(PALETTE.gold), size: 5, sizeAttenuation: false, transparent: true, opacity: 0.95, depthTest: false });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 10;
    // Camera space: top-centre of the frustum (the UI anchor for marks sits at the top).
    points.position.set(0, f.halfHeight * 0.68, -5);
    rig.camera.add(points);
    let t = 0;
    const life = 1.1;
    return new Promise<void>((resolve) => {
      tweens.push({
        update(dt) {
          t += dt;
          const k = Math.min(1, t / life);
          const pos = geometry.getAttribute('position') as BufferAttribute;
          for (let i = 0; i < count; i++) {
            const v = velocities[i] as Vector3;
            pos.setXYZ(i, v.x * t * f.halfWidth * 0.6, (v.y * t - 0.45 * t * t) * f.halfHeight * 0.5, 0);
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

  const present = (effect: DomainEffect, opts: PresentOptions): Promise<void> => {
    if (status !== 'ready') return Promise.resolve();
    const snap = opts.reducedMotion || reducedMotion;
    const budget = snap ? Math.min(REDUCED_SNAP_MS, opts.maxDurationMs) : opts.maxDurationMs;
    let work: Promise<void>;
    switch (effect.type) {
      case 'care':
        work = presentCare(effect.kind, effect.pose, snap);
        break;
      case 'decision': {
        const dog = dogs.get(effect.dogId);
        work = dog ? dog.play(effect.poseAfter, { instant: snap, restart: true }).then(() => (snap ? undefined : wait(900))) : Promise.resolve();
        break;
      }
      case 'visitRewarded':
        work = presentReward(snap);
        break;
      case 'growth':
        work = presentGrowth(effect.to, snap);
        break;
      case 'upgradeBought':
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
      humans: () => [...humans.values()],
      countDrawCalls,
    },
    mount,
    apply,
    present,
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
      dogs.clear();
      humans.clear();
      school.dispose();
      props.dispose();
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
