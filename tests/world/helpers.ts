import type { ExerciseSpec } from '../../src/content/types';
import type { DistanceBand } from '../../src/simulation/types';
import { createWorldApi } from '../../src/world';
import type { StepResult, WorldEvent, WorldInput, WorldNeeds, WorldState } from '../../src/world/types';

export const api = createWorldApi();

export const CALM: WorldNeeds = { energy: 80, stress: 20, arousal: 30, comfort: 70 };

export function spec(kind: ExerciseSpec['kind'], distraction: ExerciseSpec['distraction'] = 'none', minDistanceM?: number): ExerciseSpec {
  return {
    kind,
    distraction,
    ...(minDistanceM !== undefined ? { minDistanceM } : {}),
    instruction: 'Geh ein Stück weg und ruf sie.',
    readyLabel: 'Rufen',
    notReadyHint: 'Geh noch ein Stück weiter weg.',
    responseText: {},
    fallbackBands: { near: 'nah', mid: 'mittel', far: 'weit' },
  };
}

/** Runs `seconds` of world time in 50 ms steps; inputs are applied in the first step. Collects events. */
export function run(world: WorldState, seconds: number, inputs: WorldInput[] = [], needs: WorldNeeds = CALM, stepS = 0.05): StepResult & { all: WorldEvent[] } {
  const all: WorldEvent[] = [];
  let state = world;
  let result = api.step(state, 0, inputs, needs);
  all.push(...result.events);
  state = result.world;
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(stepS, remaining);
    result = api.step(state, dt, [], needs);
    all.push(...result.events);
    state = result.world;
    remaining -= dt;
  }
  return { ...result, all };
}

export function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export const BANDS: DistanceBand[] = ['near', 'mid', 'far'];
