/** A browser preference, independent of the player's saved game. */
const KEY = 'pfotenzeit:movement-help-dismissed';
export const MOVEMENT_HELP_CHANGED = 'pfotenzeit:movement-help-changed';
let dismissedWithoutStorage = false;

export function movementHelpDismissed(): boolean {
  try { return dismissedWithoutStorage || localStorage.getItem(KEY) === '1'; }
  catch { return dismissedWithoutStorage; }
}

export function dismissMovementHelp(): void {
  if (movementHelpDismissed()) return;
  dismissedWithoutStorage = true;
  try { localStorage.setItem(KEY, '1'); } catch { /* Private/restricted storage still works for this session. */ }
  window.dispatchEvent(new Event(MOVEMENT_HELP_CHANGED));
}
