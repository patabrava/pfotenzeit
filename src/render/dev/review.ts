/**
 * Hero review harness (WP-M, not part of the game UI): two subjects side by side, same pose and
 * clip time, fixed cameras and two lighting presets, so a candidate model can be compared with the
 * live one on one screenshot. The pane logic is DOM-free (Node snapshot in the checks); mountReview
 * adds the DOM layout and the turntable loop.
 *
 * Subject specs: `<manifestKey>` (live manifest, procedural fallback), `procedural:<key>` (no GLB),
 * `candidates:<key>` (staged Blender manifest), `vendor-dryrun:<key>` (staged vendor dry run) or a
 * GLB url, optionally `url@<key>` to pick the character the file stands in for.
 */
import { Vector3 } from 'three';
import type { CameraView, GestureId, PoseId, SceneDirective } from '../../simulation/types';
import { CAMERA_AZIMUTH, viewAxes, type Framing } from '../app/CameraRig';
import { createGameRenderer, type GameRendererHandle, type LightingPreset } from '../app/GameRenderer';
import { createAssetManager, type AssetManager } from '../loaders/AssetManager';
import { STAGED_CANDIDATES_MANIFEST, VENDOR_DRYRUN_MANIFEST } from '../devScene';
import type { AssetManifest } from '../types';

export type ReviewCam = 'front' | 'side' | 'closeup_portrait' | 'lesson_strip' | 'landscape';
export type ReviewLight = LightingPreset;
export const REVIEW_CAMS: readonly ReviewCam[] = ['front', 'side', 'closeup_portrait', 'lesson_strip', 'landscape'];
export const REVIEW_LIGHTS: readonly ReviewLight[] = ['neutral', 'courtyard'];

/** Pane size and the live view a camera preset uses (null = fixed review camera). */
export const REVIEW_CAM_PRESETS: Record<ReviewCam, { width: number; height: number; view: CameraView | null }> = {
  front: { width: 480, height: 560, view: null },
  side: { width: 480, height: 560, view: null },
  closeup_portrait: { width: 390, height: 844, view: 'closeup' },
  lesson_strip: { width: 390, height: 232, view: 'lesson' },
  landscape: { width: 844, height: 390, view: 'closeup' },
};

export type SubjectSource = 'live' | 'procedural' | 'candidates' | 'vendor-dryrun' | 'url';

export interface SubjectSpec {
  source: SubjectSource;
  /** Manifest key the subject stands in for (decides dog/human, growth, colours). */
  key: string;
  url?: string;
  label: string;
}

const DOG_KEYS = new Set(['dog.nala.puppy', 'dog.nala.growing', 'dog.bruno.puppy']);
const HUMAN_KEYS = new Set(['human.mira', 'human.alex']);

export function parseSubject(spec: string): SubjectSpec {
  const prefixed = /^(procedural|candidates|vendor-dryrun|live):(.+)$/.exec(spec);
  if (prefixed) {
    const source = prefixed[1] as SubjectSource;
    const key = prefixed[2] as string;
    return { source, key, label: `${source}:${key}` };
  }
  if (spec.includes('/') || spec.endsWith('.glb')) {
    const at = spec.lastIndexOf('@');
    const url = at > 0 ? spec.slice(0, at) : spec;
    const key = at > 0 ? spec.slice(at + 1) : /human/i.test(url) ? 'human.mira' : 'dog.nala.puppy';
    return { source: 'url', key, url, label: url.split('/').pop() ?? url };
  }
  return { source: 'live', key: spec, label: spec };
}

function subjectDirective(spec: SubjectSpec, view: CameraView, pose: string | undefined): SceneDirective {
  const base: SceneDirective = { view, environment: 'courtyard', upgrades: [], dogs: [], humans: [], props: [], focusDogId: null, hold: false };
  if (HUMAN_KEYS.has(spec.key)) {
    const id = spec.key === 'human.alex' ? 'human_alex' : 'human_mira';
    const gesture = (pose as GestureId | undefined) ?? 'idle';
    return { ...base, humans: [{ id, gesture, position: 'center', facing: 0 }] };
  }
  const id = spec.key === 'dog.bruno.puppy' ? 'dog_bruno' : 'dog_nala';
  const growthStage = spec.key === 'dog.nala.growing' ? 'growing' : 'arriving';
  const dogPose = (pose as PoseId | undefined) ?? 'idle_relaxed';
  return { ...base, dogs: [{ id, name: id === 'dog_bruno' ? 'Bruno' : 'Nala', growthStage, pose: dogPose, position: 'center', facing: 0 }], focusDogId: id };
}

