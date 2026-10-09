# Pfotenzeit — verification handoff (run outside the Claude sandbox)

Status on 2026-10-09: the MVP is implemented and integrated (see `PROGRESS.md`). Everything that only needs Node passed inside the development sandbox. Everything that needs a browser, a phone or git could not be run there. This document tells another agent (or a human) exactly how to run those checks, what "pass" looks like, and where to fix things if they fail. Communicate with the user in English; game text stays German.

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
2. Each lesson once (L01, L02, L03). In L02 round A choose "Mehrmals rufen" once to see the supported replay ("Gestützte Wiederholung"), then the inserted "Noch einmal ohne Hilfe" round at the end. In L03 round A "Ruheplatz anbieten" must raise the real energy bar in the profile afterwards (+30).
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
