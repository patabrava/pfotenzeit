/**
 * WebGL availability and context-loss handling. The DOM stays usable on every failure:
 * the renderer reports 'failed' / 'contextLost' through its status and the UI shows the text
 * alternative (09: "bei WebGL-Ausfall textbasierte Lern-/Profilansicht statt leerem Canvas").
 */
import { WebGLRenderer } from 'three';

export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

export interface CreateRendererResult {
  renderer: WebGLRenderer | null;
  error: string | null;
}

export function tryCreateWebGLRenderer(canvas: HTMLCanvasElement, antialias: boolean): CreateRendererResult {
  try {
    const renderer = new WebGLRenderer({
      canvas,
      antialias,
      alpha: false,
      powerPreference: 'low-power',
      stencil: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });
    return { renderer, error: null };
  } catch (error) {
    return { renderer: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface ContextLossHandlers {
  onLost(): void;
  onRestored(): void;
}

/** Registers context-loss listeners; returns an unsubscribe function. */
export function watchContextLoss(canvas: HTMLCanvasElement, handlers: ContextLossHandlers): () => void {
  const lost = (event: Event): void => {
    event.preventDefault();
    handlers.onLost();
  };
  const restored = (): void => handlers.onRestored();
  canvas.addEventListener('webglcontextlost', lost, false);
  canvas.addEventListener('webglcontextrestored', restored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost, false);
    canvas.removeEventListener('webglcontextrestored', restored, false);
  };
}
