/**
 * Yard input (D-041, WP-R): pointer taps on the scene strip and desktop keys become WorldInputs.
 *
 * - Tap (pointer down + up within slop, ≤ 600 ms, no scroll) → renderer.pick(clientX, clientY) → callbacks.
 *   A drag over the strip is not a move. Pointer events are used for the gesture; no click synthesis
 *   is needed because the strip is not a button (assistive tech reaches every action through the HUD).
 * - Direction buttons use pointer capture to move while held, including two-finger diagonals.
 *   Release, cancellation, blur, hidden document, or disabling the pad clears held input.
 * - WASD / arrows → moveDir with a unit vector while held (key repeat ignored); release → moveDir of the
 *   remaining keys or stop. Escape → stop. Enter / Space → activate the prompt button, but only when
 *   focus is not already on an interactive element (then the element handles the key itself).
 * - Keys are ignored while a modal is open (focus trap active) or while typing in an input.
 * - Keyboard focus is never moved to the canvas; the strip has no tabindex.
 */
import type { PickResult } from '../render/types';
import { hasActiveTrap } from './actions';

export interface YardInputHandlers {
  /** Hit test from the renderer; null when the yard view is not active or nothing was hit. */
  pick(clientX: number, clientY: number): PickResult | null;
  onPick(result: PickResult): void;
  /** Unit direction in yard metres: +x right, +z toward the camera (screen down). */
  onMoveDir(dx: number, dz: number): void;
  onStop(): void;
  /** Enter / Space without a focused control: activate the contextual prompt. */
  onActivate(): void;
  /** Whether yard input is currently meaningful (yard active, no screen over the world). */
  isEnabled(): boolean;
}

export interface YardInputHandle {
  reset(): void;
  destroy(): void;
}

const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 600;

const KEY_VECTORS: Record<string, { dx: number; dz: number }> = {
  w: { dx: 0, dz: -1 },
  arrowup: { dx: 0, dz: -1 },
  s: { dx: 0, dz: 1 },
  arrowdown: { dx: 0, dz: 1 },
  a: { dx: -1, dz: 0 },
  arrowleft: { dx: -1, dz: 0 },
  d: { dx: 1, dz: 0 },
  arrowright: { dx: 1, dz: 0 },
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])') !== null;
}

export function bindYardInput(strip: HTMLElement, handlers: YardInputHandlers, controls?: HTMLElement): YardInputHandle {
  let pointer: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
  const held = new Set<string>();
  const touches = new Map<number, string>();
  const controlKeys = new Map<string, string>();

  function sendDirection(): void {
    let dx = 0;
    let dz = 0;
    const directions = new Set([...held, ...touches.values(), ...controlKeys.values()]);
    for (const button of controls?.querySelectorAll<HTMLElement>('[data-direction]') ?? []) {
      button.classList.toggle('is-pressed', directions.has(button.dataset.direction!));
    }
    for (const key of directions) {
      const vector = KEY_VECTORS[key];
      if (vector) {
        dx += vector.dx;
        dz += vector.dz;
      }
    }
    if (dx === 0 && dz === 0) {
      handlers.onStop();
      return;
    }
    const length = Math.hypot(dx, dz) || 1;
    handlers.onMoveDir(dx / length, dz / length);
  }

  function onControlDown(event: PointerEvent): void {
    if (!handlers.isEnabled() || hasActiveTrap() || event.button !== 0) return;
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-direction]');
    const key = button?.dataset.direction;
    if (!button || !key || !(key in KEY_VECTORS)) return;
    event.preventDefault();
    event.stopPropagation();
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, key);
    sendDirection();
  }
  function onControlUp(event: PointerEvent): void {
    if (!touches.has(event.pointerId)) return;
    event.stopPropagation();
    touches.delete(event.pointerId);
    sendDirection();
  }
  function reset(): void {
    pointer = null;
    const moving = held.size > 0 || touches.size > 0 || controlKeys.size > 0;
    held.clear();
    touches.clear();
    controlKeys.clear();
    for (const button of controls?.querySelectorAll('.is-pressed') ?? []) button.classList.remove('is-pressed');
    if (moving) handlers.onStop();
  }
  function onVisibility(): void {
    if (document.hidden) reset();
  }

  function onPointerDown(event: PointerEvent): void {
    if (!handlers.isEnabled() || !event.isPrimary) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), moved: false };
  }
  function onPointerMove(event: PointerEvent): void {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > TAP_SLOP_PX) pointer.moved = true;
  }
  function onPointerUp(event: PointerEvent): void {
    if (!pointer || event.pointerId !== pointer.id) return;
    const tap = !pointer.moved && performance.now() - pointer.t <= TAP_MAX_MS;
    pointer = null;
    if (!tap || !handlers.isEnabled()) return;
    const result = handlers.pick(event.clientX, event.clientY);
    if (result) handlers.onPick(result);
  }
  function onPointerCancel(event: PointerEvent): void {
    if (pointer && event.pointerId === pointer.id) pointer = null;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!handlers.isEnabled() || hasActiveTrap() || isTypingTarget(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    const control = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-direction]') : null;
    if ((key === 'enter' || key === ' ') && control && controls?.contains(control)) {
      event.preventDefault();
      if (!event.repeat) {
        controlKeys.set(key, control.dataset.direction!);
        sendDirection();
      }
      return;
    }
    if (key in KEY_VECTORS) {
      event.preventDefault();
      if (event.repeat || held.has(key)) return;
      held.add(key);
      sendDirection();
      return;
    }
    if (key === 'escape') {
      reset();
      handlers.onStop();
      return;
    }
    if ((key === 'enter' || key === ' ') && !isInteractive(event.target)) {
      event.preventDefault();
      handlers.onActivate();
    }
  }
  function onKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (controlKeys.delete(key)) {
      sendDirection();
      return;
    }
    if (!held.has(key)) return;
    held.delete(key);
    sendDirection();
  }
  function onBlur(): void {
    reset();
  }

  controls?.addEventListener('pointerdown', onControlDown);
  controls?.addEventListener('pointerup', onControlUp);
  controls?.addEventListener('pointercancel', onControlUp);
  controls?.addEventListener('lostpointercapture', onControlUp);
  document.addEventListener('visibilitychange', onVisibility);
  strip.addEventListener('pointerdown', onPointerDown);
  strip.addEventListener('pointermove', onPointerMove);
  strip.addEventListener('pointerup', onPointerUp);
  strip.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    reset,
    destroy() {
      reset();
      controls?.removeEventListener('pointerdown', onControlDown);
      controls?.removeEventListener('pointerup', onControlUp);
      controls?.removeEventListener('pointercancel', onControlUp);
      controls?.removeEventListener('lostpointercapture', onControlUp);
      document.removeEventListener('visibilitychange', onVisibility);
      strip.removeEventListener('pointerdown', onPointerDown);
      strip.removeEventListener('pointermove', onPointerMove);
      strip.removeEventListener('pointerup', onPointerUp);
      strip.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      held.clear();
    },
  };
}
