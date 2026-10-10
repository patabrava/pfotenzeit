# Hofleben — yard life milestone (D-041, 2026-10-10)

User request (verbatim intent): walk around with your dog (tap-to-move, WASD on desktop); make distance part of the gameplay; interact directly with objects and characters; turn some lesson choices into small playable exercises; give the dog a little initiative; add a free-practice area.

This document is the binding design for WP-P (world model), WP-Q (renderer yard mode), WP-R (UI/input) and the simulation/content work by ines-c3. Contracts: `src/simulation/types.ts` (ExerciseKind…, EXERCISE_ATTEMPT, RESPOND_MOMENT, effects `exercise`/`moment`, `SceneDirective.world`, `WorldDirective`), `src/content/types.ts` (`ExerciseSpec`, `LessonRound.exercise`, `LessonOption.forResponses`/`next: 'retry'`, `practice`, `moments`), `src/world/types.ts` (WorldState, WorldInput, WorldEvent, WorldApi), `src/render/types.ts` (`updateWorld`, `pick`, `PickResult`), `src/app/appState.ts` (route `practice`, `yardMode`, `dogSheetOpen`), `src/simulation/defaults.ts` (DISTANCE_BANDS, EXERCISE_*, MOMENT_*, YARD_SPEEDS, LOOK_AT_STILL_S).

## 1. Principles that do not move
- The simulation stays pure and discrete. The yard (positions, paths, following, moments) is a transient world model (`src/world`, pure TS, stepped with dt by `src/app/world.ts`). Nothing about positions is persisted; on boot everyone is at the spawn points.
- Rendering projects; it never decides outcomes. An exercise response is computed by `src/simulation/exercise.ts` from the recorded `ExerciseContext`, committed by the reducer (`EXERCISE_ATTEMPT`), and only then shown.
- No reaction timers, no tapping tests. `look_at` holds the dog's glance pose until the player responds. Movement has no time limit.
- Care rules, session length targets (3–5 min), offline rules, separate saves, free care/rest/pause/leave: unchanged. Moments add bounded ±5/±10 need changes (MOMENT_EFFECTS), no new economy. Practice has no rewards and no marks.
- Fallback: without the 3D yard (WebGL failed, or `yardMode: 'static'`) every exercise is playable through the distance chooser (`ExerciseSpec.fallbackBands`) and the same buttons; moments appear as text + buttons. Keyboard: WASD/arrows move, Enter activates the prompt, Escape stops.
- German text only in `src/content/**`; English code and comments.

## 2. The yard
Layout (`src/world/layout.ts`, WP-P) mirrors the courtyard GLB stage positions (`scripts/lib/environment.mjs` STAGE): bounds ≈ x −3.2…3.2, z −3.0…3.0; zones: `mira` (shelter front, ≈ (−1.0, 0, −1.4), r 1.1), `bowl` (under the shelter edge, ≈ (0.6, 0, −1.5), r 0.9), `rest_deck` (deck centre (−2.5, 0, −1.5), r 1.1), `sniff_corner` (stage sniff spot (2.1, 0, −1.2), r 1.1; prompt only with the upgrade; planters are three r 0.3 obstacles), `circle` (centre (0,0,0.1), r 2.1), `quiet_corner` ((−2.4, 0, 2.2), r 1.0), `alex_bruno` ((2.4, 0, 1.6), r 1.2), `gate` ((0, 0, 2.9), r 0.8), `shelter` (walkway). Obstacles: shelter posts, tree, planters, deck edge. Spawn: handler (0, 1.2), dog (0.5, 1.4), Mira (−1.0, −1.3), Alex (2.4, 1.4), Bruno (2.0, 1.9). Distraction spots: toy in the circle (0.8, 0.4), other dog at Alex.
Navigation: grid A* (0.25 m) on the walkable rectangle minus obstacles, path smoothed by line-of-sight; actors steer along the path at YARD_SPEEDS; the dog follows with a loose leash (target 1.0–1.4 m behind/beside the handler, re-targets only when the handler moved > 0.8 m, never pushes through the handler); when the handler stops, the dog settles within ≈ 1 s.

