/**
 * Dev harness (not part of the game UI): mounts the renderer with on-screen buttons that cycle
 * through poses, gestures, views, environments, positions and present() effects, and shows the
 * metrics. Imported by the WP-C debug panel (`/?dev=scene`) or by src/render/dev/scene.html.
 */
import { POSE_IDS, type CameraView, type DomainEffect, type EnvironmentId, type GestureId, type PoseId, type SceneDirective, type StagePosition, type UpgradeId } from '../simulation/types';
import { createGameRenderer, type GameRendererHandle } from './app/GameRenderer';
import type { FramingReport } from './app/CameraRig';
import { createAssetManager, type AssetManager } from './loaders/AssetManager';
import type { AssetManifest } from './types';
import type { RendererMetrics } from './types';

const GESTURES: readonly GestureId[] = ['idle', 'greet', 'gesture_explain', 'offer_reward', 'kneel'];
const VIEWS: readonly CameraView[] = ['school', 'lesson', 'closeup'];
const ENVIRONMENTS: readonly EnvironmentId[] = ['courtyard', 'courtyard_loud', 'rest_place', 'sniff_corner'];
const POSITIONS: readonly StagePosition[] = ['center', 'left', 'right', 'rest', 'sniff', 'edge'];

export interface DevSceneApi {
  renderer: GameRendererHandle;
  directive(): SceneDirective;
  set(patch: Partial<SceneDirective>): void;
  pose(pose: PoseId): void;
  gesture(gesture: GestureId): void;
  present(effect: DomainEffect, maxDurationMs?: number): Promise<void>;
  metrics(): RendererMetrics;
  /** D-034 framing of the focus dog in the current camera. */
  framing(): FramingReport | null;
  /** Frames actually rendered; must not increase while inactive. */
  frames(): number;
  dispose(): void;
}

export interface DevSceneOptions {
  baseUrl?: string;
  controls?: boolean;
  /**
   * Manifest override (dev only, public/assets/manifest.json untouched): a URL to a manifest JSON
   * (relative asset urls resolve next to it, 'pending' entries are accepted), or 'candidates' for
   * the staged textured candidates in art/staging/blender-reference.
   */
  manifest?: string | AssetManifest;
}

/** Staged textured candidates (D-036 test input; art/staging, nothing copied into public/). */
export const STAGED_CANDIDATES_MANIFEST = 'art/staging/blender-reference/manifest.json';
/** Vendor dry run staged by ines-bc (WP-M part 3). */
export const VENDOR_DRYRUN_MANIFEST = 'art/staging/vendor-dryrun/staged/manifest.json';

function assetManagerFor(baseUrl: string, manifest: DevSceneOptions['manifest']): AssetManager | undefined {
  if (!manifest) return undefined;
  if (manifest === 'candidates') return createAssetManager({ baseUrl, manifestUrl: `${baseUrl}${STAGED_CANDIDATES_MANIFEST}`, acceptPending: true });
  if (manifest === 'vendor-dryrun') return createAssetManager({ baseUrl, manifestUrl: `${baseUrl}${VENDOR_DRYRUN_MANIFEST}`, acceptPending: true });
  if (typeof manifest === 'string') return createAssetManager({ baseUrl, manifestUrl: manifest, acceptPending: true });
  return createAssetManager({ baseUrl, fetchManifest: async () => manifest, acceptPending: true });
}

export function defaultDirective(): SceneDirective {
  return {
    view: 'lesson',
    environment: 'courtyard',
    upgrades: [],
    dogs: [{ id: 'dog_nala', name: 'Nala', growthStage: 'arriving', pose: 'idle_relaxed', position: 'center', facing: 20 }],
    humans: [{ id: 'human_mira', gesture: 'idle', position: 'left', facing: -40 }],
    props: ['water'],
    focusDogId: 'dog_nala',
    hold: false,
  };
}

