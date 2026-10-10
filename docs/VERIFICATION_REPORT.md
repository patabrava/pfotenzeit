# Pfotenzeit MVP — verification report

Verified on 2026-10-09 in `/Users/patabrava/Documents/AI/github/Camilo/Ines`.

**Automated verification passed after fixes. Physical-phone acceptance and human playtesting remain open.** This prototype has no HTTP/server backend. Backend-like responsibilities are the pure simulation, validation, transactions, IndexedDB persistence, lifecycle and import/export; those were tested. No server API or server authentication exists to test.

## Observed results

| Command/check | Observed result | Evidence |
|---|---|---|
| `npm ci` | Installed successfully; 0 vulnerabilities reported | Initial execution output |
| `npm run typecheck` | Exit 0 | `verification/logs/typecheck-final.log` |
| `npm run build` | Exit 0; production bundle and `dist/sw.js` emitted | `verification/logs/build-final.log` |
| `npm run assets:check` | 8 GLBs, 2,279,588 bytes, zero validator errors/warnings/info | `verification/logs/assets.log` |
| `npm test` | 17 files, 201 tests passed, including both DOM integration tests | `verification/logs/unit-final.log` |
| `npx vitest run --config src/render/dev/vitest.config.ts` | 14 renderer checks passed | `verification/logs/renderer-unit.log` |
| `npm run test:e2e` | Four scenarios × three projects = 12 passed; mobile helper uses touch activation | `verification/logs/e2e-final.log` |
| `node src/render/dev/verify-browser.mjs --out ./verification/renderer` | Five viewports, three views each; demand rendering and GLB loading passed | `verification/renderer/results.json`, screenshots, `verification/logs/renderer.log` |
| `PZ_BASE=http://127.0.0.1:5231 node src/ui/dev/smoke.mjs` | 13/13 checks passed, including keyboard, focus trap, 48px actions and 200% root text size | `verification/logs/ui-final.log`, `verification/ui/` |
| `node scripts/verify-acceptance.mjs` | All five extended scenario groups passed | `verification/acceptance/results.json`, `verification/logs/acceptance.log` |
| `node scripts/verify-offline.mjs` | First-install production cache: 27 entries; offline reload, profile and lesson passed, no console/page errors | `verification/acceptance/offline.json`, `verification/logs/offline.log` |
| `node scripts/verify-interruption.mjs` | 120-second simulated visibility interruption, unchanged standard needs, return banner, landscape and settings passed | `verification/acceptance/interruption.json` |
| `git diff --check` | Passed | Final working-tree check |

The full browser smoke covers L01, reflection and exactly-once marks after reload; challenge onboarding and persisted mode after reload; unavailable WebGL; and second-tab ownership. Persisted mode is read from IndexedDB, avoiding a false pass from a temporary toast or onboarding text. The first-install test also asserts that service-worker activation causes no additional document navigation.

## Extended acceptance and section 7 coverage

These are automated desktop-browser checks, supplemented by screenshot inspection. They are not a claim that a human performed the entire manual walk-through.

| Handoff item | Tested outcome | Remaining limit |
|---|---|---|
| 1: profile | Pflege, Erinnerungen and Gelernt tabs work | Human usability review |
| 2: lessons | L01–L03 completed; two supported replays and one inserted unsupported round exercised; L03 rest raises real energy by 30 | Educational and professional training review |
| 3: school/growth | Both upgrades purchased; 1 mark remains after spending 5; growth reaches `growing`; learned points unchanged | Final visual/art review |
| 4: reloads | Care commits once (40→75); feedback decision count, reflection marks and purchase balance survive reload | Reload tested after commit while presentation can remain pending; pre-commit navigation is not claimed durable |
| 5: challenge | Separate save, 0 starting marks; vitality 45 then 5; critical care UI; feeding stops loss; active neglect reaches memorial; new run; standard state unchanged; 24h offline capped at −16 satiety/−8 comfort; values below 25 stay unchanged; vitality unchanged | Physical-device lifecycle |
| 6: interruption/storage | 120s visibility lifecycle simulation, return banner, unchanged standard dog; second-tab lock; JSON export; satiety 500 import rejected with state retained | Headless Chrome kept both tabs visible, so synthetic visibility/blur/focus events were used; actual tab/OS background remains unverified |
| 7: accessibility/settings | 844×390 landscape; 200% root text; keyboard/focus/escape; audio off; reduced motion on | Real OS text scaling, screen reader and touch scrolling need hardware acceptance |
| 8: recovery | Real WebGL context loss and restore; profile usable while context lost; five character GLBs loaded, including growing Nala; intercepted model 404s use procedural fallback without a page crash | Driver-specific recovery on phones |