## 3. Attention and distance (the gameplay of positioning)
`attention` is derived every step (WP-P, rules documented in `src/world/attention.ts`, mirrored in tests):
- `tense` when `otherDogBand === 'near'` (Bruno within 1.2 m) or stress ≥ 50 and other dog `mid`;
- `distracted` when a distraction is set and the dog is within `mid` of its spot (toy) or `mid` of Bruno;
- `tired` when energy < EXERCISE_RULES.energyTired; `resting` while held in rest_loop/lie_down;
- `focused` while the handler stands still within `mid` and nothing distracts, for ≥ 2 s;
- otherwise `relaxed`.
Poses by attention: tense → `tense_idle` (ears back, turned slightly away from Bruno), distracted → `alert_focus` toward the distraction, tired → `tired_idle`, focused → `look_at_handler`, relaxed → `idle_relaxed` / `sniff` while walking slowly, resting → `rest_loop`. The UI shows the matching `de.poses` line under the strip (reduced motion / fallback) and in the dog sheet.

## 4. Direct interaction (home route, yard mode)
One contextual prompt button at the bottom of the home view, driven by `WorldContext.prompt`:
- `mira` → "Mit Mira sprechen" opens the lesson picker (and, after ≥ 1 completed lesson, "Freies Üben" as a second choice);
- `bowl` → "Futter und Wasser geben" = `CARE meal` (the bowl animation is the care presentation);
- `rest_deck` → "Ruheplatz anbieten" = `CARE rest`; `sniff_corner` (upgrade) → "Schnüffeln lassen" = `CARE play`; `quiet_corner` → "Hier Abstand geben" = `CARE calm` (only offered when stress ≥ 35);
- `alex_bruno` → "Zu Alex und Bruno" shows Bruno's current state text (no action) and the hint that Nala is tense when too close;
- `circle` → "Freies Üben" (after ≥ 1 completed lesson).
- `gate` and `shelter` are walkable places without an action in v1 (no prompt button).
Tapping the dog (renderer `pick` → `actor: 'dog'`) opens the dog sheet: name + attention line, "Streicheln" (= `CARE calm` when stress ≥ 35, otherwise a no-op greeting line with `look_at_handler`), "Spielen" (= `CARE play`, ball appears), "Sitz" (world `holdDog sit`, free, no effect), and the current moment's responses when a moment is active. Tapping the ground moves the handler; tapping a zone moves to its centre and the prompt appears on arrival.

## 5. Dog initiative (moments)
Between exercises on home/practice (not while holding, not in a lesson round), after MOMENT_TIMING.firstAfterS and then every cooldownS of world time, the world starts one moment chosen deterministically from the RNG and the state: `sniff_spot` (dog walks to a spot ≤ 2 m away and sniffs), `look_at_other_dog` (turns toward Bruno; only when Bruno is `mid`), `settle_beside` (lies down next to a standing handler; only when energy < 60), `offer_glance` (looks at the handler; only when `focused`). A small marker appears at the spot (renderer) and the dog sheet shows the moment's responses (`content.moments[kind]`); ignoring is always allowed and the moment fades after holdS. A response dispatches `RESPOND_MOMENT` → effect `moment` → presented (pose) → ACK. Each moment kind has an observation line and outcome lines (content, D1 principle: signals, no verdict).

