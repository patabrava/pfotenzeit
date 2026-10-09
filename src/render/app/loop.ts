/**
 * Demand-rendering loop (14 C): invalidate() schedules at most one requestAnimationFrame; frames
 * continue only while the step callback reports running animations. Inactive → no rAF at all.
 * Visual dt is clamped to 0.1 s; care time is accumulated elsewhere from real active time.
 */
export interface LoopHooks {
  /** Advance animations by dt seconds and render once. Return true to keep rendering. */
  frame(dt: number, now: number): boolean;
}

export interface Loop {
  invalidate(): void;
  setActive(active: boolean): void;
  isActive(): boolean;
  /** True while a frame is scheduled. */
  isPending(): boolean;
  dispose(): void;
}

export interface LoopTimers {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

const MAX_DT = 0.1;

const defaultTimers: LoopTimers = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

export function createLoop(hooks: LoopHooks, timers: LoopTimers = defaultTimers): Loop {
  let active = true;
  let handle: number | null = null;
  let lastTime: number | null = null;
  let disposed = false;

  const tick = (time: number): void => {
    handle = null;
    if (!active || disposed) return;
    const dt = lastTime === null ? 0 : Math.min(MAX_DT, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    const more = hooks.frame(dt, time);
    if (more && active && !disposed) schedule();
    else lastTime = null;
  };

  const schedule = (): void => {
    if (handle !== null || !active || disposed) return;
    handle = timers.request(tick);
  };

  return {
    invalidate() {
      schedule();
    },
    setActive(next) {
      if (active === next) return;
      active = next;
      if (!active) {
        if (handle !== null) timers.cancel(handle);
        handle = null;
        lastTime = null;
      } else {
        schedule();
      }
    },
    isActive() {
      return active;
    },
    isPending() {
      return handle !== null;
    },
    dispose() {
      disposed = true;
      if (handle !== null) timers.cancel(handle);
      handle = null;
    },
  };
}
