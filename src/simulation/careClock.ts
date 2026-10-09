/**
 * Care time model (04, 15): active minute ticks, offline accounting, vitality dynamics, care actions.
 * Pure functions; the reducer calls these. No DOM, no Three, no Date.now.
 */
import {
  ACTIVE_DECLINE_PER_MINUTE,
  CARE_EFFECTS,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  OFFLINE_DECLINE_PER_HOUR,
  OFFLINE_FLOOR,
  OFFLINE_MAX_CREDITED_HOURS,
  OFFLINE_MIN_ELAPSED_MS,
  STANDARD_FLOOR,
  VITALITY_LOSS_PER_MINUTE,
  VITALITY_REGEN_PER_MINUTE,
  VITALITY_REGEN_THRESHOLD,
} from './defaults';
import { getVitalityBand } from './selectors';
import type { CareKind, DogState, DomainEffect, Mode, NeedValues, PoseId, Save } from './types';

export interface ClockResult {
  save: Save;
  effects: DomainEffect[];
}

export const NEED_KEYS: readonly (keyof NeedValues)[] = ['satiety', 'energy', 'comfort', 'arousal', 'stress', 'vitality'];

/** Pose shown while a care action is presented (04 Pflege). */
export const CARE_POSES: Record<CareKind, PoseId> = {
  meal: 'eat',
  rest: 'rest_loop',
  play: 'play_bow',
  calm: 'recover',
};

export function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Decline that never heals: a value already below the floor stays where it is,
 * a value above the floor is never pushed below it. after = max(min(before, floor), before − loss).
 */
export function declineWithFloor(before: number, loss: number, floor: number): number {
  return Math.max(Math.min(before, floor), before - loss);
}

/** Fractional offline loss for one need value. after = max(min(before, 25), before − loss). */
export function offlineAfter(before: number, loss: number): number {
  return declineWithFloor(before, loss, OFFLINE_FLOOR);
}

/** Mode floor for active decline and round cost: standard clamps at 25, challenge at 0. */
export function modeFloor(mode: Mode): number {
  return mode === 'standard' ? STANDARD_FLOOR : 0;
}

export function pickNeeds(dog: NeedValues): NeedValues {
  return {
    satiety: dog.satiety,
    energy: dog.energy,
    comfort: dog.comfort,
    arousal: dog.arousal,
    stress: dog.stress,
    vitality: dog.vitality,
  };
}

/** Applies CARE_EFFECTS[kind] to the real dog, clamped 0–100. Shared by CARE and lesson options with careEffect. */
export function applyCareKind(dog: DogState, kind: CareKind): DogState {
  const delta = CARE_EFFECTS[kind];
  const next: DogState = { ...dog };
  for (const key of NEED_KEYS) {
    const change = delta[key];
    if (change !== undefined) next[key] = clamp100(dog[key] + change);
  }
  return next;
}

/** One logical active minute in the order from 15 (decline → vitality → clamp). Status is resolved by the caller. */
export function tickMinute(dog: DogState, mode: Mode): DogState {
  const floor = modeFloor(mode);
  const satiety = clamp100(declineWithFloor(dog.satiety, ACTIVE_DECLINE_PER_MINUTE.satiety, floor));
  const energy = clamp100(declineWithFloor(dog.energy, ACTIVE_DECLINE_PER_MINUTE.energy, floor));
  const comfort = clamp100(declineWithFloor(dog.comfort, ACTIVE_DECLINE_PER_MINUTE.comfort, floor));
  let vitality = dog.vitality;
  if (mode === 'challenge') {
    if (satiety <= 0 || energy <= 0) {
      vitality -= VITALITY_LOSS_PER_MINUTE;
    } else if (satiety >= VITALITY_REGEN_THRESHOLD && energy >= VITALITY_REGEN_THRESHOLD) {
      vitality += VITALITY_REGEN_PER_MINUTE;
    }
  }
  return { ...dog, satiety, energy, comfort, vitality: clamp100(vitality) };
}