export interface ReviewOptions {
  baseUrl: string;
  cam: ReviewCam;
  light: ReviewLight;
  pose?: string;
  /** Test seam: asset manager per subject (Node check loads files from disk). */
  assetsFor?: (spec: SubjectSpec) => AssetManager | null | undefined;
}

/** Default asset manager per subject source (browser). */
export function defaultAssetsFor(baseUrl: string, spec: SubjectSpec): AssetManager | null {
  switch (spec.source) {
    case 'procedural':
      return null;
    case 'candidates':
      return createAssetManager({ baseUrl, manifestUrl: `${baseUrl}${STAGED_CANDIDATES_MANIFEST}`, acceptPending: true });
    case 'vendor-dryrun':
      return createAssetManager({ baseUrl, manifestUrl: `${baseUrl}${VENDOR_DRYRUN_MANIFEST}`, acceptPending: true });
    case 'url': {
      const url = spec.url as string;
      const manifest: AssetManifest = {
        version: 1,
        assets: {
          [spec.key]: { url, status: 'code-authored', bytes: null, triangles: null, clips: [], textureSizes: [], boundsMeters: null, source: 'review url', license: 'review only', material: 'textured' },
        },
      };
      return createAssetManager({ baseUrl, fetchManifest: async () => manifest });
    }
    default:
      return createAssetManager({ baseUrl });
  }
}

export interface ReviewPane {
  spec: SubjectSpec;
  renderer: GameRendererHandle;
  assets: AssetManager | null;
  directive: SceneDirective;
  isDog: boolean;
  light: ReviewLight;
}

export interface ReviewSubjectMetrics {
  label: string;
  key: string;
  tier: string;
  triangles: number;
  /** Draw calls of the whole pane and of the model itself. */
  drawCalls: number;
  actorDrawCalls: number;
  textureBytes: number;
  heightShare: number | null;
  minMargin: number | null;
  azimuthDeg: number | null;
}

export function createReviewPanes(specs: readonly [string, string], options: ReviewOptions): ReviewPane[] {
  const preset = REVIEW_CAM_PRESETS[options.cam];
  const view = preset.view ?? 'closeup';
  return specs.map((raw) => {
    const spec = parseSubject(raw);
    const assets = options.assetsFor ? (options.assetsFor(spec) ?? defaultAssetsFor(options.baseUrl, spec)) : defaultAssetsFor(options.baseUrl, spec);
    const renderer = createGameRenderer({ baseUrl: options.baseUrl, qualityTier: 'high', reducedMotion: false, assets, disableGlb: assets === null, lighting: options.light });
    renderer.debug.setEnvironmentVisible(options.light === 'courtyard');
    const directive = subjectDirective(spec, view, options.pose);
    renderer.debug.camera.setViewport(preset.width, preset.height);
    renderer.apply(directive);
    return { spec, renderer, assets, directive, isDog: directive.dogs.length > 0, light: options.light };
  });
}

/** Subject surface samples of a pane (dog or human). */
export function paneSubjectPoints(pane: ReviewPane): Vector3[] {
  const actor = pane.isDog ? pane.renderer.debug.dogs()[0] : pane.renderer.debug.humans()[0];
  return actor ? actor.measure() : [new Vector3()];
}

/**
 * Fixed review cameras: front (azimuth 0) and side (azimuth 90°) at ~5° elevation ("shoulder
 * height"), subject filling 70 % of the pane height. Live presets unlock the rig.
 */
