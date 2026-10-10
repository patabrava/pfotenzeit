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
import { isRoute } from '../../app/routes';
import { content } from '../../content';
import type { PickResult, PresentOptions, RendererHandle, RendererMetrics, RendererStatus } from '../../render/types';
import { DISTANCE_BANDS } from '../../simulation/defaults';
import { evaluateExercise } from '../../simulation/exercise';
import { getSceneDirective } from '../../simulation/selectors';
import type { DistanceBand, DistractionLevel, ExerciseContext, ExerciseResponse, WorldActorKey, YardPoint } from '../../simulation/types';
import type { PracticeExercise } from '../../content/types';
import type { Store } from '../../state/store';
import type { WorldContext, WorldEvent, WorldInput, WorldState, Zone } from '../../world/types';
import type { WorldController } from '../context';
import { createTestProviders } from '../../simulation/fixtures';
import { createNewMeta, createNewSave } from '../../simulation/save';
import type { DomainEffect, Save, SceneDirective } from '../../simulation/types';
import { createStore } from '../../state/store';
import { createMemoryRepository } from '../../storage/memoryRepository';
import { mountUi } from '../index';

const params = new URLSearchParams(window.location.search);

/** Mirrors the optional WP-H hook so the smoke pass can see the anchor the shell publishes. */
type StubRenderer = RendererHandle & { setRewardAnchor(anchor: { x: number; y: number } | null): void };

