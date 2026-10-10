# Pfotenzeit — verification handoff (run outside the Claude sandbox)

Current continuation (2026-10-10): 308 DOM-inclusive unit tests, 33 production Playwright tests, 65 UI smoke checks, 23 renderer Node checks, typecheck/build/live assets, D-040 CLI validation and production offline smoke passed. Read the newest entry in PROGRESS.md and the final continuation report in docs/VERIFICATION_REPORT.md; older expected test counts below are historical. Physical-phone acceptance remains open.

Verification update on 2026-10-09: desktop automation has now been run and fixes applied; see `docs/VERIFICATION_REPORT.md` and `PROGRESS.md` for actual results. Real-phone acceptance remains open.

Original handoff status: the MVP is implemented and integrated (see `PROGRESS.md`). Everything that only needs Node passed inside the development sandbox. Everything that needs a browser, a phone or git could not be run there. This document tells another agent (or a human) exactly how to run those checks, what "pass" looks like, and where to fix things if they fail. Communicate with the user in English; game text stays German.

## 0. Paste-ready prompt for the executing LLM

> You are verifying and finishing the Pfotenzeit prototype in the repository at `<path>/Ines`. Read `docs/HANDOFF_VERIFICATION.md` first and follow it top to bottom; then read `CLAUDE.md`, `PROGRESS.md` and `docs/DECISIONS.md`. Run every step's command exactly as written, record the real output, and do not report a step as passed unless you saw it pass. When a check fails, fix the cause with the smallest change inside the owning package listed in `CLAUDE.md`, re-run the step, and log the fix in `PROGRESS.md` (and a new D-number in `docs/DECISIONS.md` if you changed a rule interpretation). Never change care rules, session length, mobile-first scope or the German texts' meaning. Do not deploy, publish or spend money. Finish by updating `PROGRESS.md` ("Verified" and "Device/browser measurements") and by giving the user the completion report described in section 9.

## 1. Environment

- macOS or Linux shell outside any sandbox. Node ≥ 22.12 (developed with Node 26.0.0, npm 11.12). Google Chrome installed (Playwright uses `channel: 'chrome'`); otherwise run `npx playwright install chromium` and remove `channel: 'chrome'` from `playwright.config.ts`.
- From the repo root:

```sh
npm ci
```

- If two old Vite dev servers are still running on ports 5179 and 5231 (left by sandboxed sessions), stop them: `lsof -ti:5179,5231 | xargs kill`.

## 2. Git (first)

The sandbox could not create `.git`. Initialize and commit before changing anything so every fix is diffable:

```sh
git init -b main
git add -A
git commit -m "Pfotenzeit MVP: scaffold, simulation, content, storage, renderer, UI, assets"
```

`.gitignore` already excludes `node_modules/`, `dist/`, the handoff ZIP and Playwright output.

## 3. Static checks (expected: all green, ~10 s)

```sh
npm run typecheck        # expected: no output, exit 0
npm run build            # expected: "✓ built", dist/sw.js present, three chunk ≈ 633 kB (159 kB gzip)
npm run assets:check     # expected: 8 rows "0E/0W/0I ok", "all asset checks passed"
```

## 4. Unit + integration tests including the DOM test

Inside the sandbox the DOM test was excluded (`PFZ_NO_DOM=1`). Outside, run the full suite:

```sh
npm test
```

Expected: 17 files, 201 tests passed. The two DOM tests live in `tests/integration/session.dom.test.ts` (happy-dom): a full L01 session through real DOM clicks with reload, and a reload in the middle of a reaction that must not duplicate the decision. If they fail:

- "button … not found; visible: …" → a label in `src/ui/*View.ts` or `src/ui/strings.ts` differs from `src/content/de.ts`; align the test's label lookup (the test imports `de` directly) or the view, not the German text.
- Timeouts in `react` → the presenter (`src/ui/presenter.ts`) did not fall back when no renderer exists; it must resolve within `maxDurationMs` + 300 ms even with `getRenderer()` → null.

## 5. Browser smoke (Playwright, production build)

```sh
npm run test:e2e
```

