# Yard life milestone review (D-041, 2026-10-10)

Status: all four packages delivered and integrated; sandbox verification green; browser, Playwright, screenshot and phone checks are outside-sandbox items (`docs/HANDOFF_VERIFICATION.md` §12). Design: `docs/WORLD_PLAN.md`.

## What the player can do now (by design; browser-verified items are listed in §3)
- Walk the yard with Nala: tap the ground (or W A S D / arrows on desktop); Nala follows with a loose leash and settles when you stop. The camera keeps both in frame.
- Act where you stand: one contextual button appears on arrival (Mira: lesson or free practice; bowl: meal; rest deck: rest; sniff corner with the upgrade: play; quiet corner: give distance when stressed; Alex and Bruno: see Bruno's state). Free care stays reachable from the menu without walking.
- Tap Nala: attention line in German, Streicheln / Spielen / Sitz, and the responses to a moment she started herself.
- Distance as gameplay: next to Bruno at the fence she turns tense, further away she relaxes; the attention state drives her pose and the sheet text.
- Playable rounds: L01_B and L03_B (find a spot where she relaxes, "Hier bleiben" / "Hier Ruhe geben"), L02_C (walk away ≥ 2.6 m from the ball and "Nala rufen"). The response is computed from distance, distraction and her real needs, never from timing; options after the response are filtered; "Noch mehr Abstand" retries up to three times, then the round advances with feedback.
- Moments: after ≈ 20 s between exercises she sniffs a spot, watches Bruno, settles beside you or offers a glance; respond or ignore; needs change by at most ±10.
- Free practice from Mira or the training circle after the first lesson: choose exercise and distraction, attempt at your pace, Mira hints after two misses, no marks, no energy cost.
- Fallback: without the 3D yard (WebGL failed, "Klassische Ansicht", reduced motion) every exercise plays through three distance buttons; zones are a list; moments are text and buttons.

## 1. Packages
- **Simulation + content (ines-c3):** `src/simulation/exercise.ts` (deterministic rules), `EXERCISE_ATTEMPT` / `RESPOND_MOMENT`, phase `exercise`, option `forResponses` + `next: 'retry'`, `VisitState.attempts` (old saves default to `[]`), yard view in `getSceneDirective`, `content.practice`, `content.moments`, `de.world/exercise/practice`; 12 new tests.
- **WP-P world model + controller (ines-93):** `src/world/**` (layout from the courtyard stage, grid A* + steering, follow/held/moment/coming/free dog modes, attention, moments scheduler, exercise readiness and response scripts, directive projection, `pointForBand`), `src/app/world.ts` (rAF stepping while active, `updateWorld` per step, store sync for exercise/care/hold, `window.__pzWorld` in all builds, never dispatches); 61 tests incl. determinism and "dispatches nothing". Layout aligned with the renderer footprints after WP-Q (planter obstacles, sniff corner and rest deck centres).
- **WP-Q renderer yard mode (ines-1f):** yard camera target (dog 15 % share, min 12 %, both handler and dog inside, lead point, 320 ms ease), `updateWorld`, `pick` (actors → prompt disc → clamped ground), handler ring + pawprint, prompt ring, moment marker, ball, exercise/moment presentation resolving on the response pose, care at the zone, still-hold after 4 s back to zero frames, `scene.html?yard=1`, 4 Node checks. Side fixes: a fixed ±45° closeup azimuth that bypassed D-034 was removed (closeup back to 60 % on the GLB tier), stale hold check rewritten to the held-observation decision, synchronous stage walks, azimuth hysteresis.
- **WP-R UI + input (ines-24):** `src/input/yard.ts` (tap with slop, WASD/arrows, Escape, Enter/Space, no canvas focus), home prompt button and walk hint, dog sheet, exercise HUD (instruction, status line, non-timed attempt button, band fallback, attempt tag, filtered options), practice sheet and route, "Im Hof" zone list in fallback, settings switch, presenter durations for `exercise`/`moment`, harness stub controller, smoke checks.

## 2. Sandbox verification (ines-c3, final tree)
- `npx tsc --noEmit`: 0 errors.
- `HOME=$TMPDIR/vhome PFZ_NO_DOM=1 npx vitest run`: 27 files, 296 tests passed (61 world, 12 exercise/moment, content incl. exercise rounds).
- `npm run build`: green; GameRenderer chunk ≈ 80 kB, ui chunk ≈ 117 kB.
- Node renderer checks: 23 passed / 0 failed, including yard framing (390×844 near: dog 15.3 %, margin 26.3 %; walking 14.4 %; far 6.1 m apart: both inside, 3.2 %), pick order, zero frames when still, walk phase from distance, exercise presentation.
- Snapshot `yard.png` viewed: handler ring with pawprint, Nala beside it, prompt ring at the gate, ball, Alex/Bruno at the fence, courtyard v2 around; portrait crops Mira's legs at the top (the frame follows the pair; acceptable).
- Browser yard pass added blind by ines-1f to `src/render/dev/verify-browser.mjs` (after the view loop, before close): `scene.html?yard=1` at 390×844 and 844×390; per viewport spawn screenshot and share, scripted tap at yard point (0.2, 2.6) inside the gate disc via the new `screenPoint` dev API (handler must move > 0.1 m within 500 ms, frames > 0 while walking), gate screenshot with arrival logged (not asserted), zero frames per second 4.5 s after stopping, far case (handler quiet corner, dog sniff corner, `dogFollows` false) with both inside. Writes `yard.json` next to `results.json`; the exit code requires every yard entry ok. Sandbox: `node --check` ok, tsc 0 errors, Node checks 23/23; headless Chrome cannot start here, so the pass itself is unrun.
- Not run in the sandbox: Playwright (`tests/e2e/smoke.spec.ts` updated for the exercise step), UI smoke D-041 block, `scripts/verify-acceptance.mjs` (updated), the browser yard pass above, phones.

## 3. Known limits and follow-ups
- The handler spawns inside the training circle, so "Freies Üben" is the first prompt after a lesson is completed.
- In portrait the yard camera cannot keep the 12 % dog share when the pair is > 5 m apart; it keeps both inside instead.
- No touch joystick; tap-to-move only on phones. Keyboard movement is desktop only.
- Educational content of exercises and moments is provisional like the lessons (no book claim); the clip semantics for responses reuse the 13 existing poses.
- Session length with walking is unmeasured (handoff §12 step 7).
- Pixel profile does not reflect the yard (unchanged by design).
