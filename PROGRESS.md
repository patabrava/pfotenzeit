# Pfotenzeit implementation progress

## Current verification continuation — 2026-10-10 (Codex)

User requested section 12 outside the sandbox, resolution of the three pending items, and a commit of all uncommitted work. Full DOM-inclusive suite: 300 tests / 29 files passed; typecheck and production build passed; all 8 live GLBs validated (0 errors/warnings/info each, total 8,179,444 B below 8,388,608 B). Production Playwright: 18/18 passed, including a new WebGL-disabled distance-band exercise assertion. UI harness: 65/65 passed; Node renderer: 23/23 passed. D-040 positive/negative CLI proof passed. Offline production reload/profile/lesson passed (27 cached entries). See verification/*-run.txt, verification/ui-smoke.txt, verification/renderer-node.txt and verification/d040.txt.

Fixed actual failures: missing zones/bands/practice/settings when static or WebGL unavailable; find_spot fallback moved only the handler instead of placing Nala away from the distraction; static practice response completion; re-entrant practice view destruction; duplicate visible events clearing the return summary; obsolete DOM/smoke/acceptance drivers for exercise and reward phases. Yard renderer now ignores repeated identical world directives instead of re-fitting against animated idle bounds and invalidating every step. The initial GPU yard failure (18 frames/s portrait, 9 landscape while still) and gate screenshots are retained in verification/renderer-before-fix/ for the renderer owner.

Pending decisions resolved (D-044): D-040 scripts applied (12 MiB decoded character texture cap, staging outside public, clipmap event overrides and strict validation); paid hero purchase/license inquiry superseded by the current integrated free licensed cast; old Blender candidates remain in staging and do not replace the current cast or relax the live download budget. No purchase, seller contact or deployment.

Device/browser measurements: installed Chrome on this Mac; desktop and mobile viewports through Playwright, plus native Chrome settings/classic-mode zone-list inspection and a real return banner after returning to the tab. Physical iPhone/Android touch, lock-screen, rotation, hardware FPS/battery and human timing/educational acceptance remain unrun: no physical phone is controllable through this session. Automated coverage is not a claim of the entire manual section 12 walk-through.

Last milestone: Yard life (D-041, 2026-10-10, `docs/WORLD_REVIEW.md`), sandbox-verified; browser/phone acceptance open. Earlier: desktop/browser verification completed with fixes (2026-10-09). See [verification report](docs/VERIFICATION_REPORT.md). Real-phone and human acceptance remain open.

Creative milestone (2026-10-09, in progress): see [creative review](docs/CREATIVE_REVIEW.md) and `docs/DECISIONS.md` D-033..D-038. Direction changed mid-milestone (D-036): the hero dog will be a sourced, licensed model; the live characters stay code-authored until then.

Creative continuation: [Fable 5.1 handoff](docs/HANDOFF_CREATIVE_FABLE_5_1.md). Recommended next milestone: improve Nala and the mobile L01 slice, then the supporting world; no new implementation performed by the handoff.

Blender tooling (2026-10-09): official MCP extension installed in Blender 5.2.2 LTS, Auto Start and localhost listener enabled, global Codex stdio server registered. MCP initialization, 26-tool discovery, live scene query and saved-preference persistence check passed. On-demand app opening is implemented; quitting/reopening the live scene was not tested. See [Blender connection guide](docs/BLENDER_CONNECTION.md) for Fable/Claude client configuration. No game assets were changed by this setup.

Completed:
- Scaffold, locked dependencies (D-002), shared contracts, store, decisions log (docs/DECISIONS.md D-001..D-031)
- WP-A simulation: reducer, care clock, lesson machine, progression, validation; 102 rule tests (ines-bc)
- WP-B content: L01–L03 as data (03 texts verbatim), characters, upgrades, memories, all UI strings; 13 pixel sprites + PNG export; 49 tests (ines-96)
- WP-C storage/shell: IndexedDB atomic commits + conflict rejection + ledger + backups, boot sequence, lifecycle clock, Web Locks tab ownership, router, dev debug panel, service worker; 43 tests (ines-93)
- WP-D renderer: procedural skinned Nala/Bruno/Mira/Alex (1 draw call each), courtyard, 13 poses + 5 gestures, ortho camera rig, demand rendering, GLB swap path; 14 Node checks (ines-1f)
- WP-E UI: all screens, presenter (effects shown once, acknowledged once), pointer input, WebAudio cues, a11y structure (ines-24)
- WP-F assets: code-authored rigged GLBs for 5 characters + 3 static sets, manifest with measured numbers, validator (0 errors), docs/ASSET_REPORT.md (verified + node-name fix by ines-bc)
- Integration: store revision bug on mode switch fixed; service-worker build input (D-031); store-level integration tests (5); DOM integration test (2, happy-dom); Playwright smoke spec (4)

Creative milestone completed packages (sandbox-verified by ines-c3 unless stated):
- WP-I courtyard v2 / props v2 / upgrades v2 (ines-93): 15,416 / 6,096 / 9,160 triangles, humans unchanged, validator 0E/0W/0I; upgrade nodes carry stage translations in the GLB.
- WP-K content readability parts 1–2 (ines-96): `de.poses`/`de.gestures` German pose descriptions (13 + 5), `de.sources`, UI strings absorbed into `de.ts`; pixel sync (part 3) deferred until the hero model exists.
- WP-J lesson HUD (ines-24): slim header with mark counter, inline "Genauer ansehen", option dock with 48 px icon menu, feedback card ≤ 200 ms, reflection reward rows, reduced-motion/fallback pose line, hard-pixel profile canvas; `src/ui/dev/smoke.mjs` extended (390×844 series); e2e spec adjusted by ines-c3. Browser checks not yet run.
- WP-G2 textured contract / vendor ingest / validator (ines-bc): `scripts/ingest-vendor.mjs`, `scripts/lib/{textures,assetContract}.mjs`, validator `--staging`, `docs/VENDOR_INGEST.md`; five Blender reference candidates staged and green (9,253,748 B total, above the 8 MB live budget, open decision). Manifest fields final (D-038); live manifest and `scripts/build-models.mjs` converted to `rig: 'project'` + `rigInfo`, `material`, measured `drawCalls`.
- WP-H camera/lighting/choreography/gaze/loader (ines-1f): bounds-driven CameraRig with D-034 targets amended per measurement (D-039: closeup portrait ≥ 50 % standing / ≥ 40 % lying, school ≥ 10 % portrait / ≥ 14 % landscape with circle centre, rest deck and shelter front in frame), warm key + cool bounce lighting, fitted contact shadow, D-035 decision choreography (worst case 1.75 s), reward sprites at the header counter anchor (UI publishes the counter centre), eye-bone gaze when present, loader on the D-038 fields with clipMap and sRGB-by-slot, dev harness `?manifest=candidates` / `?strip=1`.
- Sandbox checks on the final integrated tree (ines-c3): `npx tsc --noEmit` 0 errors; Node renderer checks 17/17 (incl. D-039 school block and staged textured candidates); `vitest run` (DOM tests excluded) 17 files / 206 tests passed; `npm run build` green (ui ≈ 93.8 kB, GameRenderer ≈ 67 kB, three 632.97 kB); `npm run assets:check` 8 GLBs, 2,673,176 bytes, 0 errors; staging validator 5/5 green.

Currently building:
- Yard life milestone (D-041, `docs/WORLD_PLAN.md`, 2026-10-10): contracts written; simulation + content done by ines-c3 (`src/simulation/exercise.ts`, EXERCISE_ATTEMPT/RESPOND_MOMENT in reducer and lesson machine, option filtering by response, retry limit, save default for `attempts`, yard view in the directive; L01_B/L02_C/L03_B playable; `content.practice`, `content.moments`, `de.world/exercise/practice`; sandbox: 235 unit tests pass incl. 12 new exercise/moment tests, typecheck clean outside the in-flight packages). WP-P world model + controller delivered (ines-93: src/world/**, src/app/world.ts, 61 world tests, __pzWorld steering handle in all builds); WP-R UI + input delivered (ines-24: src/input/yard.ts, prompt button, dog sheet, exercise HUD with band fallback, practice route, settings switch, smoke checks). Integrated tree in the sandbox: typecheck 0 errors, 296 unit tests pass, build green. WP-Q renderer yard mode delivered (ines-1f: yard camera, updateWorld, pick, markers, exercise/moment presentation, 4 Node checks; 23/23 total). Review: `docs/WORLD_REVIEW.md`. Outside-sandbox run: `docs/HANDOFF_VERIFICATION.md` §12. E2E spec and acceptance script updated for the exercise step (unrun in the sandbox). Browser yard pass added blind to `src/render/dev/verify-browser.mjs` (ines-1f; `yard.json`, spawn/gate/far screenshots; node --check and tsc clean; unrun, headless Chrome unavailable here).
- Purchase-independent preparation for the hero model (2026-10-10, `docs/workpackages/WP-L..O`), delivered: WP-L vendor-rig dry run green incl. 4 negative cases; WP-M hero review harness + bone audit (no project bone names needed for GLB actors) + dry-run load, Node checks 19/19; WP-N `docs/HANDOFF_HERO_BLENDER_INTEGRATION.md`; WP-O `docs/CLIP_BRIEF.md`; reflection reload trace with one race fixed; D-040 (12 MiB character texture cap, ingest output location, clip events via clipmap): docs applied; the three script edits were blocked by the permission classifier in the ines-93 session and are NOT applied (validator still enforces 6 MiB) — awaiting the user's explicit go; exact edits in `docs/VENDOR_INGEST.md`. Original dispatch: vendor-rig dry run through ingest/validator (ines-93; ines-bc window closed), hero review harness + bone-name audit + dry-run load (ines-1f), outside-sandbox Blender integration handoff (ines-93, after the dry run), clip brief (ines-24; ines-96 window closed), reload-at-reflection trace (ines-24). `art/vendor-evaluation/README.md` and `.gitignore` rules added (ines-c3).
- Creative milestone awaits the outside-sandbox run (`docs/HANDOFF_VERIFICATION.md` §11) and the hero model decision. Physical-phone and educational acceptance pending.

Verified outside the original Claude sandbox (2026-10-09):
- Git initialized; baseline `bd09218` committed before fixes; original stray Vite servers stopped.
- `npm ci`: successful, 0 vulnerabilities reported.
- `npm run typecheck`, `npm run build`: exit 0; production `sw.js` emitted.
- `npm test`: 17 files, 201 passed, including both happy-dom integration tests.
- `npm run test:e2e`: 12 passed on three projects; mobile helper uses touch. Verifies committed challenge mode and first service-worker claim without reload.
- Renderer Vitest: 14/14 passed. Browser renderer: all five viewports, 15 screenshots, zero additional inactive/held frames, GLB loading observed.
- `npm run assets:check`: 8 GLBs, 2,279,588 bytes, zero validator errors/warnings/info.
- UI harness: 13/13 passed, including 200% root text, keyboard, focus trap and 48px controls.
- Extended acceptance: all five scenario groups passed (lessons/retries/rest/growth, reload/export/import, challenge/offline isolation, context recovery/all models, missing-model fallback).
- Production first-install offline reload/profile/lesson: passed, 27 cached entries including fonts; no page/console errors.
- 120-second simulated visibility interruption: passed, return banner and unchanged standard needs. Headless Chrome kept tabs visible, so synthetic visibility events were necessary. Landscape/audio/reduced-motion settings also passed.
- Evidence and reproducible scripts: `verification/`, `scripts/verify-acceptance.mjs`, `scripts/verify-offline.mjs`, `scripts/verify-interruption.mjs`.

Device/browser measurements:
- macOS / Chrome 154.0.8037.98; Node 26.0.0 / npm 11.12.1.
- Isolated software WebGL lesson at five viewports: 10 draw calls, 42,272 triangles, DPR 2.
- Extended cast/growing scene: 15 calls, 74,368 triangles, DPR 1. Five character GLBs observed.
- Software lesson FPS estimates ~9–58, dependent on CPU load; these are not phone FPS measurements.
- No real iPhone or Android measurements obtained.

Verification fixes (D-032):
- Full scene sizing and lesson HUD-aware framing; noninteractive banners no longer intercept taps.
- First service-worker claim preserves the open page; static precache handles `Vary: Origin` and includes all four font faces.
- Debug renderer metrics race and dev favicon errors fixed.
- DOM/E2E/harness selectors, guard timing and persistence waits corrected without changing German meanings or simulation rules.
- Handoff clarifies D-005: inserted L02 retry only occurs while its learning point remains unlearned.

Asset statuses (placeholder/pending/final):
- dog.nala.puppy, dog.nala.growing, dog.bruno.puppy, human.mira, human.alex, environment.school, props.care, props.upgrades: code-authored (rigged, animated, validated). Not final art; tickets A01–A09 stay open for a sculpted pass (docs/ASSET_REPORT.md)
- pixel sprites: code-authored (13 states, src/ui/pixel/sprites.ts)
- icons (public/icon.svg, apple-touch-icon.png): placeholder
- audio: synthesized WebAudio cues, no files

Known issues / open acceptance:
- No known failing automated verification check remains; desktop automation is not physical-phone acceptance.
- `jsdom` remains an unused devDependency (harmless).
- All 3D/pixel assets are code-authored; final art review remains open.
- Book review and professional training review remain open; lesson texts are provisional.
- 3–5 minute human session duration, OS background/lock, physical touch scrolling, OS text scaling and mobile GPU FPS remain unverified.

Next concrete tasks:
0. Creative milestone outside the sandbox: `npm test` (DOM tests), `npm run test:e2e` (spec updated for the reflection reward step), `node src/render/dev/verify-browser.mjs --out ./verification/renderer`, `npx vite --port 5231 & node src/ui/dev/smoke.mjs`, before/after screenshots into `verification/creative/`, git commit. Free model integration completed; see `docs/HANDOFF_FREE_MODEL_INTEGRATION.md`.
1. Follow `docs/HANDOFF_VERIFICATION.md` section 8 on a real iPhone/Safari and Android/Chrome. Preview is running on port 4173; LAN HTTP does not prove offline installation.
2. Record device/OS/browser, 60-second FPS, DPR/draw calls, screen lock/return and rotation in this file.
3. Run adult first-owner playtests and complete source/training review before treating the educational content as approved.
4. Sculpt/refine final character and environment art; retain the validated asset contracts.

Blocking external needs:
- Physical phones and human reviewers are required for those remaining acceptance steps.


## 2026-10-10 — Free CC0 dogs integrated

Three live dog variants now adapt Quaternius CC0 ShibaInu/Husky, with native Blender IK training clips, retained editable sources, credits and protected regeneration. Prototype art status remains open. [Fable execution handoff](docs/HANDOFF_FREE_MODEL_INTEGRATION.md).

Observed: typecheck/build pass; 208 Vitest tests pass; 15 Playwright tests pass; all eight GLBs validate with zero errors/warnings; 195 sampled animated poses pass; integrated WebGL review passes at five viewports. Portrait lesson geometry decreased from 64,608 to 49,140 triangles. Service-worker-served Nala bytes match the live model SHA-256. All 46 UI harness checks pass, including 200% text and keyboard use; details are in `art/free-models-2026-10-10/reports/ui-smoke.txt`. Backend is absent by design. Physical phone acceptance remains open.

Fixed observed reflection reward race and German home-button wrapping. Installed web-app asset cache updates now include the asset manifest fingerprint. Before/after screenshots and Blender files are retained in `art/free-models-2026-10-10/`. No premium purchase, deployment or git operation performed.


## 2026-10-10 — Softer puppy replacement requested

The user rejected the angular Quaternius appearance. A smooth, textured, animated Labrador puppy by kenchoo / Tech developers is selected for evaluation under CC BY 4.0. The official Sketchfab download requires account sign-in; the user has been asked to sign in in the open browser tab. The candidate has not been downloaded or integrated. Live dog assets remain unchanged, and no new replacement test passes are claimed. Current GLBs and manifest are backed up in `art/soft-puppies-2026-10-10/before/`. Continue from [the softer puppy handoff](docs/HANDOFF_SOFT_PUPPY_MODELS.md).


## 2026-10-10 — Smooth textured puppies implemented

Replaced all three angular CC0 dog slots with adapted free CC BY 4.0 `Dog Puppy` by kenchoo / Tech developers. Official signed-in download retained with hashes and license evidence. Gold Nala, chocolate Bruno and growing Nala keep the existing semantic animation API; editable Blender rig uses native paw IK / flat-paw constraints. Smooth PBR fur, optimized textures and tangent-space normals replace faceted color surfaces. Gentle native idle preserves phone close-up margins. German settings now expose attribution to both creators, source links, license and modification notice. Regeneration preserves integrated vendor assets, and browser verification checks the exact new provenance and service-worker-served model hash. [Current Fable handoff](docs/HANDOFF_SOFT_PUPPY_MODELS.md).

Observed passes: typecheck/build; 208 Vitest tests / 18 files; 15 Playwright cases / 3 projects (including keyboard-accessible credits); all 8 GLBs, 5,744,136 bytes, zero validator errors/warnings/info; 195 pose/time samples; isolated regeneration preserves 3 GLB hashes and manifest entries; all 46 UI checks including 200% text and keyboard. Final isolated WebGL run passes 5 viewports with zero page errors and zero inactive/held frames, close-up margin ≥6%. A concurrent WebGL run recorded one late held frame at 360px; the unchanged check passed in the isolated rerun. Both reports are retained. Stale pose-content assertions were aligned to Fable's already revised tired/rest wording without editing that content.

Before/after comparison is in `art/soft-puppies-2026-10-10/reports/comparison/`; Blender-open screenshot and pose renders in `renders/`. Blender is open with `puppy_training.blend`; the prior GUI scene was saved before switching. Backend is absent. Physical-phone GPU performance and final training/animation/art review remain open. This is one Labrador source adapted into three variants, not three distinct breed models. No new dependencies, deployment, purchase or git operation.


## 2026-10-10 — Polished human replacements integrated

Replaced Mira and Alex with free CC0 Grab3D Casual Woman/Casual Man assets. Sources disclose AI-assisted Meshy origin; licenses, original downloads/hashes and Blender files are retained. Mobile optimization welds seams before decimation, preserves friendly faces/hair and textured clothes, retains native vendor skeletons, and authors all five trainer gestures with hand/foot IK and flat-shoe constraints. Normalized byte weights and joints fit the existing file/texture/draw budgets without a decoder. Legacy regeneration preserves all five integrated characters. German settings include human source/rights alongside puppy attribution. [Fable human-model handoff](docs/HANDOFF_SOFT_HUMAN_MODELS.md).

Observed: staged human validation passes with zero glTF errors/warnings/info; 50 animated pose/time samples pass; isolated regeneration preserves five exact GLBs and manifest entries; build/typecheck passes; 225 unit tests / 21 files pass with serialized workers (including the native human kneeling regression); 18 Playwright cases in three projects pass against an immutable production snapshot, including exact service-worker-served human hashes and credits; all 46 UI checks pass. The combined eight live assets remain under 8 MiB. The shared preview served an older manifest initially, causing six provenance failures; the isolated current build passed, and the shared preview was subsequently confirmed to serve both new human entries.

Concurrent lesson work expanded puppy clips to 16 and remains preserved; its provenance test's count expectation was aligned to that contract. A stale L03 wake-pose assertion was aligned to the companion task's existing tired-idle response. An overloaded concurrent unit run hit three timing limits; unchanged tests passed with serialized workers, and the timeout report is retained. The first renderer timing pass failed the legacy held-frame check, and a live-checkout rerun was interrupted by a development reload. The companion task intentionally animates dog body language and toys during observation; an attempted prop-freeze fix was withdrawn to preserve that behavior. Browser QA now checks positive observation frames and zero inactive/reduced-motion held frames. A genuine human compatibility fix honors manifest loop metadata so the one-shot kneeling animation holds its endpoint; the actual native-rig regression failed before the fix and passes afterward. Failed/interrupted reports are retained. Final immutable renderer verification passes all five target viewports with zero page errors: positive observation motion, zero inactive frames and zero reduced-motion held frames. See `art/soft-humans-2026-10-10/reports/renderer-isolated/` and `reports/completion.json`.

Actual before/after renders for both humans are in `art/soft-humans-2026-10-10/reports/comparison-mira/` and `comparison-alex/`; all native poses and an actual Blender-window screenshot are in `renders/`. Blender is open with Mira's editable training rig. No backend, dependency addition, deployment, paid purchase or git operation. Physical-phone FPS/touch/background acceptance and professional animation/training/final-art review remain open.

### Visible yard player — 2026-10-10

User-requested control clarity improvement: a separate player uses the integrated Alex prototype model with a selection ring/direction arrow. Existing handler motion now visibly walks a person; Nala retains her autonomous follow/response behavior. Code-authored stride works with vendor and procedural human rigs. Camera includes the whole player, body picking works, and leaving the yard hides/freezes the player. German control hints identify who WASD moves.

Verified: build/typecheck pass; 64 tests across eight files pass (world behavior plus native walk/hold and kneeling regressions); all four targeted renderer yard checks pass. Renderer coverage includes separate player/NPC instances, full-height near/far framing, body selection, still-hold and dog exercise presentation. Updated a stale renderer exercise check to settle for the existing 1.4-second sit contract rather than its former 1-second assumption; the old ground-pick coordinate is now occluded by a visible body, so the fixture uses clear ground. Initial runs retained those failures before correction.

Browser captures at 390×844 and 1440×900 show the native player model and visible stride. Keyboard movement, full player framing, three separate human instances, and still-hold after simulated settling pass with zero page errors. Software WebGL was slow, so settling was advanced through simulation steps rather than assumed from wall time. Evidence: `verification/player-yard/results.json` and screenshots; reproducible script: `verification/player-yard-check.mjs`. Impeccable detector reports no findings on changed targets. Player art currently reuses Alex's appearance; physical-phone performance remains unmeasured.

### Playable woman named Ines — 2026-10-10

Supersedes D-045's male prototype choice at the user's request. Ines now uses the integrated female model as a separate player instance; German hints name her. Build/typecheck, two vendor walk/hold/gesture tests, and four yard renderer tests pass. Mobile and desktop browser checks pass with Ines's name/female model, keyboard movement, stride, framing, separate NPCs and still-hold; zero page errors. Evidence: `verification/ines-yard/`. Native test quaternion comparisons normalize the imported float quaternions before measuring angular drift. Impeccable detector reports no findings.


## Public repository and VPS deployment — 2026-10-10

Created public GitHub repository https://github.com/patabrava/pfotenzeit and pushed the existing baseline plus implementation/art/verification and deployment commits to main. Deployed an isolated Nginx container at https://pfotenzeit.187.124.16.6.sslip.io/ using the existing VPS Traefik HTTPS proxy and a valid Let's Encrypt certificate. Compose limits the container to 128 MiB and 0.5 CPU; no backend or server database was introduced.

Validation run for this deployment: 300 tests in 29 files passed, production typecheck/build passed, all eight model asset checks passed, and 18 Playwright tests across mobile-360, mobile-390 and desktop passed. The VPS Docker build also passed. The live app returned HTTP 200 in Chrome at 390×844 with no page errors; health, service worker, Vite manifest, asset manifest and puppy GLB endpoints returned 200. Chrome displayed the yard and navigation. The container health check passed.

Deployment files: `Dockerfile`, `.dockerignore`, `deploy/compose.yaml`, `deploy/nginx.conf` and `deploy/README.md`. Server path: `/opt/pfotenzeit`; deployed runtime image: `pfotenzeit:0d0c7ae`. The server contains the build inputs rather than a full Git checkout; for updates, upload those inputs or clone the public repository and follow the deployment README. Physical-phone performance and professional art/training review remain as previously documented.