Inserted retries follow D-005: an unsupported retry is only appended while the learning point is still unlearned. A wrong choice in L02 A followed by helpful B/C may already teach the point. The acceptance script also chooses the unsupported wrong B option to exercise the inserted branch; the handoff now explains this condition.

## Fixes applied

- Sized `.scene` explicitly: it previously inherited a canvas's default 150px height.
- Framed the lesson scene in the measured gap between its header and dialog, so the overlay cannot hide the dog. ResizeObserver follows text/layout changes and orientation.
- Let noninteractive banner content pass taps through; kept banner buttons interactive. Context-loss banners previously blocked the profile control.
- Prevented first service-worker claim from reloading an already current game. Later controller changes retain the update reload.
- Made public same-origin static cache lookups ignore `Vary: Origin`, which otherwise made precached modules miss when loaded with an Origin header. Precaches all four font faces, preserving offline typography.
- Fixed debug metrics' immediate-null promise race and removed favicon 404s in both dev harnesses.
- Aligned tests with real data keys, 300ms sheet guards and completed persistence; isolated the DOM integration suite from GPU loading; removed the post-boot IndexedDB deletion that blocked behind its open connection. Kept German text and gameplay rules unchanged.

Baseline Git commit created before fixes: `bd09218`. The fixes, scripts and report remain reviewable in the working tree. D-032 records the implementation decisions. The two original stray Vite servers were stopped; the two current servers are intentional verification previews.

## Browser and renderer measurements

Environment: macOS, Node 26.0.0, npm 11.12.1, installed Google Chrome 154.0.8037.98. Production smoke: 360×640, 390×844 and desktop. Renderer: 360×640, 390×844, 430×932, 844×390, 1440×900, Chrome software WebGL/SwiftShader.

At all five isolated lesson sizes: **10 draw calls, 42,272 triangles, DPR 2**, under the 100-call budget. With Bruno, Alex and growing Nala in the extended scene: **15 calls, 74,368 triangles, DPR 1**, GLB tiers observed. The growing GLB network response was explicitly verified; tier names identify the actor (`dog_nala`), not its growth variant. Inactive and held rendering produced zero additional frames, and rendering resumed when reactivated.

Software-rendered FPS estimates ranged approximately 9–58 in the isolated lesson runs and varied with concurrent CPU load. These are diagnostic observations, not phone performance results or proof of a mobile FPS target. No iPhone/Android OS, browser, battery, heat, memory or 60-second hardware FPS measurement was obtained.

## Run locally

From the Ines project root:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run assets:check
npm run test:e2e
npx vitest run --config src/render/dev/vitest.config.ts
node src/render/dev/verify-browser.mjs --out ./verification/renderer
```

For the additional scripts, start a dev server on `127.0.0.1:5231` and a production preview on `127.0.0.1:4173`:

```sh
npx vite --host 127.0.0.1 --port 5231 --strictPort
# Separate terminal:
npm run preview -- --port 4173 --strictPort
# Separate terminal:
PZ_BASE=http://127.0.0.1:5231 node src/ui/dev/smoke.mjs
node scripts/verify-acceptance.mjs
node scripts/verify-offline.mjs
node scripts/verify-interruption.mjs
```

Do not edit running app modules during the two-minute dev interruption script: Vite reloads invalidate that lifecycle scenario. The scripts use installed Chrome and isolated contexts, preserving existing user saves.

At report time: production preview `http://127.0.0.1:4173`; debug dev preview `http://127.0.0.1:5231`. The production server is bound to the LAN at `http://192.168.0.239:4173`. LAN IPs can change. Plain LAN HTTP is suitable for gameplay acceptance, but cannot prove service-worker/offline installation; use HTTPS for that phone test.

## Open acceptance work

