/**
 * Dev-only UI harness (not part of the production build; served by Vite at /src/ui/dev/harness.html).
 * Real store + real reducer on an in-memory repository, a stub renderer so the presenter path can be
 * exercised without WebGL, and query flags for scenarios:
 *   ?renderer=fail        → WebGL fallback path
 *   ?mode=challenge       → challenge save
 *   ?band=impaired|critical|lost
 *   ?needs=low            → hungry/tired dog (readiness needs care)
 *   ?marks=5              → school marks
 *   ?growth=1             → growth available
 *   ?other=1              → other-tab screen
 *   ?storage=1            → storage error banner
 *   ?summary=1            → interruption banner
 */
import { content } from '../../content';
import type { PresentOptions, RendererHandle, RendererMetrics, RendererStatus } from '../../render/types';
import { createTestProviders } from '../../simulation/fixtures';
import { createNewMeta, createNewSave } from '../../simulation/save';
import type { DomainEffect, Save, SceneDirective } from '../../simulation/types';
import { createStore } from '../../state/store';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { mountUi } from '../index';

const params = new URLSearchParams(window.location.search);

function createStubRenderer(fail: boolean): RendererHandle {
  let status: RendererStatus = 'idle';
  const listeners = new Set<(status: RendererStatus) => void>();
  let container: HTMLElement | null = null;
  let label: HTMLElement | null = null;
  const setStatus = (next: RendererStatus): void => {
    status = next;
    for (const listener of listeners) listener(next);
  };
  return {
    async mount(target) {
      container = target;
      if (fail) {
        setStatus('failed');
        return status;
      }
      const canvas = document.createElement('canvas');
      canvas.style.background = 'linear-gradient(#cfe0cd, #e9e3d6 60%, #d9cfb8)';
      label = document.createElement('div');
      Object.assign(label.style, { position: 'absolute', left: '8px', bottom: '8px', font: '12px monospace', color: '#4f605a', pointerEvents: 'none' });
      container.append(canvas, label);
      setStatus('ready');
      return status;
    },
    apply(directive: SceneDirective) {
      if (label) label.textContent = `scene: ${directive.view} / ${directive.environment} / ${directive.dogs.map((d) => `${d.id}:${d.pose}`).join(', ')}`;
    },
    present(effect: DomainEffect, options: PresentOptions) {
      if (label) label.textContent = `present: ${effect.type}`;
      return new Promise<void>((resolve) => window.setTimeout(resolve, options.reducedMotion ? 150 : Math.min(options.maxDurationMs, 1200)));
    },
    setActive() {},
    setReducedMotion() {},
    setQuality() {},
    invalidate() {},
    getStatus: () => status,
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getMetrics(): RendererMetrics {
      return { drawCalls: 0, triangles: 0, fpsEstimate: 0, dpr: 1, textureBytesEstimate: 0, assetTiers: {} };
    },
    dispose() {},
  };
}

async function main(): Promise<void> {
  const providers = createTestProviders(Date.now());
  const mode = params.get('mode') === 'challenge' ? 'challenge' : 'standard';
  let save: Save = createNewSave(mode, providers, providers.nowUTC());
  const band = params.get('band');
  if (band === 'impaired') save = { ...save, dog: { ...save.dog, vitality: 50 } };
  if (band === 'critical') save = { ...save, dog: { ...save.dog, vitality: 20, satiety: 0 } };
  if (band === 'lost') save = { ...save, dog: { ...save.dog, vitality: 0, status: 'lost' }, lostAtUTC: providers.nowUTC() };
  if (params.get('needs') === 'low') save = { ...save, dog: { ...save.dog, satiety: 20, energy: 30 } };
  if (params.has('marks')) save = { ...save, school: { ...save.school, marks: Number(params.get('marks')) || 0 } };
  if (params.get('growth') === '1') {
    save = {
      ...save,
      completedLessonIds: ['L01', 'L02', 'L03'],
      helpfulVisitIds: ['v1', 'v2', 'v3'],
      careClosureVisitIds: ['v3'],
    };
  }
  const meta = createNewMeta(save.saveId);
  if (mode === 'challenge') meta.activeMode = 'challenge';
  if (mode === 'challenge') meta.saveIds = { standard: 'standard-stub', challenge: save.saveId };
  const standard = createNewSave('standard', providers, providers.nowUTC());
  if (mode === 'challenge') meta.saveIds.standard = standard.saveId;
  const repository = createMemoryRepository({ meta, saves: mode === 'challenge' ? [save, standard] : [save] });
  const store = createStore({
    repository,
    providers,
    content,
    save,
    meta,
    app: {
      ownership: params.get('other') === '1' ? 'other' : 'owner',
      storageError: params.get('storage') === '1' ? 'quota: Speicher voll (Demo)' : null,
      returnSummary: params.get('summary') === '1' ? 'Du warst kurz weg. Nala hat gewartet.' : null,
    },
  });
  const renderer = createStubRenderer(params.get('renderer') === 'fail');
  const handle = mountUi(store, {
    getRenderer: async () => renderer,
    appVersion: 'harness',
    back: () => false,
  });
  (window as unknown as { __pz: unknown }).__pz = { store, handle, repository };
}

void main();