This builds, serves `dist/` on 127.0.0.1:4173 and runs `tests/e2e/smoke.spec.ts` on three projects (390×844, 360×640, desktop). Four tests:

1. Standard start → profile → meal → L01 three rounds → reflection → "Fertig für heute" → school shows "2 Schulmarken" → reload still shows 2. Also asserts zero `console.error` / page errors.
2. Challenge onboarding via Einstellungen → Spielmodus → "Challenge starten", survives reload, UI shows "Challenge".
3. WebGL disabled (getContext returns null) → lesson text still usable.
4. Second tab shows the "anderen Tab" screen.

Screenshots land in `test-results/`. Look at `01-home.png` … `05-school.png` on the 360×640 project and confirm: action buttons ≥ 48 px, nothing hidden behind the bottom edge, German text, the dog visible in the middle of the lesson view.

Failure routing: selectors/texts → `src/ui/**`; state wrong after reload → `src/storage/database.ts` or `src/state/store.ts`; reward counts → `src/simulation/progression.ts` (but the unit tests cover these; prefer fixing the UI call).

## 6. Renderer in a real WebGL context

```sh
node src/render/dev/verify-browser.mjs --out ./verification/renderer
```

Opens `src/render/dev/scene.html` in headless Chrome (SwiftShader), screenshots school/lesson/closeup at 360×640, 390×844, 430×932, 844×390, 1440×900, reads `renderer.info`, and checks demand rendering (frame counter flat while inactive or held). Record from `results.json`: draw calls and triangles per view, DPR, `assetTiers` (must say `glb` for the five characters if `public/assets/manifest.json` loaded; `procedural` means the GLB path failed — then check the browser console for the `[AssetManager]` warning and fix `src/render/loaders/AssetManager.ts` or the GLB build in `scripts/`). Budget: ≤ 100 draw calls in the lesson view (expected ≈ 6–18).

Also run the UI harness pass (dev server):

```sh
npx vite --port 5231 &
node src/ui/dev/smoke.mjs        # screenshots → $TMPDIR/pz-smoke
kill %1
```

It checks 360×640 screens, 200 % root font size (no dock button outside the viewport unless the dock scrolls), a keyboard-only pass (Tab → Enter opens the lesson picker, Escape closes), the WebGL fallback, challenge bands, memorial and the other-tab screen.

## 7. Manual pass in Chrome (dev server, ~15 minutes)

```sh
npm run dev
```

Open the printed localhost URL in Chrome with device emulation (iPhone 12/13 390×844, then 360×640). Walk `17_EXECUTION_CHECKLIST.md` "Browser-Smoke" items 1–8:

1. Standard start, profile tabs Pflege / Erinnerungen / Gelernt.
2. Each lesson once (L01, L02, L03). In L02 round A choose "Mehrmals rufen" once to see the supported replay ("Gestützte Wiederholung"). The inserted "Noch einmal ohne Hilfe" round is only added if the learning point is still unlearned at queue end (D-005); to exercise that branch, also choose "Weiter warten" in unsupported round B and then choose the helpful options in its supported replay and round C. In L03 round A "Ruheplatz anbieten" must raise the real energy bar in the profile afterwards (+30).
3. Buy Ruheplatz (2) and Schnüffelecke (3); after three lessons with at least three helpful visits and one care closure, HOME offers "Wachsen"; confirm; profile shows "Wachsen" phase, Gelernt tab unchanged.
4. Reload during: a care animation (profile → Futter geben, reload immediately → satiety shows the committed value once, no second meal), feedback, purchase, reflection. Nothing doubles.
5. Settings → Spielmodus → Challenge: separate dog, 0 marks. Debug panel (DBG bottom-left or Ctrl+Shift+D): Needs → satiety 0; Clock → Active +19 min → yellow then red band, training locked, "Versorgen" and "Pause" large; Futter geben → loss stops; Clock → Active +1 more minute after satiety 0 again → memorial screen with the exact 04 text; "Neuen Challenge-Lauf beginnen"; "Zum Standardmodus" shows the untouched standard dog. Debug → Offline +24 h on challenge: satiety −16 max, comfort −8 max, never below 25, vitality unchanged. On standard: unchanged.
6. Switch tabs for 2 minutes and return: interruption banner, no catch-up decline beyond the credited offline rule. Open the game in a second tab: other-tab screen. Debug → Storage → simulate nothing destructive; Export produces a JSON; Import of a tampered file (satiety 500) is rejected with a message.
7. Landscape 844×390; Chrome font size 200 %; keyboard-only; Settings → Audio off; "Bewegung reduzieren" on → care animations snap.
8. Debug → Renderer → "Lose context": DOM stays usable, banner offers reload; "Restore" brings the scene back. Rename a model file in `public/assets/models/` temporarily → the procedural dog appears, no crash, console warning only.

