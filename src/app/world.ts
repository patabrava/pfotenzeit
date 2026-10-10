/**
 * World controller (D-041, WP-P): steps the pure world model with real-time deltas while the yard is
 * shown, applies UI inputs, feeds per-frame positions to the renderer (`updateWorld`) and keeps the
 * world in sync with the store (exercise rounds, retries, care holds, observation holds, practice).
 *
 * Division of labour (arbitrated 2026-10-10):
 * - The UI owns the single `renderer.apply()` path and calls `controller.directive() ?? getSceneDirective(...)`.
 *   The controller never calls `apply()`; it emits `onChange` when something structural changed.
 * - The controller dispatches nothing to the store. EXERCISE_ATTEMPT and RESPOND_MOMENT come from the UI
 *   (with `exerciseContext()`); the controller only mirrors committed state into the world.
 * - Practice attempts are evaluated here with the pure rules (`simulation/exercise.ts`) and shown; nothing
 *   is persisted (plan §7).
 */
import type { ContentCatalog, ExerciseSpec, PracticeExercise } from '../content/types';
import type { RendererHandle } from '../render/types';
import { evaluateExercise } from '../simulation/exercise';
import { getCurrentRound, getSceneDirective } from '../simulation/selectors';
import type { DistanceBand, DistractionLevel, DomainEffect, ExerciseContext, ExerciseResponse, SceneDirective, WorldDirective, YardPoint } from '../simulation/types';
import type { Store, StoreSnapshot } from '../state/store';
import { createWorldApi } from '../world';
import { zoneById } from '../world/layout';
import type { WorldApi, WorldContext, WorldEvent, WorldInput, WorldNeeds, WorldState } from '../world/types';

export interface WorldControllerOptions {
  store: Store;
  /** Defaults to store.content. */
  content?: ContentCatalog;
  /** Current renderer handle, or null while loading / failed. */
  renderer: () => RendererHandle | null;
  worldApi?: WorldApi;
  seed?: number;
  /** Test hooks: monotonic ms and a frame scheduler (defaults: performance.now / requestAnimationFrame). */
  now?: () => number;
  requestFrame?: (callback: () => void) => unknown;
  cancelFrame?: (handle: unknown) => void;
}

export interface PracticeState {
  exercise: PracticeExercise;
  distraction: DistractionLevel;
  attempts: number;
  lastResponse: ExerciseResponse | null;
}