function createStubRenderer(fail: boolean, pickSource: () => StubWorld | null): StubRenderer {
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
    setRewardAnchor(anchor) {
      (window as unknown as { __pzRewardAnchor?: { x: number; y: number } | null }).__pzRewardAnchor = anchor;
    },
    updateWorld() {},
    /** Linear map of the canvas rect to the yard rectangle (x −3.2…3.2, z −3…3); dog within 0.45 m wins, then zones. */
    pick(clientX, clientY): PickResult | null {
      const world = pickSource();
      const canvas = container?.querySelector('canvas');
      if (!world || !canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const point: YardPoint = { x: ((clientX - rect.left) / rect.width) * 6.4 - 3.2, z: ((clientY - rect.top) / rect.height) * 6 - 3 };
      const state = world.getState();
      if (!state) return null;
      const dog = state.actors.dog.position;
      if (Math.hypot(dog.x - point.x, dog.z - point.z) < 0.45) return { kind: 'actor', actor: 'dog', point: dog };
      const zone = state.layout.zones.find((z) => Math.hypot(z.center.x - point.x, z.center.z - point.z) <= z.radius);
      if (zone) return { kind: 'zone', zoneId: zone.id, point };
      return { kind: 'ground', point };
    },
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

// ---------------------------------------------------------------- stub world controller (WP-P shape)

type StubWorld = WorldController;

const STUB_ZONES: Zone[] = [
  { id: 'mira', center: { x: -1.0, z: -1.4 }, radius: 1.1 },
  { id: 'bowl', center: { x: 0.6, z: -1.5 }, radius: 0.9 },
  { id: 'rest_deck', center: { x: -2.3, z: -1.5 }, radius: 1.1 },
  { id: 'sniff_corner', center: { x: 2.3, z: -1.7 }, radius: 1.1, requiresUpgrade: 'sniff_corner' },
  { id: 'circle', center: { x: 0, z: 0.1 }, radius: 2.1 },
  { id: 'quiet_corner', center: { x: -2.4, z: 2.2 }, radius: 1.0 },
  { id: 'alex_bruno', center: { x: 2.4, z: 1.6 }, radius: 1.2 },
  { id: 'gate', center: { x: 0, z: 2.9 }, radius: 0.8 },
];

function band(distance: number): DistanceBand {
  return distance <= DISTANCE_BANDS.nearMax ? 'near' : distance <= DISTANCE_BANDS.midMax ? 'mid' : 'far';
}

/** Teleporting stand-in for src/app/world.ts: enough for the HUD, sheets and smoke checks. */
function createStubWorld(store: Store, available: boolean): StubWorld {
  const spawn: Record<WorldActorKey, YardPoint> = { handler: { x: 0, z: 1.2 }, dog: { x: 0.5, z: 1.4 }, other_dog: { x: 2.0, z: 1.9 }, mira: { x: -1.0, z: -1.3 }, alex: { x: 2.4, z: 1.4 } };
  const actor = (key: WorldActorKey) => ({ key, position: { ...spawn[key] }, facing: 0, speed: 0, path: [] as YardPoint[] });
  const state: WorldState = {
    seed: 1,
    time: 0,
    layout: {
      bounds: { min: { x: -3.2, z: -3 }, max: { x: 3.2, z: 3 } },
      zones: STUB_ZONES,
      obstacles: [],
      spawn,
      distractionSpots: { toy: { x: 0.8, z: 0.4 }, otherDog: { x: 2.0, z: 1.9 } },
      gridStep: 0.25,
    },
    actors: { handler: actor('handler'), dog: actor('dog'), other_dog: actor('other_dog'), mira: actor('mira'), alex: actor('alex') },
    dogMode: { kind: 'follow' },
    hold: false,
    moment: null,
    momentCooldownUntil: 0,
    exercise: null,
    distraction: 'none',
    othersPresent: true,
    rng: 1,
  };
  const eventListeners = new Set<(event: WorldEvent) => void>();
  const changeListeners = new Set<() => void>();
  let practice: { exercise: PracticeExercise; distraction: DistractionLevel; attempts: number; lastResponse: ExerciseResponse | null } | null = null;
  let responding = false;
  let lastAttempts = -1;
  const emit = (event: WorldEvent): void => eventListeners.forEach((listener) => listener(event));
  const changed = (): void => changeListeners.forEach((listener) => listener());

  const dist = (a: YardPoint, b: YardPoint): number => Math.hypot(a.x - b.x, a.z - b.z);
  const zoneAt = (point: YardPoint) => STUB_ZONES.find((zone) => dist(zone.center, point) <= zone.radius) ?? null;
  const context = (): WorldContext => {
    const handler = state.actors.handler.position;
    const dog = state.actors.dog.position;
    const other = state.actors.other_dog.position;
    const handlerBand = band(dist(handler, dog));
    const kind = state.exercise?.spec.kind ?? practice?.exercise.kind ?? null;
    const zone = zoneAt(handler);
    const upgrades = store.get().save.school.upgrades;
    return {
      dogHandlerDistance: dist(handler, dog),
      dogOtherDogDistance: dist(dog, other),
      handlerBand,
      otherDogBand: band(dist(dog, other)),
      dogZone: zoneAt(dog)?.id ?? null,
      handlerZone: zone?.id ?? null,
      prompt: zone && (!zone.requiresUpgrade || upgrades.includes(zone.requiresUpgrade)) ? zone.id : null,
      attention: 'relaxed',
      distraction: state.distraction,
      exerciseReady: kind !== null && !responding && (kind === 'recall' ? handlerBand === 'far' : true),
      handlerMoving: false,
      dogMoving: false,
    };
  };
  const exerciseContext = (): ExerciseContext => {
    const c = context();
    const dog = state.actors.dog.position;
    const spot = state.distraction === 'toy' ? state.layout.distractionSpots.toy : state.distraction === 'other_dog' ? state.layout.distractionSpots.otherDog : null;
    return {
      handlerBand: c.handlerBand,
      otherDogBand: c.otherDogBand,
      distraction: c.distraction,
      distractionBand: spot ? band(dist(dog, spot)) : 'far',
      dogZone: c.dogZone,
      handlerMoving: false,
    };
  };
  const pointForBand = (target: DistanceBand): YardPoint => {
    const dog = state.actors.dog.position;
    const distance = target === 'near' ? 0.8 : target === 'mid' ? 2.0 : 3.2;
    return { x: Math.max(-3.1, Math.min(3.1, dog.x - distance)), z: dog.z };
  };
  const showResponse = (response: ExerciseResponse): void => {
    responding = true;
    changed();
    window.setTimeout(() => {
      responding = false;
      emit({ type: 'responseShown', response });
      changed();
    }, 300);
  };
  // The controller watches the committed attempt and shows the response itself (ines-93's rule).
  store.subscribe((snapshot, change) => {
    if (change !== 'save') return;
    const visit = snapshot.save.currentVisit;
    const round = visit ? content.lessons[visit.lessonId].rounds.find(r => r.id === visit.queue[visit.index]?.roundId) : null;
    state.exercise = round?.exercise ? { spec: round.exercise, roundId: round.id, attempts: 0, responding: null, stillSince: null } : null;
    state.distraction = round?.exercise?.distraction ?? 'none';
    const count = visit?.attempts.length ?? 0;
    if (visit && visit.phase === 'exercise' && count !== lastAttempts) {
      lastAttempts = count;
      const last = visit.attempts[visit.attempts.length - 1];
      if (last) showResponse(last.response);
    }
    if (!visit) lastAttempts = -1;
  });

  const controller: StubWorld = {
    isAvailable: () => available,
    getState: () => (available ? state : null),
    getContext: () => (available ? context() : null),
    send(input: WorldInput) {
      const handler = state.actors.handler;
      switch (input.type) {
        case 'moveTo':
          handler.position = { ...input.target };
          emit({ type: 'arrived', actor: 'handler', position: handler.position });
          break;
        case 'moveDir':
          handler.position = { x: Math.max(-3.1, Math.min(3.1, handler.position.x + input.dx * 0.5)), z: Math.max(-2.9, Math.min(2.9, handler.position.z + input.dz * 0.5)) };
          break;
        case 'setBand':
          if (state.exercise?.spec.kind === 'find_spot') {
            const spot = state.distraction === 'toy' ? state.layout.distractionSpots.toy : state.actors.other_dog.position;
            const d = input.band === 'near' ? 0.7 : input.band === 'mid' ? 1.9 : 3.0;
            state.actors.dog.position = { x: spot.x - d, z: spot.z };
            handler.position = { ...state.actors.dog.position };
          } else handler.position = pointForBand(input.band);
          break;
        case 'teleport':
          state.actors[input.actor].position = { ...input.position };
          break;
        case 'setDistraction':
          state.distraction = input.level;
          break;
        case 'beginExercise':
          state.exercise = { spec: input.spec, roundId: input.roundId, attempts: 0, responding: null, stillSince: null };
          break;
        case 'endExercise':
          state.exercise = null;
          break;
        case 'showResponse':
          showResponse(input.response);
          break;
        case 'holdDog':
          state.dogMode = input.pose ? { kind: 'held', pose: input.pose } : { kind: 'follow' };
          break;
        case 'respondMoment':
          if (state.moment) state.moment = { ...state.moment, response: input.response };
          break;
        default:
          break;
      }
      emit({ type: 'promptChanged', prompt: context().prompt });
      changed();
    },
    exerciseContext: () => (available ? exerciseContext() : null),
    pointForBand: (target) => (available ? pointForBand(target) : null),
    directive() {
      if (!available) return null;
      const snapshot = store.get();
      const directive = getSceneDirective(snapshot.save, content, { route: snapshot.app.route, yardMode: snapshot.app.yardMode });
      if (directive.view !== 'yard') return null;
      const c = context();
      return {
        ...directive,
        world: {
          actors: [
            { key: 'handler', characterId: 'handler', position: state.actors.handler.position, facing: 0, speed: 0, pose: 'idle' },
            { key: 'dog', characterId: 'dog_nala', position: state.actors.dog.position, facing: 0, speed: 0, pose: 'idle_relaxed' },
            { key: 'other_dog', characterId: 'dog_bruno', position: state.actors.other_dog.position, facing: 0, speed: 0, pose: 'idle_relaxed' },
            { key: 'mira', characterId: 'human_mira', position: state.actors.mira.position, facing: 0, speed: 0, pose: 'idle' },
            { key: 'alex', characterId: 'human_alex', position: state.actors.alex.position, facing: 0, speed: 0, pose: 'idle' },
          ],
          focus: state.actors.handler.position,
          prompt: c.prompt ? { zoneId: c.prompt, position: STUB_ZONES.find((z) => z.id === c.prompt)!.center, radius: 1 } : null,
          momentSpot: null,
          distraction: state.distraction,
          attention: c.attention,
        },
      };
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    startPractice(exercise: PracticeExercise, distraction: DistractionLevel) {
      practice = { exercise, distraction, attempts: 0, lastResponse: null };
      state.distraction = distraction;
      state.exercise = { spec: exercise.spec, roundId: null, attempts: 0, responding: null, stillSince: null };
      changed();
    },
    stopPractice() {
      practice = null;
      state.exercise = null;
      state.distraction = 'none';
      changed();
    },
    getPractice: () => practice,
    practiceAgain() {
      if (practice) practice = { ...practice, lastResponse: null };
      changed();
    },
    practiceAttempt() {
      if (!practice || !context().exerciseReady) return null;
      const dog = store.get().save.dog;
      const response = evaluateExercise(practice.exercise.kind, exerciseContext(), dog);
      practice = { ...practice, attempts: practice.attempts + 1, lastResponse: response };
      showResponse(response);
      return response;
    },
  };
  return controller;
}

async function main(): Promise<void> {
  const providers = createTestProviders(Date.now());
  const mode = params.get('mode') === 'challenge' ? 'challenge' : 'standard';
  let save: Save = createNewSave(mode, providers, providers.nowUTC());
  if (params.get('observation') === 'optional') save = { ...save, settings: { ...save.settings, observationTextEnabled: false } };
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
  // Reload simulation: the visit is already closed and committed, its reward still waits for presentation
  // (what a reload right after COMPLETE_VISIT looks like). Combine with route=reflection.
  if (params.get('pending') === 'reward') {
    save = {
      ...save,
      completedLessonIds: ['L01'],
      school: { ...save.school, marks: save.school.marks + 1 },
      pendingPresentation: {
        transactionId: 'tx-reload-reward',
        effects: [{ type: 'visitRewarded', visitId: 'v-reload', lessonId: 'L01', closure: 'completed', visitMark: true, bond: false, newlyLearned: [], learningMarks: 0 }],
      },
    };
  }
  const routeParam = params.get('route');
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
      ...(isRoute(routeParam) ? { route: routeParam } : {}),
      ownership: params.get('other') === '1' ? 'other' : 'owner',
      storageError: params.get('storage') === '1' ? 'quota: Speicher voll (Demo)' : null,
      returnSummary: params.get('summary') === '1' ? 'Du warst kurz weg. Nala hat gewartet.' : null,
      ...(params.get('yardMode') === 'static' ? { yardMode: 'static' as const } : {}),
    },
  });
  // D-041: stub world (teleporting) unless world=0; window.__pzWorld mirrors WP-P's dev hook.
  const world = createStubWorld(store, params.get('world') !== '0');
  const renderer = createStubRenderer(params.get('renderer') === 'fail', () => (world.isAvailable() ? world : null));
  const handle = mountUi(store, {
    getRenderer: async () => renderer,
    appVersion: 'harness',
    back: () => false,
    world,
  });
  (window as unknown as { __pz: unknown; __pzWorld: unknown }).__pz = { store, handle, repository };
  (window as unknown as { __pzWorld: unknown }).__pzWorld = world;
}

void main();