Record every deviation as a Known issue in `PROGRESS.md` with the step number.

## 8. Real phone (separate acceptance, do not emulate)

```sh
npm run dev     # prints http://<LAN-IP>:5173
```

On an iPhone (Safari) and an Android phone (Chrome) on the same Wi-Fi: play one full L01 session (target 3–5 minutes), open the profile during the lesson, lock the screen for one minute and return, rotate once. Measure FPS for 60 s in the lesson view with the debug panel (Metrics → FPS sampler) and note device, OS, browser, DPR and draw calls. Note: service worker and install prompt need https; a plain LAN http test does not prove offline behaviour (14 E). To test PWA offline, serve `dist/` over https (e.g. `npx vite preview --host` behind a local https proxy) or use Chrome's "Application → Service Workers → Offline" on localhost.

## 9. Completion report to the user

Give: run commands and preview address; which steps of sections 3–8 passed with their actual output; device/browser measurements; which assets are code-authored vs final (all characters are code-authored, no final art exists); the open book review and training review; known bugs with step numbers; the next concrete steps. Do not call the art final and do not claim real-device results you did not obtain.

## 10. Ownership map for fixes

| Area | Files |
|---|---|
| Rules, time, rewards, validation | `src/simulation/**`, tests in `tests/simulation/**` |
| German texts, lessons, pixel art | `src/content/**`, `src/ui/pixel/**` |
| IndexedDB, boot, lifecycle, router, debug panel, service worker | `src/storage/**`, `src/app/**`, `src/diagnostics/**`, `src/sw.ts` |
| Three.js scene, actors, camera, GLB loading | `src/render/**` |
| Screens, presenter, input, audio | `src/ui/**` (except `pixel/`), `src/input/**`, `src/audio/**` |
| GLB generation and manifest | `scripts/build-models.mjs`, `scripts/lib/**`, `scripts/validate-assets.mjs` |
| Store, contracts | `src/state/store.ts`, `src/simulation/types.ts` (change only with a decision entry) |

Rules that must survive any fix: rules contain no DOM/Three; renderer never changes domain state; standard has no offline penalty; offline alone never kills; free feeding, rest, pause always available; one save per mode; placeholders stay labeled.

## 11. Creative milestone run (2026-10-09, after WP-G2/H/I/J/K)

Context: `docs/CREATIVE_REVIEW.md` (what changed and what was verified in the sandbox), `docs/DECISIONS.md` D-033..D-039. Everything below could not run inside the Claude sandbox (no browser). Run sections 2–4 first as before; the counts are now 206 non-DOM tests plus the two DOM tests, and `tests/e2e/smoke.spec.ts` has two new steps (an extra "Weiter" after "Fertig für heute" for the reward summary; `.describe-body` for the forced observation description).

```sh
npm run typecheck && npm run build
npm test
npm run test:e2e
node src/render/dev/verify-browser.mjs --out ./verification/renderer
node src/render/dev/verify-browser.mjs --out ./verification/renderer-candidates --manifest candidates
npx vite --port 5231 & node src/ui/dev/smoke.mjs ; kill %1
```

Check and record in `PROGRESS.md`:

1. `verify-browser.mjs` prints D-034/D-039 shares per view, a strip pass (`?strip=1`) and D-035 timings. Expected with the live (procedural-tier fallback or code-authored GLB) assets: closeup ≥ 50 % standing in portrait and 55–65 % in landscape, lesson 40–50 % in every strip size, school ≥ 10 % portrait / ≥ 14 % landscape with Nala in the lower-middle third and the training circle centre, rest deck and shelter front visible. This is the first run of the camera against the v2 GLB yard (the Node checks used the procedural yard): look at the school screenshots and confirm nothing of the v2 shelter roof or tree clips the top edge badly; if it does, report the viewport and share, owner `src/render/app/CameraRig.ts`.
2. The `--manifest candidates` run loads `art/staging/blender-reference/manifest.json` (textured, `status: pending`, accepted only in dev). `assetTiers` must say `glb` for the five characters; the lesson scene should report ≈ 6 draw calls and ≈ 37.6k triangles. Screenshots of Nala closeup at 390×844 and 844×390 go into `verification/creative/candidates/`. These candidates are NOT the hero model; do not copy them into `public/`.
3. Choreography timings: decision → push-in 300 ms → reaction → settle → release, worst case ≤ 1.75 s; reward sprites appear at the header counter anchor, never over the dog; reduced motion resolves immediately. Record the printed timings.
4. UI smoke (`src/ui/dev/smoke.mjs`, screenshots in `$TMPDIR/pz-smoke`, 20–26 are the 390×844 series): header ≤ 44 px, strip ≥ 50 % of the viewport in observe/decide, dock ≤ 28 %, options 52–56 px, 48 px menu button at the dock's right edge, feedback mark before Mira's quote, three reward rows, counter +1, reduced-motion pose line, profile canvas an integer multiple of 128 device px, reward anchor inside the counter's rect (x) and clamped to the strip top (y), home clears the anchor. The smoke also loads the harness with `?route=reflection&pending=reward` (reload right after a completed visit): expect the home view, exactly one reward dialog, `pendingPresentation === null` afterwards, and the next lesson startable. Any failing check: owner `src/ui/**`, keep the D-032 rules.
5. Before/after screenshots: copy `verification/ui/01,03–07,10,13,14` (baseline) and the new smoke screenshots of the same screens into `verification/creative/before/` and `verification/creative/after/`. Look at them and write three sentences in `docs/CREATIVE_REVIEW.md` §5 on whether the lesson reads as "calm observation" (handoff §4C) rather than a form.
6. Hero review harness (WP-M): run the side-by-side review of the live Nala against the staged Blender candidate and the vendor dry run, and look at the sheets:

```sh
node src/render/dev/verify-browser.mjs --review a=procedural:dog.nala.puppy b=candidates:dog.nala.puppy --out ./verification/creative/review-candidate
node src/render/dev/verify-browser.mjs --review a=candidates:dog.nala.puppy b=vendor-dryrun:dog.nala.puppy pose=look_at_handler --out ./verification/creative/review-dryrun
```

   Expect 10 sheets (5 cameras × neutral/courtyard) plus four turntable frames and `review.json` per run; both panes drawn, candidate/dry-run panes on the `glb` tier, closeup share ≥ 50 % with ≥ 6 % margin. In the browser, `src/render/dev/scene.html?review=1&a=procedural:dog.nala.puppy&b=candidates:dog.nala.puppy&cam=closeup_portrait&light=courtyard&turn=1` is the moving close-up; `scene.html?manifest=vendor-dryrun` is the HUD path for the textured vendor rig.
7. Commit: `git add -A && git commit` with a message naming the five packages and D-033..D-039; do not rewrite history; `verification/` output may be committed or ignored per the existing `.gitignore`.

Do not purchase or download any vendor model, do not contact a seller, and do not change `public/assets/manifest.json` statuses; the hero model decision is the user's (`docs/HANDOFF_PREMIUM_ASSET_SOURCING.md`). Report with real output only; a check you did not run is reported as not run.

## 12. Yard life run (D-041, after WP-P/WP-Q/WP-R, 2026-10-10)

