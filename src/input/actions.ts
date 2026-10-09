/**
 * Input → action binding (05 Layout und Eingabe, 09 input/).
 *
 * Model: Pointer Events track the gesture; one gesture fires at most one action.
 *  - pointerdown starts tracking (pressed visual state), movement beyond the slop or `pointercancel`
 *    discards the gesture and suppresses the click the browser might still synthesise;
 *  - the action itself fires on `click`, which also covers keyboard (Enter/Space) and assistive
 *    technology activations that never produce pointer events;
 *  - clicks within SHEET_CLOSE_GUARD_MS after a sheet/dialog closed are ignored (no click-through);
 *  - while an async handler is pending the element is locked (fast double taps cannot double an action).
 *
 * Nothing in here mutates domain state: handlers receive the event and dispatch through the store.
 */

export const SHEET_CLOSE_GUARD_MS = 300;
const MOVE_SLOP_PX = 14;
const SUPPRESS_CLICK_MS = 500;

let lastSheetClosedAt = Number.NEGATIVE_INFINITY;

/** Called by sheet/dialog components right when they close. */
export function markSheetClosed(now: number = performance.now()): void {
  lastSheetClosedAt = now;
}

export function isWithinSheetCloseGuard(now: number = performance.now()): boolean {
  return now - lastSheetClosedAt < SHEET_CLOSE_GUARD_MS;
}

export interface BindActionOptions {
  /** Return false to ignore the activation (e.g. aria-disabled explanation). */
  canActivate?: () => boolean;
  /** Called with a locked (aria-disabled) activation so the UI can explain the no-op. */
  onBlocked?: () => void;
  /** Keep the element unlocked during the handler (default: lock until the promise settles). */
  noLock?: boolean;
}

export type ActionHandler = (event: Event) => void | Promise<void>;

/**
 * Binds an activation handler to an element. Returns an unbind function.
 */
export function bindAction(element: HTMLElement, handler: ActionHandler, options: BindActionOptions = {}): () => void {
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let suppressClickUntil = Number.NEGATIVE_INFINITY;
  let locked = false;

  const isDisabled = (): boolean =>
    element.getAttribute('aria-disabled') === 'true' || (element as HTMLButtonElement).disabled === true;

  const endGesture = (): void => {
    activePointerId = null;
    element.classList.remove('is-pressed');
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary) return;
    if (event.button !== undefined && event.button !== 0) return;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    if (!isDisabled()) element.classList.add('is-pressed');
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (dx * dx + dy * dy > MOVE_SLOP_PX * MOVE_SLOP_PX) {
      // The finger is scrolling or dragging: discard the gesture.
      suppressClickUntil = performance.now() + SUPPRESS_CLICK_MS;
      endGesture();
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    endGesture();
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    suppressClickUntil = performance.now() + SUPPRESS_CLICK_MS;
    endGesture();
  };

  const onClick = (event: MouseEvent): void => {
    const now = performance.now();
    if (now < suppressClickUntil) {
      event.preventDefault();
      return;
    }
    if (isWithinSheetCloseGuard(now)) {
      event.preventDefault();
      return;
    }
    if (isDisabled()) {
      event.preventDefault();
      options.onBlocked?.();
      return;
    }
    if (options.canActivate && !options.canActivate()) {
      event.preventDefault();
      return;
    }
    if (locked) {
      event.preventDefault();
      return;
    }
    const result = handler(event);
    if (result && typeof (result as Promise<void>).then === 'function' && !options.noLock) {
      locked = true;
      (result as Promise<void>).then(
        () => {
          locked = false;
        },
        () => {
          locked = false;
        },
      );
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Native buttons handle Enter/Space themselves. Non-button hosts get the same keys.
    if (element.tagName === 'BUTTON' || element.tagName === 'A' || element.tagName === 'INPUT') return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      element.click();
    }
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('pointerleave', onPointerUp);
  element.addEventListener('click', onClick);
  element.addEventListener('keydown', onKeyDown);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('pointerleave', onPointerUp);
    element.removeEventListener('click', onClick);
    element.removeEventListener('keydown', onKeyDown);
    endGesture();
  };
}

/**
 * Stops pointer/touch/wheel events inside a scrolling region from reaching the world (3D) container.
 * The world container never receives these events because the region is on top; this additionally
 * marks the region so an ancestor delegate can ignore it (belt and braces).
 */
export function isolateScrollRegion(element: HTMLElement): void {
  element.dataset.scrollRegion = 'true';
  const stop = (event: Event): void => {
    event.stopPropagation();
  };
  element.addEventListener('wheel', stop, { passive: true });
  element.addEventListener('touchmove', stop, { passive: true });
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.offsetParent !== null,
  );
}

export interface FocusTrapHandle {
  release(): void;
}

/**
 * Traps Tab focus inside `container`, calls `onEscape` on Escape, restores focus on release.
 */
const trapStack: object[] = [];

/** True when at least one focus trap (sheet/dialog) is active. */
export function hasActiveTrap(): boolean {
  return trapStack.length > 0;
}

export function trapFocus(container: HTMLElement, onEscape: () => void, initial?: HTMLElement | null): FocusTrapHandle {
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const token = {};
  trapStack.push(token);
  const isTop = (): boolean => trapStack[trapStack.length - 1] === token;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isTop()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusable(container);
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !container.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const onFocusIn = (event: FocusEvent): void => {
    if (!isTop()) return;
    if (event.target instanceof Node && !container.contains(event.target)) {
      const focusable = getFocusable(container);
      (focusable[0] ?? container).focus();
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocusIn);

  const target = initial ?? getFocusable(container)[0] ?? container;
  // Defer so the element is laid out before focusing (sheets animate in).
  requestAnimationFrame(() => target.focus({ preventScroll: true }));

  return {
    release() {
      const index = trapStack.indexOf(token);
      if (index >= 0) trapStack.splice(index, 1);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    },
  };
}
