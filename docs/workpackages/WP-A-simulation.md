# WP-A — Simulation core and rule tests (session: ines-bc)

Read first: `/CLAUDE.md`, `docs/DECISIONS.md`, `docs/pfotenzeit/02_SPIELSCHLEIFE.md`, `04_PFLEGE_CHALLENGE.md`, `15_DATEN_REGELN.md`, `03_LERNPLAN_QUELLEN.md` (Effekte section), `11_QA_ABNAHME.md`, `17_EXECUTION_CHECKLIST.md`.

## Mission

Implement the pure domain: reducer, care clock, lesson machine, progression, transactions, save validation. Then prove every product invariant with Vitest. No DOM, no Three, no `Date.now`, no timers.

## You own (write only here)

- `src/simulation/reducer.ts` — `reduce(save, action, content): ReduceResult`
- `src/simulation/careClock.ts` — `applyActiveTime`, `applyOffline`, `offlineAfter`, vitality dynamics
- `src/simulation/lessons.ts` — visit creation, option selection, round advance, supported retry, inserted variant
- `src/simulation/progression.ts` — visit rewards, bond memory, learning criterion, upgrades, growth
- `src/simulation/transactions.ts` — idempotency helpers
- `src/simulation/save.ts` — `validateSave`, `validateMeta` (strict; `createNewSave` is final, keep it)
- `src/simulation/selectors.ts` — already implemented; refine if a rule requires it, keep signatures
- `tests/simulation/**/*.test.ts`

Read-only for you: `src/simulation/types.ts`, `defaults.ts`, `src/content/**` (the real content from WP-B lands later; test against your own fixtures built from `src/content/types.ts`, plus the current stub `src/content/index.ts`).

## Reducer contract

```
reduce(save, action, content) → { save, outcome: 'applied'|'duplicate'|'rejected', reason?, effects }
```
1. Validate: phase, mode, costs, dog status, known ids. Rejections return the input save unchanged with `reason`.
2. If `action.transactionId` is in `save.appliedTransactionIds` → `outcome:'duplicate'`, save unchanged, no effects.
3. Compute the effect once; record the transaction id (bounded by `TRANSACTION_HISTORY_LIMIT`); set `lastSeenUTC = action.nowUTC` on every applied action; put presentation-relevant effects into `save.pendingPresentation = { transactionId, effects }` (care, decision, visitRewarded, upgradeBought, growth, lost). `ACKNOWLEDGE_EFFECT{presentedTransactionId}` clears it only if the id matches; it is itself transactional.
4. Never mutate the input. Return new objects.
5. The store adds `revision`; you do not touch it.

### Actions
- `START_VISIT{lessonId, visitId, seed}`: rejected if `currentVisit` exists (`visit_in_progress`), dog lost (`dog_lost`), training locked (`training_locked`), real readiness needs care (`needs_care`), challenge paused (`challenge_paused`), unknown lesson. Creates `VisitState` with `queue` = planned rounds (supported:false, inserted:false), `index 0`, `phase 'prepare'`, `context` = `CONTEXT_BASELINE` merged with round 0 `contextBefore`, `visitCount+1`.
- `NEXT_ROUND`: `prepare → observe`; `feedback → observe` of the next queue item (or `→ reflect` when the queue is exhausted, see inserted variant below); `observe → decide` is a UI step that also goes through `NEXT_ROUND` (phase advance only). From `reflect` it is rejected (use COMPLETE_VISIT). Entering a round applies `contextBefore` on top of the current context (energyShown resets to null unless set).
- `SELECT_OPTION{optionId}`: only in `decide`. Records the `VisitDecision` (`countsForLearning = option.helpful && option.countsForLearning && !ref.supported`), applies `contextAfter`, applies `careEffect` through the shared care constants on the real dog (clamped 0–100), sets `lastOptionId`, `phase 'react'`, emits `decision` effect. If `option.next === 'supportedRetry'` and the current ref is not already supported → insert `{roundId, supported:true, inserted:false}` right after the current index. If `option.next === 'careClosure'` → phase `'reflect'` immediately with a flag so COMPLETE_VISIT accepts `careClosure` (store it in the decision; selectors can derive). On a helpful unsupported decision add `scenarioId` to `helpfulScenariosByLearningPoint[lesson.learningPointId]` if `countsForLearning` (dedupe).
- `ACKNOWLEDGE_EFFECT` while in `react` → phase `'feedback'` (the renderer finished or fell back). Reload with phase `react` and a pending presentation: UI re-presents from `pendingPresentation`; nothing is recomputed.
- Leaving `feedback` via NEXT_ROUND: push `roundId` to `completedRoundIds` and apply `ROUND_ENERGY_COST` **only if** the ref was unsupported and the id is not already listed; standard mode floors energy at 25. Then advance `index`. When `index` reaches `queue.length`: if `!insertedRetryUsed` and the visit used a supported retry and the learning point is not learned, append one `{roundId: firstFailedRoundId, supported:false, inserted:true}` and set `insertedRetryUsed`; otherwise phase `'reflect'`.
- `COMPLETE_VISIT{closure}`: only in `reflect` (or `observe`/`decide`/`feedback` for a meaningful care closure, see D-006). Rewards once per visitId: `marks += 1` (`rewardedVisitIds`), lesson id into `completedLessonIds` (dedupe), `helpfulVisitIds`/bond memory (`memory_<visitId>`, `BondMemory` entry, `dog.bondMemories`) if ≥ 1 helpful decision, `careClosureVisitIds` for careClosure, learning: for each learning point newly reaching `LEARNED_SCENARIO_COUNT` and not in `rewardedLearningIds` → `marks += 1`, `dog.learnedPoints` push, `firstHelpfulByLearningPoint[point] = visitId`. Context returns to baseline; `currentVisit = null`; emit `visitRewarded`.
- `ABANDON_VISIT`: drops the visit, no reward, no penalty, no energy refund.
- `CARE{kind}`: always allowed while alive (also when training is locked, also during a visit in any phase except `react`). Apply `CARE_EFFECTS[kind]`, clamp 0–100, emit `care` effect with before/after and a pose (`eat`, `rest_loop`, `play_bow`, `recover`). Food is unlimited; satiety caps at 100. Rejected only if dog lost.
- `BUY_UPGRADE{upgradeId}`: rejected `insufficient_marks` (explained no-op), `already_owned`. Costs from `UPGRADE_COSTS`.
- `CONFIRM_GROWTH`: only when `isGrowthAvailable(save)` and no visit in progress → `growthStage 'growing'`, `growthConfirmed true`, learned points untouched.
- `RENAME_DOG{name}`: trimmed, 1–`DOG_NAME_MAX_LENGTH` chars, else `invalid_name`.
- `PAUSE_CHALLENGE` / `RESUME_CHALLENGE`: challenge only; resume re-anchors `lastSeenUTC` without loss.
- `CLOSE_APP`: re-anchors `lastSeenUTC` only.
- `APPLY_OFFLINE`: see care clock.
- `TICK_ACTIVE{activeMs}`: see care clock. Ignored (applied, no effect) while challenge paused or dog lost.
- `UPDATE_SETTINGS{patch}`: validate enum values; unknown keys ignored.

