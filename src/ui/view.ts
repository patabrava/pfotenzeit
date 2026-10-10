/**
 * View helper: re-render only when the derived key changes; preserve focus and scroll across renders.
 */
import type { StoreSnapshot } from '../state/store';
import { captureRenderMemo, replaceChildren, restoreRenderMemo } from './components';
import type { View } from './context';

export interface ViewSpec {
  root: HTMLElement;
  /** Anything JSON-serialisable; a change triggers a re-render. */
  derive(snapshot: StoreSnapshot): unknown;
  render(snapshot: StoreSnapshot): Array<Node | string | null | undefined | false>;
  /** Called after each render with the fresh root. */
  afterRender?(snapshot: StoreSnapshot): void;
  destroy?(): void;
  holdsRoute?(): boolean;
}

export function createView(spec: ViewSpec): View {
  let lastKey: string | null = null;
  return {
    el: spec.root,
    update(snapshot) {
      const key = JSON.stringify(spec.derive(snapshot));
      if (key === lastKey) return;
      lastKey = key;
      const memo = captureRenderMemo(spec.root);
      replaceChildren(spec.root, spec.render(snapshot));
      restoreRenderMemo(spec.root, memo);
      spec.afterRender?.(snapshot);
    },
    destroy() {
      spec.destroy?.();
      spec.root.remove();
    },
    holdsRoute: spec.holdsRoute ? () => spec.holdsRoute!() : undefined,
  };
}
