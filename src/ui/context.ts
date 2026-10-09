/**
 * Shared UI context passed to every view. Views never touch the Save directly for mutations:
 * everything goes through `ctx.store.act(...)`.
 */
import type { AudioManager } from '../audio/AudioManager';
import type { ContentCatalog } from '../content/types';
import type { Route } from '../app/appState';
import type { RendererHandle } from '../render/types';
import type { Store, StoreSnapshot } from '../state/store';
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
export interface UiDeps {
  /** Lazy; resolves null when no renderer module is available (→ text fallback). */
  getRenderer(): Promise<RendererHandle | null>;
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
  getPixelFactory(): PixelDogFactory;
  navigate(route: Route): void;
  goBack(): void;
  toast(text: string): void;
  announce(text: string): void;
  openCareSheet(): void;
  openLessonPicker(): void;
  openSchoolSheet(): void;
  exportSave(): Promise<void>;
  /** True when boot provides its own file picker (importData); the settings view then needs no file input. */
  hasImportPicker(): boolean;
  importSave(file?: File): Promise<void>;
}

export interface View {
  el: HTMLElement;
  update(snapshot: StoreSnapshot): void;
  destroy(): void;
}