export function mountDevScene(container: HTMLElement, options: DevSceneOptions = {}): DevSceneApi {
  const baseUrl = options.baseUrl ?? (import.meta.env.BASE_URL as string);
  const showControls = options.controls ?? true;
  container.classList.add('dev-scene');
  const sceneHost = document.createElement('div');
  sceneHost.className = 'dev-scene__viewport';
  Object.assign(sceneHost.style, { position: 'absolute', inset: '0', overflow: 'hidden' } as CSSStyleDeclaration);
  container.appendChild(sceneHost);

  const panel = document.createElement('div');
  panel.className = 'dev-scene__panel';
  Object.assign(panel.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '0',
    maxHeight: '45%',
    overflow: 'auto',
    background: 'rgba(36, 54, 49, 0.88)',
    color: '#F4F0E8',
    font: '12px/1.4 system-ui, sans-serif',
    padding: '6px 8px',
    display: showControls ? 'block' : 'none',
  } as CSSStyleDeclaration);
  container.appendChild(panel);

  const renderer = createGameRenderer({ baseUrl, qualityTier: 'auto', reducedMotion: false, assets: assetManagerFor(baseUrl, options.manifest) });
  let directive = defaultDirective();

  const metricsBox = document.createElement('pre');
  metricsBox.style.margin = '0 0 6px';
  metricsBox.style.whiteSpace = 'pre-wrap';
  panel.appendChild(metricsBox);

  const apply = (): void => {
    renderer.apply(directive);
    refreshMetrics();
  };

  const refreshMetrics = (): void => {
    const m = renderer.getMetrics();
    metricsBox.textContent =
      `status=${renderer.getStatus()} view=${directive.view} env=${directive.environment} hold=${directive.hold} ` +
      `pose=${directive.dogs[0]?.pose ?? '-'} gesture=${directive.humans[0]?.gesture ?? '-'}\n` +
      `drawCalls=${m.drawCalls} triangles=${m.triangles} fps=${m.fpsEstimate} dpr=${m.dpr} tex=${(m.textureBytesEstimate / 1024).toFixed(0)}kB ` +
      `tiers=${JSON.stringify(m.assetTiers)}\n` +
      framingLine();
  };
  const framingLine = (): string => {
    const f = renderer.debug.framingReport();
    const req = renderer.debug.framingRequest();
    if (!f) return 'framing=–';
    return `framing ${f.view}: height=${(f.heightShare * 100).toFixed(1)}% width=${(f.widthShare * 100).toFixed(1)}% margin=${(f.minMargin * 100).toFixed(1)}% centreY=${f.centreY.toFixed(2)} azimuth=${f.azimuthDeg.toFixed(0)}° nose-offset=${f.noseOffsetDeg.toFixed(0)}° samples=${req?.points.length ?? 0}`;
  };

  const row = (label: string): HTMLDivElement => {
    const div = document.createElement('div');
    div.style.marginBottom = '4px';
    const span = document.createElement('span');
    span.textContent = `${label}: `;
    span.style.opacity = '0.7';
    div.appendChild(span);
    panel.appendChild(div);
    return div;
  };
  const button = (parent: HTMLElement, label: string, onClick: () => void): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, { margin: '1px 2px', padding: '3px 6px', font: 'inherit', borderRadius: '8px', border: '1px solid #AFC6AE', background: '#326B58', color: '#F4F0E8' } as CSSStyleDeclaration);
    b.addEventListener('click', () => {
      onClick();
      refreshMetrics();
    });
    parent.appendChild(b);
  };

  const api: DevSceneApi = {
    renderer,
    directive: () => directive,
    set(patch) {
      directive = { ...directive, ...patch };
      apply();
    },
    pose(pose) {
      directive = { ...directive, dogs: directive.dogs.map((d) => ({ ...d, pose })) };
      apply();
    },
    gesture(gesture) {
      directive = { ...directive, humans: directive.humans.map((h) => ({ ...h, gesture })) };
      apply();
    },
    present(effect, maxDurationMs = 6000) {
      return renderer.present(effect, { maxDurationMs, reducedMotion: false }).then(refreshMetrics);
    },
    metrics: () => renderer.getMetrics(),
    framing: () => renderer.debug.framingReport(),
    frames: () => renderer.debug.frameCount(),
    dispose() {
      renderer.dispose();
      container.replaceChildren();
    },
  };

  if (showControls) {
    const poses = row('pose');
    for (const pose of POSE_IDS) button(poses, pose, () => api.pose(pose));
    const gestures = row('gesture');
    for (const g of GESTURES) button(gestures, g, () => api.gesture(g));
    const views = row('view');
    for (const v of VIEWS) button(views, v, () => api.set({ view: v }));
    const envs = row('environment');
    for (const e of ENVIRONMENTS) button(envs, e, () => api.set({ environment: e }));
    const positions = row('nala position');
    for (const p of POSITIONS) button(positions, p, () => api.set({ dogs: directive.dogs.map((d, i) => (i === 0 ? { ...d, position: p } : d)) }));
    const cast = row('cast');
    button(cast, 'nala only', () => api.set({ dogs: [defaultDirective().dogs[0]!], humans: [] }));
    button(cast, '+ mira', () => api.set({ humans: [{ id: 'human_mira', gesture: 'idle', position: 'left', facing: -40 }] }));
    button(cast, '+ bruno & alex', () =>
      api.set({
        dogs: [...directive.dogs.filter((d) => d.id !== 'dog_bruno'), { id: 'dog_bruno', name: 'Bruno', growthStage: 'arriving', pose: 'idle_relaxed', position: 'right', facing: -25 }],
        humans: [...directive.humans.filter((h) => h.id !== 'human_alex'), { id: 'human_alex', gesture: 'idle', position: 'edge', facing: -120 }],
      }),
    );
    button(cast, 'growing', () => api.set({ dogs: directive.dogs.map((d) => (d.id === 'dog_nala' ? { ...d, growthStage: 'growing' } : d)) }));
    button(cast, 'arriving', () => api.set({ dogs: directive.dogs.map((d) => (d.id === 'dog_nala' ? { ...d, growthStage: 'arriving' } : d)) }));
    const misc = row('misc');
    button(misc, `hold`, () => api.set({ hold: !directive.hold }));
    const upgrade = (id: UpgradeId): void => api.set({ upgrades: directive.upgrades.includes(id) ? directive.upgrades.filter((u) => u !== id) : [...directive.upgrades, id] });
    button(misc, 'rest_place', () => upgrade('rest_place'));
    button(misc, 'sniff_corner', () => upgrade('sniff_corner'));
    button(misc, 'props all', () => api.set({ props: ['bowl', 'water', 'blanket', 'ball', 'toy_rolling', 'leaf'] }));
    button(misc, 'active off', () => renderer.setActive(false));
    button(misc, 'active on', () => renderer.setActive(true));
    button(misc, 'reduced motion', () => renderer.setReducedMotion(true));
    button(misc, 'quality low', () => renderer.setQuality('low'));
    button(misc, 'quality high', () => renderer.setQuality('high'));
    const effects = row('present');
    const needs = { satiety: 50, energy: 50, comfort: 50, arousal: 30, stress: 20, vitality: 100 };
    button(effects, 'care meal', () => void api.present({ type: 'care', kind: 'meal', before: needs, after: needs, pose: 'eat' }));
    button(effects, 'care rest', () => void api.present({ type: 'care', kind: 'rest', before: needs, after: needs, pose: 'rest_loop' }));
    button(effects, 'care play', () => void api.present({ type: 'care', kind: 'play', before: needs, after: needs, pose: 'play_bow' }));
    button(effects, 'care calm', () => void api.present({ type: 'care', kind: 'calm', before: needs, after: needs, pose: 'recover' }));
    button(effects, 'decision', () => void api.present({ type: 'decision', roundId: 'r', optionId: 'o', helpful: true, supported: false, poseAfter: 'look_at_handler', dogId: 'dog_nala' }));
    button(effects, 'reward', () => void api.present({ type: 'visitRewarded', visitId: 'v', lessonId: 'L01', closure: 'completed', visitMark: true, bond: true, newlyLearned: [], learningMarks: 0 }));
    button(effects, 'growth', () => void api.present({ type: 'growth', from: 'arriving', to: 'growing' }));
  }

  void renderer.mount(sceneHost).then(() => {
    apply();
    refreshMetrics();
  });
  const metricsTimer = setInterval(refreshMetrics, 1000);
  const originalDispose = api.dispose;
  api.dispose = () => {
    clearInterval(metricsTimer);
    originalDispose();
  };
  return api;
}