export function applyReviewCamera(pane: ReviewPane, cam: ReviewCam): void {
  const rig = pane.renderer.debug.camera;
  // The yard only belongs to the live presets: at shoulder height the fence and shelter posts would
  // fill the background of the fixed front/side cameras.
  pane.renderer.debug.setEnvironmentVisible(pane.light === 'courtyard' && REVIEW_CAM_PRESETS[cam].view !== null);
  if (REVIEW_CAM_PRESETS[cam].view) {
    rig.lock(null);
    pane.renderer.apply(pane.directive);
    return;
  }
  const preset = REVIEW_CAM_PRESETS[cam];
  const aspect = preset.width / preset.height;
  const elevation = (5 * Math.PI) / 180;
  const azimuth = cam === 'front' ? 0 : Math.PI / 2;
  const { up, right } = viewAxes(elevation, azimuth);
  const points = paneSubjectPoints(pane);
  let minU = Infinity;
  let maxU = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const p of points) {
    const u = p.dot(up);
    const r = p.dot(right);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
  }
  const height = Math.max(0.1, maxU - minU);
  const width = Math.max(0.1, maxR - minR);
  const halfHeight = Math.max(height / (2 * 0.7), width / (2 * 0.86 * aspect));
  const target = new Vector3().addScaledVector(up, (minU + maxU) / 2).addScaledVector(right, (minR + maxR) / 2);
  const framing: Framing = { target, halfWidth: halfHeight * aspect, halfHeight, elevation, azimuth };
  rig.lock(framing);
  pane.renderer.invalidate();
}

export function reviewMetrics(pane: ReviewPane): ReviewSubjectMetrics {
  const actor = pane.isDog ? pane.renderer.debug.dogs()[0] : pane.renderer.debug.humans()[0];
  const metrics = pane.renderer.getMetrics();
  const calls = pane.renderer.debug.countDrawCalls();
  const loaded = pane.assets?.loaded(pane.spec.key);
  const report = pane.renderer.debug.framingReport();
  return {
    label: pane.spec.label,
    key: pane.spec.key,
    tier: actor?.tier() ?? 'procedural',
    triangles: actor?.triangles() ?? 0,
    drawCalls: calls.calls,
    actorDrawCalls: loaded?.drawCalls ?? 1,
    textureBytes: metrics.textureBytesEstimate,
    heightShare: report?.heightShare ?? null,
    minMargin: report?.minMargin ?? null,
    azimuthDeg: report?.azimuthDeg ?? null,
  };
}

export function setPaneSpin(pane: ReviewPane, radians: number): void {
  for (const dog of pane.renderer.debug.dogs()) dog.setSpin(radians);
  for (const human of pane.renderer.debug.humans()) human.setSpin(radians);
  pane.renderer.invalidate();
}

// ---------------------------------------------------------------------------
// DOM harness
// ---------------------------------------------------------------------------

export interface ReviewApi {
  panes: ReviewPane[];
  metrics(): { a: ReviewSubjectMetrics; b: ReviewSubjectMetrics; cam: ReviewCam; light: ReviewLight; pose: string };
  setCam(cam: ReviewCam): void;
  setLight(light: ReviewLight): void;
  setPose(pose: string): void;
  /** Turntable: both subjects rotate 360° in 6 s. */
  setTurn(on: boolean): void;
  /** Fixed spin for screenshots (degrees). */
  setSpin(degrees: number): void;
  /** Resolves once both renderers are ready and the GLB tier swap (if any) has had time to land. */
  ready(): Promise<void>;
  dispose(): void;
}

export interface MountReviewOptions {
  baseUrl: string;
  a: string;
  b: string;
  cam?: ReviewCam;
  light?: ReviewLight;
  pose?: string;
  turn?: boolean;
}

