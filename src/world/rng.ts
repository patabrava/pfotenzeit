/**
 * Deterministic RNG for the world model (mulberry32). The state is a 32-bit integer stored in
 * WorldState.rng; every draw returns the next state so stepping stays pure.
 */

export function seedRng(seed: number): number {
  return (seed >>> 0) || 0x9e3779b9;
}

/** Returns [value in [0, 1), nextState]. */
export function nextRandom(state: number): [number, number] {
  let a = (state + 0x6d2b79f5) >>> 0;
  const next = a;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  const value = ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}