1. On a real iPhone/Safari and Android/Chrome, complete L01, open the profile during a lesson, lock for one minute, return and rotate. Measure 60 seconds of lesson FPS, device/OS/browser, DPR and draw calls, and inspect touch scrolling and OS text scaling.
2. Have first-time adult dog owners play naturally and measure the intended 3–5 minute session, comprehension and learning transfer. Automated fast progression does not validate that timing.
3. Complete the book-source and professional training review. Lessons remain provisional; this verification does not establish that all book teachings are covered or approved.
4. Replace/refine the code-authored 3D and pixel art. Eight GLBs are validated and load successfully, but none is final sculpted art. Icons remain placeholders; audio is synthesized.

No known failing automated check remains in this report. Physical phone acceptance, educational review and final art are explicitly incomplete. Historical failure logs and screenshots are retained as diagnostic history and are not the final pass evidence.


## Continuation verification — 2026-10-10 (Codex, section 12)

Executed on the host Mac with installed Chrome. These are actual new runs; earlier tables remain historical evidence.

| Check | Latest result | Evidence |
|---|---|---|
| TypeScript + production build | Passed | CLI output in this chat |
| Full unit/integration suite with DOM | 300/300, 29 files | CLI output in this chat |
| Production Playwright | 18/18 across 390×844, 360×640 and desktop | verification/e2e-run.txt |
| UI smoke | 65/65 | verification/ui-smoke.txt; verification/ui/ |
| Renderer Node checks | 23/23; 30 s timeout for expensive bounds sampling | verification/renderer-node.txt |
| Live asset validation | 8/8, 0E/0W/0I; 8,179,444 B < 8,388,608 B | CLI output in this chat |
| D-040 CLI contract | Positive override/staging case and invalid/missing events/public output rejection passed | verification/d040.txt |
| Extended acceptance | All five groups passed | verification/acceptance/results.json; verification/acceptance-run.txt |
| Production offline | Passed; 27 cache entries | verification/acceptance/offline.json; verification/offline-run.txt |

Extended acceptance proved all L01/L02/L03 completions, two supported rounds and one inserted unassisted round, +30 real energy for rest, both upgrades and growing stage with learning preserved; reload checks for care, feedback, reflection and purchase; export and rejection of satiety=500 import; challenge yellow=45/critical=5, care preventing loss, loss/new run, separate saves and offline caps without offline death; context recovery with usable DOM; all live character GLBs including growing Nala; missing-model procedural fallback. The new WebGL-disabled e2e check reaches the actual L01_B exercise through far-band selection and verifies the successful option is offered.

Fixed failures are documented in PROGRESS.md and D-044. The original stationary-yard GPU failure is retained with yard.json and portrait/landscape gate screenshots in verification/renderer-before-fix/. The GPU rerun uses a Vite server with watching disabled to prevent verification output or concurrent file changes from reloading the page mid-measurement.

Native Chrome inspection confirmed the classic-view setting stays available after turning it off, the fallback home has an Im Hof action, and its zone sheet lists Mira, food/water, rest, practice, quiet corner, Alex/Bruno, gate and shelter. A genuine return banner appeared when the native tab was reopened. This is partial hands-on Chrome coverage; the entire prescribed manual walkthrough, normal-pace 3–5 minute L02 timing, phone-size interpretation of tension without copy, and physical iPhone/Android tests are not claimed complete. No physical phone is exposed to this session. Hardware GPU/FPS, touch precision, screen locking, rotation and battery remain separate acceptance.

Pending-item decisions: apply D-040; retain integrated free licensed cast and do not purchase/contact a paid hero seller; do not ship the old interim Blender candidate cast or relax the download budget.

Latest host interruption run passed: 120 seconds, standard needs unchanged, return banner visible, 844×390 landscape, audio off and reduced motion on. Headless Chrome required synthetic visibility events; the script restores visible state before bringing the page forward so a spurious hidden event does not restart the interval. Evidence: verification/acceptance/interruption.json and verification/interruption-run.txt.

Concurrent player work was preserved: a visible woman named Ines now represents the handler while Mira/Alex remain distinct NPCs. The full suite rerun after that integration passed 300 tests in 29 files, typecheck/build/live validation and 23 renderer Node checks. The GPU tap fixture approaches the gate on visible ground before tapping the gate, because the full-height player changes the initial follow-camera coverage.

The final production/UI reruns with the Ines player both passed: 18/18 Playwright and 65/65 UI smoke, with no UI page errors. Source whitespace validation passed excluding byte-preserved imported licenses and historical raw logs. Those source/license/report files retain their original bytes and hashes.