export function mountReview(container: HTMLElement, options: MountReviewOptions): ReviewApi {
  let cam: ReviewCam = options.cam ?? 'closeup_portrait';
  let light: ReviewLight = options.light ?? 'courtyard';
  let pose = options.pose ?? 'idle_relaxed';
  const { baseUrl } = options;
  container.classList.add('hero-review');
  Object.assign(container.style, { display: 'flex', gap: '8px', padding: '8px', alignItems: 'flex-start', background: '#DDD6C6' } as CSSStyleDeclaration);

  const panes = createReviewPanes([options.a, options.b], { baseUrl, cam, light, pose });
  const hosts: HTMLElement[] = [];
  const labels: HTMLElement[] = [];
  const mounted: Promise<unknown>[] = [];
  const CAM_ORDER: ReviewCam[] = [...REVIEW_CAMS];
  for (const pane of panes) {
    const column = document.createElement('div');
    const host = document.createElement('div');
    host.className = 'hero-review__pane';
    Object.assign(host.style, { position: 'relative', overflow: 'hidden', background: '#F4F0E8' } as CSSStyleDeclaration);
    const label = document.createElement('div');
    label.className = 'hero-review__label';
    Object.assign(label.style, { font: '12px/1.4 system-ui, sans-serif', color: '#243631', padding: '4px 0', whiteSpace: 'pre' } as CSSStyleDeclaration);
    column.append(host, label);
    container.appendChild(column);
    hosts.push(host);
    labels.push(label);
    mounted.push(pane.renderer.mount(host));
  }

  const sizePanes = (): void => {
    const preset = REVIEW_CAM_PRESETS[cam];
    for (const host of hosts) {
      host.style.width = `${preset.width}px`;
      host.style.height = `${preset.height}px`;
    }
  };
  const refreshLabels = (): void => {
    panes.forEach((pane, i) => {
      const m = reviewMetrics(pane);
      const share = m.heightShare === null ? '–' : `${(m.heightShare * 100).toFixed(1)} %`;
      const label = labels[i];
      if (label) label.textContent = `${m.label}  [${m.tier}]\n${m.triangles} tris · ${m.actorDrawCalls} model draw call(s) · ${(m.textureBytes / 1024 / 1024).toFixed(2)} MB tex\nshare ${share} · margin ${m.minMargin === null ? '–' : `${(m.minMargin * 100).toFixed(1)} %`} · cam ${cam} · ${light}`;
    });
  };
  const applyCamera = (): void => {
    for (const pane of panes) {
      // Settle the pose before measuring for the fixed cameras.
      for (let i = 0; i < 20; i++) pane.renderer.debug.step(1 / 30);
      applyReviewCamera(pane, cam);
    }
    refreshLabels();
  };
  sizePanes();
  // Fixed cameras need the subject measured after mount (the GLB may land later → re-apply on tier change).
  const camTimer = window.setInterval(() => {
    applyCamera();
  }, 1500);
  void Promise.all(mounted).then(() => applyCamera());

  // Turntable loop.
  let turning = Boolean(options.turn);
  let spin = 0;
  let last = 0;
  let raf = 0;
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    if (!turning) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    spin = (spin + (dt * Math.PI * 2) / 6) % (Math.PI * 2);
    for (const pane of panes) setPaneSpin(pane, spin);
  };
  raf = requestAnimationFrame(tick);

  const api: ReviewApi = {
    panes,
    metrics() {
      const [a, b] = panes as [ReviewPane, ReviewPane];
      return { a: reviewMetrics(a), b: reviewMetrics(b), cam, light, pose };
    },
    setCam(next) {
      if (!CAM_ORDER.includes(next)) return;
      cam = next;
      const preset = REVIEW_CAM_PRESETS[cam];
      for (const pane of panes) {
        pane.directive = { ...pane.directive, view: preset.view ?? 'closeup' };
      }
      sizePanes();
      applyCamera();
    },
    setLight(next) {
      light = next;
      for (const pane of panes) {
        pane.light = light;
        pane.renderer.debug.setLighting(light);
        applyReviewCamera(pane, cam);
      }
      refreshLabels();
    },
    setPose(next) {
      pose = next;
      // Same tick for both: identical start of the clip.
      for (const pane of panes) {
        if (pane.isDog) {
          pane.directive = { ...pane.directive, dogs: pane.directive.dogs.map((d) => ({ ...d, pose: next as PoseId })) };
          for (const dog of pane.renderer.debug.dogs()) void dog.play(next as PoseId, { restart: true });
        } else {
          pane.directive = { ...pane.directive, humans: pane.directive.humans.map((h) => ({ ...h, gesture: next as GestureId })) };
          for (const human of pane.renderer.debug.humans()) void human.play(next as GestureId, { restart: true });
        }
        pane.renderer.invalidate();
      }
      refreshLabels();
    },
    setTurn(on) {
      turning = on;
      last = 0;
    },
    setSpin(degrees) {
      turning = false;
      spin = (degrees * Math.PI) / 180;
      for (const pane of panes) setPaneSpin(pane, spin);
    },
    async ready() {
      await Promise.all(mounted);
      await new Promise((r) => setTimeout(r, 1200));
      applyCamera();
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.clearInterval(camTimer);
      for (const pane of panes) {
        pane.renderer.dispose();
        pane.assets?.dispose();
      }
      container.replaceChildren();
    },
  };
  // Expose the default azimuth constant for tooling that wants to compare with the live view.
  void CAMERA_AZIMUTH;
  return api;
}
