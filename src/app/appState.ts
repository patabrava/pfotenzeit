/**
 * Transient application state (never persisted). Owned by the store, patched by ui/app/lifecycle.
 */
import type { OwnershipState } from '../storage/types';
import type { RendererStatus } from '../render/types';

/** 'practice' = free practice in the yard (D-041). */
export type Route = 'home' | 'profile' | 'lesson' | 'school' | 'settings' | 'reflection' | 'memorial' | 'mode' | 'practice';
export type ProfileTab = 'care' | 'memories' | 'learned';
export type PauseReason = 'hidden' | 'blur' | 'otherTab' | 'storageError' | 'contextLost' | 'user' | 'update';

export interface AppState {
  route: Route;
  previousRoute: Route;
  profileTab: ProfileTab;
  /** Simulation paused for any of the listed reasons. */
  pauseReasons: PauseReason[];
  ownership: OwnershipState;
  storageError: string | null;
  rendererStatus: RendererStatus;
  /** An effect animation is being shown; game inputs are locked until it resolves. */
  presenting: boolean;
  observationTextOpen: boolean;
  hintOpen: boolean;
  everydayOpen: boolean;
  toast: { id: number; text: string } | null;
  /** Short summary shown after an interruption (05 Unterbrechungen). */
  returnSummary: string | null;
  /** Effective reduced motion (system preference combined with the save setting). */
  reducedMotion: boolean;
  online: boolean;
  /** Dev-only debug panel visibility. */
  debugOpen: boolean;
  /** D-041: 'yard' = free movement on home/practice; 'static' = classic staged school (WebGL failed or user choice). */
  yardMode: 'yard' | 'static';
  /** D-041: the dog-tap sheet / moment sheet is open. */
  dogSheetOpen: boolean;
}

export const INITIAL_APP_STATE: AppState = {
  route: 'home',
  previousRoute: 'home',
  profileTab: 'care',
  pauseReasons: [],
  ownership: 'pending',
  storageError: null,
  rendererStatus: 'idle',
  presenting: false,
  observationTextOpen: false,
  hintOpen: false,
  everydayOpen: false,
  toast: null,
  returnSummary: null,
  reducedMotion: false,
  online: true,
  debugOpen: false,
  yardMode: 'yard',
  dogSheetOpen: false,
};

/** Routes in which active care time accumulates (04 Zeitmodell). Profile counts only while presenting a care effect. */
export function isActiveRoute(app: AppState): boolean {
  if (app.pauseReasons.length > 0) return false;
  if (app.route === 'home' || app.route === 'lesson' || app.route === 'practice') return true;
  if (app.route === 'profile' && app.presenting) return true;
  return false;
}