Context: `docs/WORLD_PLAN.md`, D-041. The sandbox verified typecheck, 296 unit tests (incl. 61 world and 12 exercise/moment tests), build, Node renderer checks (yard framing, pick, frame continuity, walk phase). Everything below needs a browser or a phone.

```sh
npm run typecheck && npm test && npm run build
npm run test:e2e            # L01_B now plays as an exercise: teleport via window.__pzWorld, attempt, offered options
npx vite --port 5231 & node src/ui/dev/smoke.mjs ; kill %1     # D-041 block at 390×844 (prompt, practice, dog sheet, keyboard, static mode)
node src/render/dev/verify-browser.mjs --out ./verification/renderer   # includes the D-041 yard pass: scene.html?yard=1 at 390×844 / 844×390, screenshots *_yard_spawn|gate|far.png, yard.json
```

Manual pass in Chrome (dev server, 390×844 and 844×390, then desktop 1440×900):

1. Home: tap the ground; the handler marker walks, Nala follows and settles; the camera keeps both in frame. Walk to Mira: prompt "Mit Mira sprechen" appears on arrival (≥ 56 px), opens the lesson/practice choice. Walk to the bowl: "Futter und Wasser geben" runs the meal with the bowl under the shelter. Rest deck: "Ruheplatz anbieten". Desktop: W A S D / arrows move, Enter activates the prompt, Escape stops; the canvas never takes focus.
2. Distance: walk Nala next to Bruno at the fence; her pose turns tense (ears back, turned away) and the dog sheet's attention line says so; walk away ≥ 2.6 m and she relaxes. Record whether the change reads at phone size without the text.
3. Dog tap: sheet with attention line, Streicheln / Spielen / Sitz; Sitz holds her, Spielen plays the ball; while a moment waits (after ≈ 20 s standing around), the sheet shows the observation and responses; "Ignorieren" always present; the outcome toast appears once; needs change by ≤ 10.
4. Lesson L01 round B (find_spot): instruction card, status line, "Hier bleiben" disabled while walking, enabled when standing; tap near Bruno → "still tense" response and the options "Noch mehr Abstand" / "Zum Kontakt locken"; "Noch mehr Abstand" returns to observe with "Versuch 2 von 3"; far from Bruno → "settled" and "Hier bleiben und ruhig abwarten" counts for the learning point. Three failed attempts → the round advances with feedback (no dead end). L02 round C (recall): "Nala rufen" only ≥ 2.6 m away; near the ball → distracted; far → comes, reward.
5. Fallback: Settings → "Klassische Ansicht" (static) and the WebGL-disabled run: the same rounds play with the three band buttons; the home "Im Hof" sheet lists zones; everything reachable by keyboard at 200 % text.
6. Practice: Mira → "Freies Üben" (after one completed lesson): choose exercise + distraction, Los; attempts, "Noch einmal", Mira's hint after two misses, "Fertig" returns home; no marks change; care still free from the menu.
7. Session length: play L02 fully including the recall round at normal walking pace and record the time (target 3–5 min).
8. Phone (separate acceptance): tap-to-move precision on a 390 px screen, two-finger scroll not hijacked, FPS while walking (continuous frames), battery note.

Yard pass expectations (`yard.json`, written blind, first run is yours): spawn dog share ≥ 0.12 with the handler in frame; the scripted tap moves the handler and frames keep coming while walking; `framesPerSecond` is 0 in the still window; handler and dog both inside in the far case. `arrived` and the gate prompt are now asserted. The verifier approaches through visible ground taps that avoid full-height actors, waits for arrival/still-hold with bounded timeouts, and lets the final queued frame drain before measuring one second of idle rendering (SwiftShader can advance simulated time slowly). Use `--yard-only --out ./verification/renderer-yard` for a targeted rerun. If the still check is not 0, keep `yard.json` and the gate screenshot for the renderer owner.

Record deviations in `PROGRESS.md` with the step number. `scripts/verify-acceptance.mjs` and `tests/e2e/smoke.spec.ts` already play L01_B/L03_B as exercises (teleport via `__pzWorld` or the far band, attempt, offered option); both are unrun in the sandbox.
