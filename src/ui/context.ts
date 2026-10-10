/**
 * Shared UI context passed to every view. Views never touch the Save directly for mutations:
 * everything goes through `ctx.store.act(...)`.
 */
import type { AudioManager } from '../audio/AudioManager';
import type { ContentCatalog } from '../content/types';
import type { Route } from '../app/appState';
import type { RendererHandle } from '../render/types';
import type { Store, StoreSnapshot } from '../state/store';
import type { DistanceBand, DistractionLevel, ExerciseContext, ExerciseResponse, SceneDirective, YardPoint } from '../simulation/types';
import type { PracticeExercise } from '../content/types';
import type { WorldContext, WorldEvent, WorldInput, WorldState } from '../world/types';
import type { Presenter } from './presenter';
import type { PixelDogFactory } from './pixelBridge';

export interface ImportOutcome {
  ok: boolean;
  message: string;
}

/**
 * Dependencies from boot (WP-C). `getRenderer` is required; everything else is optional so the UI
 * also mounts in the dev harness. Both the brief's names (`onExport`/`onImport`) and boot's names
 * (`exportData`/`importData`) are accepted.
 */
/**
 * D-041 yard controller (WP-P, src/app/world.ts) as the UI sees it. The world is transient and pure;
 * the UI only sends WorldInputs, reads the derived context and dispatches EXERCISE_ATTEMPT /
 * RESPOND_MOMENT to the store itself. Absent or unavailable → every yard feature falls back to text,
 * zone list and distance bands.
 */
export interface WorldController {
  /** World exists and the yard can be walked (false → zone list / band fallback). */
  isAvailable(): boolean;
  getState(): WorldState | null;
  getContext(): WorldContext | null;
  send(input: WorldInput): void;
  /** Context recorded with an attempt (EXERCISE_ATTEMPT.context). */
  exerciseContext(): ExerciseContext | null;
  /** Spot that puts the handler at the given band from the dog (fallback UI). */
  pointForBand(band: DistanceBand): YardPoint | null;
  /** Full directive (view 'yard' + world) while the yard is active, else null → classic staged directive. */
  directive(): SceneDirective | null;
  onEvent(listener: (event: WorldEvent) => void): () => void;
  /** After every structural change (prompt, moment, distraction, view, hold, exerciseReady, response finished). */
  onChange(listener: () => void): () => void;
  /** Free practice (route 'practice'): runs the exercise in the world only; nothing is dispatched to the store. */
  startPractice(exercise: PracticeExercise, distraction: DistractionLevel): void;
  stopPractice(): void;
  getPractice(): { exercise: PracticeExercise; distraction: DistractionLevel; attempts: number; lastResponse: ExerciseResponse | null } | null;
  /** Evaluates the attempt (simulation/exercise.ts, no dispatch) and shows the response; null when not ready / still responding. */
  practiceAttempt(): ExerciseResponse | null;
  /** Releases the dog for the next attempt ("Noch einmal"); attempts keep counting for the hint. */
  practiceAgain(): void;
}

export interface UiDeps {
  /** Lazy; resolves null when no renderer module is available (→ text fallback). */
  getRenderer(): Promise<RendererHandle | null>;
  /** D-041 yard controller; optional so the UI also mounts without the world (classic staged school). */
  world?: WorldController;
  appVersion?: string;
  exportData?(): Promise<void>;
  /** Picks a file itself, validates, backs up, replaces and reloads on success. Never throws. */
  importData?(): Promise<ImportOutcome>;
  onExport?(): Promise<void>;
  onImport?(file: File): Promise<void>;
  /** Browser-back semantics (router). */
  back?(): boolean;
  /** Apply a waiting service-worker update (shown when pauseReasons includes 'update'). */
  applyUpdate?(): void;
}

export interface UiContext {
  store: Store;
  content: ContentCatalog;
  audio: AudioManager;
  deps: UiDeps;
  appVersion: string;
  presenter: Presenter;
  /** Host element for sheets and dialogs (modal layer). */
  modalHost: HTMLElement;
  getRenderer(): RendererHandle | null;
  /** D-041 yard controller or null (no world → static mode). */
  world: WorldController | null;
  getPixelFactory(): PixelDogFactory;
  navigate(route: Route): void;
  goBack(): void;
  toast(text: string): void;
  announce(text: string): void;
  openCareSheet(): void;
  openLessonPicker(): void;
  openSchoolSheet(): void;
  /** D-041: dog-tap sheet (attention line, pet/play/sit, moment responses). */
  openDogSheet(): void;
  /** D-041: pick exercise + distraction, then route 'practice'. */
  openPracticeSheet(): void;
  exportSave(): Promise<void>;
  /** True when boot provides its own file picker (importData); the settings view then needs no file input. */
  hasImportPicker(): boolean;
  importSave(file?: File): Promise<void>;
  /** visitIds whose reward the reflection view has already shown as rows; the shell dialog skips them (shown exactly once). */
  rewardShown: Set<string>;
}

export interface View {
  el: HTMLElement;
  update(snapshot: StoreSnapshot): void;
  destroy(): void;
  /** True while the view shows a transient state (e.g. reward summary) that the shell must not redirect away from. */
  holdsRoute?(): boolean;
}
