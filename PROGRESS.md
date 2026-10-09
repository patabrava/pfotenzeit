# Pfotenzeit implementation progress

Last milestone: Functional MVP integrated (2026-10-09, 16:20). Browser evidence still pending (sandbox cannot launch Chrome).

Completed:
- Scaffold, locked dependencies (D-002), shared contracts, store, decisions log (docs/DECISIONS.md D-001..D-031)
- WP-A simulation: reducer, care clock, lesson machine, progression, validation; 102 rule tests (ines-bc)
- WP-B content: L01–L03 as data (03 texts verbatim), characters, upgrades, memories, all UI strings; 13 pixel sprites + PNG export; 49 tests (ines-96)
- WP-C storage/shell: IndexedDB atomic commits + conflict rejection + ledger + backups, boot sequence, lifecycle clock, Web Locks tab ownership, router, dev debug panel, service worker; 43 tests (ines-93)
- WP-D renderer: procedural skinned Nala/Bruno/Mira/Alex (1 draw call each), courtyard, 13 poses + 5 gestures, ortho camera rig, demand rendering, GLB swap path; 14 Node checks (ines-1f)
- WP-E UI: all screens, presenter (effects shown once, acknowledged once), pointer input, WebAudio cues, a11y structure (ines-24)
- WP-F assets: code-authored rigged GLBs for 5 characters + 3 static sets, manifest with measured numbers, validator (0 errors), docs/ASSET_REPORT.md (verified + node-name fix by ines-bc)
- Integration: store revision bug on mode switch fixed; service-worker build input (D-031); store-level integration tests (5); DOM integration test (2, happy-dom); Playwright smoke spec (4)

Currently building:
- nothing in flight; waiting for browser evidence from outside the sandbox

Verified (command + result, inside the Claude sandbox):
- `npm run typecheck` → 0 errors
- `PFZ_NO_DOM=1 npm test` → 16 files, 199 tests passed (DOM test excluded, see below)
- `npm run build` → clean; dist: main 91 kB, ui 83 kB, renderer 59 kB, pixel 34 kB, three 633 kB (159 kB gzip), sw.js 2.5 kB
- `npm run assets:build` / `npm run assets:check` → 8 GLBs, 2,279,588 bytes, gltf-validator 0 errors/0 warnings, shoulder heights 0.281/0.361/0.311 m, humans 1.716/1.776 m
- Renderer Node checks (WP-D): poses/gestures distinct, framing at 5 viewports, demand rendering, GLB detection — 14/14

Not yet verified (needs a run outside the sandbox):
- `npm test` including `tests/integration/session.dom.test.ts` (happy-dom files match the sandbox's `*token*` read-deny)
- `npm run test:e2e` (Chrome cannot bind its singleton socket inside the sandbox)
- `node src/render/dev/verify-browser.mjs` (real WebGL draw calls / FPS / DPR)
- Any real smartphone (iOS Safari, Android Chrome)

Device/browser measurements:
- none yet; Node-side scene traversal: lesson view 6 draw calls / 15.4k triangles, fullest scene 18 draw calls / 28.3k triangles

Asset statuses (placeholder/pending/final):
- dog.nala.puppy, dog.nala.growing, dog.bruno.puppy, human.mira, human.alex, environment.school, props.care, props.upgrades: code-authored (rigged, animated, validated). Not final art; tickets A01–A09 stay open for a sculpted pass (docs/ASSET_REPORT.md)
- pixel sprites: code-authored (13 states, src/ui/pixel/sprites.ts)
- icons (public/icon.svg, apple-touch-icon.png): placeholder
- audio: synthesized WebAudio cues, no files

Known issues:
- Two stray Vite dev servers from verification attempts may still be running on ports 5179 and 5231 (cannot be killed from inside the sandbox)
- `jsdom` is listed in devDependencies but unused (npm could not uninstall it inside the sandbox; harmless)
- GLB tier is detected at runtime by the renderer; whether the GLB or the procedural actor is visible on a given device has not been seen in a browser yet
- Book review (03) and professional training review remain open; lesson texts are provisional

Next concrete task:
0. Hand `docs/HANDOFF_VERIFICATION.md` to an agent or person outside the sandbox (paste-ready prompt in its section 0)
1. Outside the sandbox: `git init -b main && git add -A && git commit`, `npm test`, `npm run test:e2e`, `node src/render/dev/verify-browser.mjs`; feed failures back to the owning window
2. Real phone session over LAN (`npm run dev` prints the address) and record device/OS/browser/FPS here
3. Absorb the UI-only strings from src/ui/strings.ts into src/content/de.ts (WP-B)

Blocking external needs:
- none for the local prototype; git and browser runs must be started by the user
