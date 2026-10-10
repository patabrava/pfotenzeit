/**
 * Minimal describe/it/expect used to run renderer.check.ts under plain Node when vitest cannot
 * start (its API token file is unreadable in the sandbox). Aliased in place of 'vitest' by
 * vite.check.config.ts. Same assertions, same messages; nothing else.
 */
type TestFn = () => void | Promise<void>;

interface Test {
  name: string;
  fn: TestFn;
}

const suites: Array<{ name: string; tests: Test[] }> = [];
let current: { name: string; tests: Test[] } | null = null;

export function describe(name: string, fn: () => void): void {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function it(name: string, fn: TestFn): void {
  if (!current) throw new Error('it() outside describe()');
  current.tests.push({ name, fn });
}

class AssertionError extends Error {}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function expect(actual: unknown, message = ''): Matchers {
  const prefix = message ? `${message}: ` : '';
  const fail = (text: string): never => {
    throw new AssertionError(`${prefix}${text}`);
  };
  const positive: Matchers = {
    toBe: (expected) => void (Object.is(actual, expected) || fail(`expected ${stringify(actual)} to be ${stringify(expected)}`)),
    toEqual: (expected) => void (deepEqual(actual, expected) || fail(`expected ${stringify(actual)} to equal ${stringify(expected)}`)),
    toBeNull: () => void (actual === null || fail(`expected ${stringify(actual)} to be null`)),
    toBeGreaterThan: (n) => void ((actual as number) > n || fail(`expected ${stringify(actual)} > ${n}`)),
    toBeLessThan: (n) => void ((actual as number) < n || fail(`expected ${stringify(actual)} < ${n}`)),
    toBeLessThanOrEqual: (n) => void ((actual as number) <= n || fail(`expected ${stringify(actual)} <= ${n}`)),
    toBeGreaterThanOrEqual: (n) => void ((actual as number) >= n || fail(`expected ${stringify(actual)} >= ${n}`)),
    get not() {
      return {
        toBe: (expected: unknown) => void (!Object.is(actual, expected) || fail(`expected ${stringify(actual)} not to be ${stringify(expected)}`)),
        toBeNull: () => void (actual !== null || fail('expected value not to be null')),
      };
    },
  };
  return positive;
}

export interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toBeGreaterThan(n: number): void;
  toBeLessThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  readonly not: { toBe(expected: unknown): void; toBeNull(): void };
}

export async function runAll(): Promise<number> {
  let passed = 0;
  let failed = 0;
  for (const suite of suites) {
    console.log(`\n${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test.fn();
        passed += 1;
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        failed += 1;
        console.log(`  ✗ ${test.name}\n    ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}
