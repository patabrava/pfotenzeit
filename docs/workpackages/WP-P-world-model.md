# WP-P — World model and app controller (session: ines-93)

Read first: `docs/WORLD_PLAN.md` (all), `src/world/types.ts` (contract, do not edit; propose additions to ines-c3), `src/simulation/types.ts` (ExerciseContext, WorldDirective, DogAttention…), `src/simulation/defaults.ts` (DISTANCE_BANDS, MOMENT_TIMING, YARD_SPEEDS, LOOK_AT_STILL_S), `scripts/lib/environment.mjs` STAGE positions, `src/app/lifecycle.ts` (pause reasons, active clock), `src/state/store.ts`.

## You own
`src/world/{layout,nav,steering,follow,attention,moments,exercise,directive,rng,index}.ts` (names free, `index.ts` exports `createWorldApi(): WorldApi`), `tests/world/**`, `src/app/world.ts` (controller), edits in `src/app/{boot,lifecycle,routes}.ts` only to wire the controller and the `practice` route.

## World (pure)
- `create(seed)`: layout from §2 of the plan, actors at spawn, `dogMode: follow`, `distraction: 'none'`, `othersPresent: true`, mulberry32 rng.
- `step(world, dt, inputs, needs)`: apply inputs → move handler (path following or direction) → dog behaviour by mode (follow / held / moment / coming / free) → Mira/Alex idle (Alex stands by Bruno; Bruno wanders ≤ 0.6 m around his spot, slower when the own dog is near) → derive context → moments scheduler (only when `!hold`, `exercise === null || exercise.roundId === null && !exercise.responding`, cooldown passed) → events. dt ≤ 0.1 s per call (split larger). Deterministic: same seed + same inputs ⇒ identical states (test it).
- `showResponse`: the dog performs the response (coming → walk to 0.8 m in front of the handler then sit; hesitates → one step toward, stop, look_at_handler 1.5 s, then idle; distracted → walk toward the distraction spot 1 m, alert_focus; turns_away → turn 120°, sniff; settled → lie_down at the current spot; still_tense → tense_idle; glance → look_at_handler hold) and emits `responseShown` when the motion settles (≤ 3 s). The pose sequence is expressed in the directive; the renderer plays clips from it.
- `pointForBand(world, band)`: a free point on the handler's side of the dog at 0.7 / 1.9 / 3.0 m (clamped inside bounds, away from obstacles).
- `directive(world, needs)`: WorldDirective with the five actors (handler as `characterId: 'handler'`), poses from attention/mode (plan §3), `prompt` from context, `momentSpot`, `distraction`, `focus` = handler position.
- Fallback inputs: `setBand` teleports the handler to `pointForBand`; `moveDir` with |v| = 1 moves at handler speed.

## Controller (`src/app/world.ts`)
`createWorldController({ store, content, renderer: () => RendererHandle | null, worldApi })` with: `start()/stop()` (rAF-driven step while the route is home/lesson/practice, `yardMode === 'yard'`, not paused; uses `performance.now()` deltas, splits into ≤ 100 ms steps, pauses with the lifecycle pause reasons); `input(input: WorldInput)`; `getContext()`, `getWorld()`, `subscribe(listener)` (context + events each step); it calls `renderer.updateWorld(directive)` each step and `renderer.apply(directive-with-world)` when structure changes (prompt, moment, distraction, view). Sync with the store: when `save.currentVisit` enters an exercise round in `observe`, `beginExercise(spec, roundId)`; on effect `exercise` present → `showResponse`; when a `care` effect is presented → `holdDog` for its pose for the presentation and release afterwards; on route `practice` with a chosen practice exercise → `beginExercise(spec, null)`; `hold` follows `SceneDirective.hold`. The controller never dispatches `EXERCISE_ATTEMPT` itself (the UI does, with `worldApi.exerciseContext()`); it may dispatch nothing else either. Expose `window.__pzWorld` in dev for the smoke harness.

## Tests (`tests/world/**`, Vitest, Node)
Path finding around an obstacle, bounds clamp, handler reaches a target, dog follows and stops, bands at known distances, attention table (tense near Bruno, distracted near toy, tired on low energy, focused after standing), moments start/respect cooldown/hold/fade, `exerciseReady` for recall at ≥ minDistanceM, look_at glance after LOOK_AT_STILL_S, `showResponse` emits `responseShown`, determinism (two runs equal), `pointForBand` yields the band. Target ≥ 25 tests.

## Report to ines-c3
Commands with real output (`npx tsc --noEmit`, `HOME=$TMPDIR/vhome PFZ_NO_DOM=1 npx vitest run tests/world`), the controller API as implemented, anything you need from the renderer (ines-1f) or UI (ines-24): message them directly and copy me.