## 6. Playable exercise rounds (lessons)
One round per lesson becomes playable by adding `exercise` to it (content by ines-c3): L01_B (`find_spot`, distraction `other_dog`: Bruno is uncomfortable near the fence; walk with Nala until she relaxes), L02_C (`recall`, distraction `toy`: a ball lies in the circle; move away ≥ 2 m, call), L03_B (`find_spot`, distraction `other_dog` in the loud yard; find the quiet corner / rest deck). Observation rounds keep their texts and options.
Flow of an exercise round:
1. `observe`: scene view `yard` (camera follows), instruction text (`exercise.instruction`) in the card, the attempt button (`readyLabel`) enabled only while `WorldContext.exerciseReady` (recall: `handlerBand === 'far'` i.e. ≥ minDistanceM; find_spot: handler standing still; look_at: after `glanceOffered`); otherwise `notReadyHint`. The menu keeps "Übung beenden". Fallback: three band buttons (`fallbackBands`) set the handler spot.
2. Tap → UI dispatches `EXERCISE_ATTEMPT { attemptId, context: world.exerciseContext() }`. Reducer: validates phase `observe` + round has `exercise` + attempts < EXERCISE_MAX_ATTEMPTS, computes `response = evaluateExercise(spec, context, dog)`, records the attempt, phase → `exercise`, effect `exercise` (presentable).
3. Presentation: `src/app/world.ts` feeds `showResponse` to the world; the renderer plays the dog's response (comes → walks to the handler, sits; hesitates → one step, looks, stays; distracted → turns to the toy/Bruno; turns_away → turns away, sniffs; settled → lies down / idle_relaxed; still_tense → tense_idle; glance → look_at_handler hold). `present(effect)` resolves at `responseShown` or maxDurationMs. ACK → phase `decide`.
4. `decide`: options filtered by `forResponses` (reward / wait / move closer and retry / adjust); `next: 'retry'` returns to `observe` (attempt + 1) until the limit, then behaves like `advance`. Helpful/unhelpful, feedback, Mira line, learning criterion: unchanged mechanics.
Evaluation rules (`src/simulation/exercise.ts`, tested): recall → `turns_away` if `otherDogBand === 'near'`; `hesitates` if stress ≥ 50 or energy < 35; `distracted` if distraction ≠ none and dog within `mid` of the distraction spot (context.dogZone/… encoded by the world as `distraction` + `dogZone`); `comes` otherwise (only when `handlerBand === 'far'`; `mid` → `hesitates`). find_spot → `settled` when `otherDogBand === 'far'` and (distraction none or dog not within mid of it) and stress < 50; else `still_tense`. look_at → `glance` always (the attempt exists only after the glance).

## 7. Free practice (route `practice`)
Entry: Mira or the circle prompt after ≥ 1 completed lesson. Sheet: choose an exercise from `content.practice` whose `requiresLesson` is completed, and a distraction level (none / toy / other dog), then "Los". The world runs the exercise with `roundId: null`, the HUD shows instruction, ready state, attempt button, response line, "Noch einmal", "Fertig". After two attempts without a `successResponses` outcome Mira's `hint` appears. Nothing is dispatched to the store except `RESPOND_MOMENT` and `CARE` from the prompts; attempts are not persisted, no marks, no energy cost. Active care time runs (route is active). Leaving is always possible.

## 8. Packages
| Package | Session | Scope |
|---|---|---|
| Simulation + content | ines-c3 | `src/simulation/{exercise,lessons,reducer,selectors,save,defaults}.ts`, rule tests, `src/content/**` (exercise specs, practice, moments, `de.world/exercise/practice/moments`), `tests/simulation/**`, `tests/content/**` |
| WP-P world model + app controller | ines-93 | `src/world/**` (except `types.ts`), `tests/world/**`, `src/app/world.ts`, `src/app/{boot,lifecycle,routes}.ts` as needed |
| WP-Q renderer yard mode | ines-1f | `src/render/**` (except `types.ts`) |
| WP-R UI + input | ines-24 | `src/ui/**` (except `pixel/**`), `src/input/**`, `src/audio/**` |

## 9. Acceptance (sandbox + outside)
- Node: world tests (navigation, following, bands, attention, moments, exercise readiness, determinism), simulation tests (EXERCISE_ATTEMPT flow, retry limit, options filtering, RESPOND_MOMENT bounds, old-save `attempts` default), content tests (every exercise/practice/moment text present, ≤ 180 chars per line, no "falsch").
- Renderer Node checks: yard view frames handler + dog within D-034-like shares, walk clip phase follows speed, pick() hits ground/actor/zone, continuous frames only while moving.
- UI smoke (outside): home yard with prompt button, dog sheet, exercise round at 390×844 with the strip ≥ 50 %, fallback bands, practice sheet, WASD on desktop, keyboard path.
- Session: a full L02 including the recall round stays within 3–5 minutes at normal walking (yard crossing ≈ 5 s).
