/**
 * Idempotent transaction bookkeeping (15 Transaktionen) and the shared step result used by reducer sub-steps.
 * Pure. No DOM, no Three, no timers.
 */
import { TRANSACTION_HISTORY_LIMIT } from './defaults';
import type { DomainEffect, RejectReason, Save } from './types';

/** Result of one validated reducer sub-step (lesson machine, progression, care clock wrappers). */
export type StepResult =
  | { ok: true; save: Save; effects: DomainEffect[] }
  | { ok: false; reason: RejectReason };

export function ok(save: Save, effects: DomainEffect[] = []): StepResult {
  return { ok: true, save, effects };
}

export function fail(reason: RejectReason): StepResult {
  return { ok: false, reason };
}

export function isValidTransactionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function hasApplied(save: Save, transactionId: string): boolean {
  return save.appliedTransactionIds.includes(transactionId);
}

/** Appends the id to the bounded history (oldest ids drop first). Returns a new save. */
export function recordTransaction(save: Save, transactionId: string): Save {
  const ids = [...save.appliedTransactionIds, transactionId];
  while (ids.length > TRANSACTION_HISTORY_LIMIT) ids.shift();
  return { ...save, appliedTransactionIds: ids };
}

/** Effects the UI has to present before the next game input (care, decision, reward, purchase, growth, loss). */
export function isPresentableEffect(effect: DomainEffect): boolean {
  switch (effect.type) {
    case 'care':
    case 'decision':
    case 'visitRewarded':
    case 'upgradeBought':
    case 'growth':
    case 'lost':
      return true;
    default:
      return false;
  }
}