### Care clock (15 Tickreihenfolge)
`applyActiveTime(save, activeMs)`: add to `careActiveMsRemainder`, consume full minutes. Per minute: (1) decline satiety 2, energy 1, comfort 1; standard floors all three at 25; (2) challenge: if satiety == 0 or energy == 0 → vitality −5 (once, not doubled); else if both ≥ 35 → vitality +2; else unchanged; (3) clamp 0–100; (4) challenge: vitality 0 → `dog.status 'lost'`, `lostAtUTC`, emit `lost` — unless the current visit phase is `react` (defer; resolve on the next action that leaves react). Emit a `band` effect when the vitality band changes. Standard: vitality never changes.

`applyOffline(save, nowUTC)`: `elapsed = max(0, nowUTC − lastSeenUTC)`; if elapsed < `OFFLINE_MIN_ELAPSED_MS` → only re-anchor. Standard or `challengePaused` → only re-anchor. Challenge: `creditedHours = min(elapsed, 8h)/1h`; loss satiety 2/h, comfort 1/h (fractional, keep as number); `after = max(min(before, 25), before − loss)`; energy and vitality unchanged; no loss check, never lost offline; emit `offlineApplied`; re-anchor in the same result.

### Save validation
`validateSave(unknown)` returns `{ok, value, errors}` and never throws. Check schemaVersion === 1, every number 0–100 for needs (vitality 0–100), enums, arrays of strings, ids non-empty, `currentVisit` shape, records keyed by the three learning points, `settings` enums. Unknown extra keys: strip. `validateMeta` likewise.

## Tests (tests/simulation/)
Use `createTestProviders()` and `createDemoSave()` from `src/simulation/fixtures.ts`; build your own `ContentCatalog` fixture with three lessons × three rounds covering `advance`, `supportedRetry`, `careClosure`, `careEffect`. Cover at least:

- Standard 30 days away: needs and status unchanged. Challenge 30 days: max 8 h credited, satiety ≥ 25 if it was ≥ 25, vitality unchanged. `before=10` stays 10. Clock running backwards: no loss, no bonus. Two returns within a minute: loss once.
- Challenge paused: no active and no offline decline. Hidden/learning text: the reducer never ticks unless told (test that TICK with 0 ms does nothing).
- satiety 0, vitality 100, 19 active minutes → vitality 5, alive, band critical; one more minute → lost, only in challenge. Both needs 0 → still −5 per minute. Meal in critical → satiety > 0, loss stops, no cost. Regeneration at both ≥ 35.
- Standard floor 25 for active decline and for round cost; standard vitality constant.
- Transactions: replay of CARE, BUY_UPGRADE, COMPLETE_VISIT, SELECT_OPTION returns `duplicate` with identical save. Purchase with 0 marks → `rejected: insufficient_marks`, save unchanged. Double buy → `already_owned`.
- Visit: full L01 happy path through all phases; reward once; reload scenario (reduce the same COMPLETE_VISIT twice); three L01 repeats give three visit marks but `completedLessonIds` stays `['L01']` and growth is not available; learning mark granted once when two distinct scenarios are helpful, not for supported replays; supported retry costs no energy; inserted variant appears at most once; careClosure counts as regular visit and as care closure; bond +1 per helpful visit max.
- Growth: available only with L01+L02+L03, ≥ 3 helpful visits, ≥ 1 care closure; CONFIRM_GROWTH keeps learned points; rejected twice.
- Readiness: real low values block START_VISIT with `needs_care`; scenario context (high stress in lesson) does not block and does not alter `dog.stress`.
- Validation: tampered import (satiety 500, unknown mode, missing dog) rejected with errors; valid round-trips.
- Lost dog: CARE/START_VISIT rejected `dog_lost`; TICK no-op; standard save untouched (test with two saves).

Aim for ≥ 60 focused tests. Test invariants, not function names.

## Done means
`npm run typecheck` clean, `npm test` green, no `any`, no DOM/Three imports in `src/simulation`. Then send ines-c3 a message: what you implemented, which rules you interpreted (reference D-numbers or propose new ones), commands run with results, anything you need changed in the contracts.
