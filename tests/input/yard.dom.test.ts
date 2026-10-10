// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { bindYardInput, type YardInputHandle } from '../../src/input/yard';

let input: YardInputHandle;
afterEach(() => { input?.destroy(); document.body.replaceChildren(); });
function setup() {
  const strip = document.createElement('div');
  const controls = document.createElement('div');
  strip.append(controls);
  document.body.append(strip);
  const buttons = ['arrowup', 'arrowright'].map(direction => {
    const button = document.createElement('button');
    button.dataset.direction = direction;
    button.setPointerCapture = vi.fn();
    controls.append(button);
    return button;
  });
  const handlers = {
    isEnabled: () => true, pick: vi.fn(() => null), onPick: vi.fn(),
    onMoveDir: vi.fn(), onStop: vi.fn(), onActivate: vi.fn(),
  };
  input = bindYardInput(strip, handlers, controls);
  return { buttons, handlers };
}
function pointer(button: HTMLButtonElement, type: string, id: number) {
  button.dispatchEvent(new PointerEvent(type, { pointerId: id, button: 0, isPrimary: id === 1, bubbles: true, cancelable: true }));
}
it('combines two touch holds into a unit diagonal, keeps the remaining direction, and never picks ground', () => {
  const { buttons: [up, right], handlers } = setup();
  pointer(up!, 'pointerdown', 1);
  pointer(right!, 'pointerdown', 2);
  const diagonal = handlers.onMoveDir.mock.calls.at(-1)!;
  expect(diagonal[0]).toBeCloseTo(Math.SQRT1_2);
  expect(diagonal[1]).toBeCloseTo(-Math.SQRT1_2);
  pointer(up!, 'pointerup', 1);
  expect(handlers.onMoveDir).toHaveBeenLastCalledWith(1, 0);
  pointer(right!, 'pointerup', 2);
  expect(handlers.onStop).toHaveBeenCalledOnce();
  expect(handlers.pick).not.toHaveBeenCalled();
});
it.each(['pointercancel', 'lostpointercapture'])('%s releases a touch direction', type => {
  const { buttons: [up], handlers } = setup();
  pointer(up!, 'pointerdown', 1);
  pointer(up!, type, 1);
  expect(handlers.onStop).toHaveBeenCalledOnce();
  expect(up!.classList.contains('is-pressed')).toBe(false);
});
it('clears touches on blur and does not restart on a later release', () => {
  const { buttons: [up], handlers } = setup();
  pointer(up!, 'pointerdown', 1);
  window.dispatchEvent(new Event('blur'));
  pointer(up!, 'pointerup', 1);
  expect(handlers.onStop).toHaveBeenCalledOnce();
  expect(handlers.onMoveDir).toHaveBeenCalledOnce();
});
it('supports holding a focused arrow with Space and stopping on reset', () => {
  const { buttons: [up], handlers } = setup();
  up!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  expect(handlers.onMoveDir).toHaveBeenLastCalledWith(0, -1);
  expect(handlers.onActivate).not.toHaveBeenCalled();
  document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
  expect(handlers.onStop).toHaveBeenCalledOnce();
  pointer(up!, 'pointerdown', 1);
  input.reset();
  expect(up!.classList.contains('is-pressed')).toBe(false);
  expect(handlers.onStop).toHaveBeenCalledTimes(2);
});