export interface WorldController {
  /** The yard can be walked right now (yard mode and a ready renderer); false → UI falls back to zones / bands. */
  isAvailable(): boolean;
  getState(): WorldState | null;
  getContext(): WorldContext | null;
  /** Applies an input immediately (a dt 0 step): context, events, onChange and updateWorld follow synchronously. */
  send(input: WorldInput): void;
  /** What the UI records with EXERCISE_ATTEMPT. */
  exerciseContext(): ExerciseContext | null;
  pointForBand(band: DistanceBand): YardPoint | null;
  /** Scene directive with `world` attached while the scene is in yard view, else null. */
  directive(): SceneDirective | null;
  onEvent(listener: (event: WorldEvent) => void): () => void;
  /** Fires after a step that changed something structural (prompt, attention, moment, readiness, hold, view). */
  onChange(listener: () => void): () => void;
  /** Free practice (route 'practice'): nothing is dispatched to the store. */
  startPractice(exercise: PracticeExercise, distraction: DistractionLevel): void;
  stopPractice(): void;
  getPractice(): PracticeState | null;
  /** Evaluates and shows one practice attempt; null when no practice runs or the dog is still responding. */
  practiceAttempt(): ExerciseResponse | null;
  /** "Noch einmal": releases the dog for the next attempt. */
  practiceAgain(): void;
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

const YARD_ROUTES = new Set(['home', 'lesson', 'practice']);
/** Largest wall-clock gap fed into the world after a stall (frames are split to ≤ 100 ms inside). */
const MAX_FRAME_S = 0.5;
const EXERCISE_PHASES = new Set(['observe', 'exercise', 'decide']);

function careHoldPose(effect: Extract<DomainEffect, { type: 'care' }>): 'sit' | 'lie_down' | 'rest_loop' | 'eat' {
  if (effect.kind === 'meal' || effect.pose === 'eat') return 'eat';
  if (effect.pose === 'rest_loop' || effect.pose === 'rest_side') return 'rest_loop';
  if (effect.pose === 'lie_down') return 'lie_down';
  return 'sit';
}

function needsOf(snapshot: StoreSnapshot): WorldNeeds {
  const { energy, stress, arousal, comfort } = snapshot.save.dog;
  return { energy, stress, arousal, comfort };
}

export function createWorldController(options: WorldControllerOptions): WorldController {
  const { store } = options;
  const content = options.content ?? store.content;
  const api = options.worldApi ?? createWorldApi();
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const requestFrame =
    options.requestFrame ??
    ((cb: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => cb()) : setTimeout(cb, 16)));
  const cancelFrame =
    options.cancelFrame ??
    ((handle: unknown) => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle as number);
      else clearTimeout(handle as ReturnType<typeof setTimeout>);
    });

  let world: WorldState = api.create(options.seed ?? 1);
  let context: WorldContext = api.context(world, needsOf(store.get()));
  const queue: WorldInput[] = [];
  const eventListeners = new Set<(event: WorldEvent) => void>();
  const changeListeners = new Set<() => void>();
  let started = false;
  let running = false;
  let frame: unknown = null;
  let lastFrameMs: number | null = null;
  let unsubscribe: (() => void) | null = null;
  let structuralDirty = false;

  // store-sync bookkeeping
  let lessonKey: string | null = null;
  let shownAttemptId: string | null = null;
  let careHoldTx: string | null = null;
  let holdSent = false;
  let practice: PracticeState | null = null;

  function shouldRun(snapshot: StoreSnapshot): boolean {
    const { app, save } = snapshot;
    return YARD_ROUTES.has(app.route) && (app.yardMode === 'yard' || world.exercise?.responding != null) && app.pauseReasons.length === 0 && save.dog.status === 'alive';
  }

  function filterPrompt(snapshot: StoreSnapshot, prompt: WorldContext['prompt']): WorldContext['prompt'] {
    if (!prompt) return null;
    const zone = zoneById(world.layout, prompt);
    if (zone?.requiresUpgrade && !snapshot.save.school.upgrades.includes(zone.requiresUpgrade)) return null;
    return prompt;
  }

  function publicContext(snapshot: StoreSnapshot = store.get()): WorldContext {
    const prompt = filterPrompt(snapshot, context.prompt);
    return prompt === context.prompt ? context : { ...context, prompt };
  }

  function worldDirective(snapshot: StoreSnapshot): WorldDirective {
    const d = api.directive(world, needsOf(snapshot));
    if (d.prompt && filterPrompt(snapshot, d.prompt.zoneId as WorldContext['prompt']) === null) return { ...d, prompt: null };
    return d;
  }

  function emitChange(): void {
    for (const listener of changeListeners) {
      try {
        listener();
      } catch (error) {
        console.error('[world] change listener failed', error);
      }
    }
  }

  function step(dt: number): void {
    const snapshot = store.get();
    const inputs = queue.splice(0);
    for (const input of inputs) {
      if (input.type !== 'moveTo' && input.type !== 'moveDir' && input.type !== 'stop') structuralDirty = true;
    }
    const prevPrompt = publicContext(snapshot).prompt;
    const result = api.step(world, dt, inputs, needsOf(snapshot));
    world = result.world;
    context = result.context;
    for (const event of result.events) {
      for (const listener of eventListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('[world] event listener failed', error);
        }
      }
    }
    const renderer = options.renderer();
    if (renderer && renderer.updateWorld && renderer.getStatus() === 'ready') {
      try {
        renderer.updateWorld(worldDirective(snapshot));
      } catch (error) {
        console.warn('[world] updateWorld failed', error);
      }
    }
    const changed = structuralDirty || result.events.length > 0 || publicContext(snapshot).prompt !== prevPrompt;
    structuralDirty = false;
    if (changed) emitChange();
  }

  function onFrame(): void {
    frame = null;
    if (!started) return;
    const snapshot = store.get();
    const t = now();
    if (shouldRun(snapshot)) {
      running = true;
      const dt = lastFrameMs === null ? 0 : Math.min(MAX_FRAME_S, Math.max(0, (t - lastFrameMs) / 1000));
      lastFrameMs = t;
      step(dt);
    } else {
      running = false;
      lastFrameMs = null;
    }
    frame = requestFrame(onFrame);
  }

  // ---------------------------------------------------------------- store sync
  function syncLesson(snapshot: StoreSnapshot): boolean {
    const { save, app } = snapshot;
    const visit = save.currentVisit;
    const round = app.route === 'lesson' && visit ? getCurrentRound(save, content) : null;
    const spec: ExerciseSpec | undefined = round?.exercise;
    const active = Boolean(visit && round && spec && EXERCISE_PHASES.has(visit.phase));
    if (!active) {
      if (lessonKey) {
        lessonKey = null;
        shownAttemptId = null;
        queue.push({ type: 'endExercise' });
      }
      return false;
    }
    const key = `${visit!.id}:${round!.id}`;
    if (lessonKey !== key) {
      lessonKey = key;
      shownAttemptId = null;
      queue.push({ type: 'beginExercise', spec: spec!, roundId: round!.id });
    }
    if (visit!.phase === 'exercise') {
      const attempt = [...visit!.attempts].reverse().find((a) => a.roundId === round!.id);
      if (attempt && attempt.attemptId !== shownAttemptId) {
        shownAttemptId = attempt.attemptId;
        queue.push({ type: 'showResponse', response: attempt.response });
      }
    } else if (visit!.phase === 'observe' && shownAttemptId && world.exercise?.responding) {
      // retry: back to observe for another attempt
      queue.push({ type: 'holdDog', pose: null });
    }
    return true;
  }

  function syncCare(snapshot: StoreSnapshot, exerciseActive: boolean): void {
    const { save, app } = snapshot;
    const pending = save.pendingPresentation;
    const care = app.presenting && pending ? pending.effects.find((e): e is Extract<DomainEffect, { type: 'care' }> => e.type === 'care') : undefined;
    if (care && pending && !exerciseActive) {
      if (careHoldTx !== pending.transactionId) {
        careHoldTx = pending.transactionId;
        queue.push({ type: 'holdDog', pose: careHoldPose(care) });
      }
      return;
    }
    if (careHoldTx) {
      careHoldTx = null;
      if (!exerciseActive) queue.push({ type: 'holdDog', pose: null });
    }
  }

  function syncHold(snapshot: StoreSnapshot, exerciseActive: boolean): void {
    const base = getSceneDirective(snapshot.save, content, { route: snapshot.app.route, yardMode: snapshot.app.yardMode });
    const hold = base.hold && !exerciseActive;
    if (hold !== holdSent) {
      holdSent = hold;
      queue.push({ type: 'setHold', hold });
    }
  }

  function syncPractice(snapshot: StoreSnapshot): void {
    if (practice && snapshot.app.route !== 'practice') stopPractice();
  }

  function sync(snapshot: StoreSnapshot): void {
    const before = queue.length;
    const exerciseActive = syncLesson(snapshot) || practice !== null;
    syncCare(snapshot, exerciseActive);
    syncHold(snapshot, exerciseActive);
    syncPractice(snapshot);
    if (queue.length > before) step(0);
  }

  function stopPractice(): void {
    if (!practice) return;
    practice = null;
    queue.push({ type: 'endExercise' });
    step(0);
  }

  return {
    isAvailable() {
      const { app } = store.get();
      const renderer = options.renderer();
      return app.yardMode === 'yard' && renderer !== null && renderer.getStatus() === 'ready';
    },
    getState: () => world,
    getContext: () => publicContext(),
    send(input) {
      // A duplicate showResponse (the UI echoing an attempt the controller already fed) is ignored.
      if (input.type === 'showResponse' && world.exercise?.responding) return;
      queue.push(input);
      step(0);
    },
    exerciseContext: () => api.exerciseContext(world, needsOf(store.get())),
    pointForBand: (band) => api.pointForBand(world, band),
    directive() {
      const snapshot = store.get();
      const base = getSceneDirective(snapshot.save, content, { route: snapshot.app.route, yardMode: snapshot.app.yardMode });
      if (base.view !== 'yard') return null;
      return { ...base, world: worldDirective(snapshot) };
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => void eventListeners.delete(listener);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => void changeListeners.delete(listener);
    },
    startPractice(exercise, distraction) {
      practice = { exercise, distraction, attempts: 0, lastResponse: null };
      const spec: ExerciseSpec = { ...exercise.spec, distraction };
      queue.push({ type: 'beginExercise', spec, roundId: null });
      step(0);
    },
    stopPractice,
    getPractice: () => practice,
    practiceAttempt() {
      if (!practice || world.exercise?.responding) return null;
      const snapshot = store.get();
      const ctx = api.exerciseContext(world, needsOf(snapshot));
      const response = evaluateExercise(practice.exercise.spec.kind, ctx, snapshot.save.dog);
      practice = { ...practice, attempts: practice.attempts + 1, lastResponse: response };
      queue.push({ type: 'showResponse', response });
      step(0);
      return response;
    },
    practiceAgain() {
      if (!practice) return;
      practice = { ...practice, lastResponse: null };
      queue.push({ type: 'holdDog', pose: null });
      step(0);
    },
    start() {
      if (started) return;
      started = true;
      unsubscribe = store.subscribe((snapshot) => sync(snapshot));
      sync(store.get());
      frame = requestFrame(onFrame);
    },
    stop() {
      if (!started) return;
      started = false;
      running = false;
      lastFrameMs = null;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      unsubscribe?.();
      unsubscribe = null;
    },
    isRunning: () => running,
  };
}