/** True while an atomic reaction is being shown; the loss transition waits until the phase leaves react (D-009). */
export function isLossDeferred(save: Save): boolean {
  return save.currentVisit?.phase === 'react';
}

/**
 * Turns a challenge dog with vitality 0 into `lost` unless the loss is deferred. Idempotent.
 * `nowUTC` becomes `lostAtUTC`.
 */
export function resolveLoss(save: Save, nowUTC: number): ClockResult {
  if (save.mode !== 'challenge' || save.dog.status !== 'alive' || save.dog.vitality > 0 || isLossDeferred(save)) {
    return { save, effects: [] };
  }
  return {
    save: { ...save, dog: { ...save.dog, status: 'lost' }, lostAtUTC: nowUTC },
    effects: [{ type: 'lost' }],
  };
}

/**
 * Adds activeMs to the remainder and applies one logical tick per full minute.
 * Ignored (no change) for a lost dog or a paused challenge. Emits `band` on a band change and `lost` on loss.
 * `nowUTC` is only used as `lostAtUTC`; it defaults to the save's anchor.
 */
export function applyActiveTime(save: Save, activeMs: number, nowUTC: number = save.lastSeenUTC): ClockResult {
  if (!Number.isFinite(activeMs) || activeMs <= 0) return { save, effects: [] };
  if (save.dog.status === 'lost' || save.challengePaused) return { save, effects: [] };

  const total = save.careActiveMsRemainder + activeMs;
  const minutes = Math.floor(total / MS_PER_MINUTE);
  const remainder = total - minutes * MS_PER_MINUTE;
  if (minutes === 0) {
    return { save: { ...save, careActiveMsRemainder: remainder }, effects: [] };
  }

  const bandBefore = getVitalityBand(save.dog, save.mode);
  let dog = save.dog;
  for (let minute = 0; minute < minutes; minute += 1) {
    dog = tickMinute(dog, save.mode);
    if (save.mode === 'challenge' && dog.vitality <= 0 && !isLossDeferred(save)) break;
  }
  const ticked: Save = { ...save, dog, careActiveMsRemainder: remainder };
  const resolved = resolveLoss(ticked, nowUTC);
  const effects: DomainEffect[] = [];
  const bandAfter = getVitalityBand(resolved.save.dog, save.mode);
  if (bandAfter !== bandBefore) effects.push({ type: 'band', band: bandAfter });
  effects.push(...resolved.effects);
  return { save: resolved.save, effects };
}

/**
 * Applies the offline formula once and re-anchors lastSeenUTC in the same result.
 * Standard, paused challenge, lost dog or elapsed < OFFLINE_MIN_ELAPSED_MS: only the anchor moves.
 * Challenge: credited hours capped at 8, satiety −2/h and comfort −1/h through offlineAfter; energy and vitality untouched.
 */
export function applyOffline(save: Save, nowUTC: number): ClockResult {
  const anchored: Save = { ...save, lastSeenUTC: nowUTC };
  const elapsed = Math.max(0, nowUTC - save.lastSeenUTC);
  if (elapsed < OFFLINE_MIN_ELAPSED_MS) return { save: anchored, effects: [] };
  if (save.mode !== 'challenge' || save.challengePaused || save.dog.status !== 'alive') {
    return { save: anchored, effects: [] };
  }
  const creditedHours = Math.min(elapsed, OFFLINE_MAX_CREDITED_HOURS * MS_PER_HOUR) / MS_PER_HOUR;
  const satiety = offlineAfter(save.dog.satiety, creditedHours * OFFLINE_DECLINE_PER_HOUR.satiety);
  const comfort = offlineAfter(save.dog.comfort, creditedHours * OFFLINE_DECLINE_PER_HOUR.comfort);
  const losses: Partial<NeedValues> = {
    satiety: save.dog.satiety - satiety,
    comfort: save.dog.comfort - comfort,
  };
  return {
    save: { ...anchored, dog: { ...save.dog, satiety, comfort } },
    effects: [{ type: 'offlineApplied', creditedHours, losses }],
  };
}
