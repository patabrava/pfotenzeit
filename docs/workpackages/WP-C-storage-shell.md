# WP-C — Storage, boot, lifecycle, tab ownership, diagnostics, PWA (session: ines-93)

Read first: `/CLAUDE.md`, `docs/DECISIONS.md` (D-007, D-008, D-012, D-013), `docs/pfotenzeit/09_TECHNIK.md` (Speichern und Zeit), `04_PFLEGE_CHALLENGE.md` (Zeitmodell), `14_CLAUDE_EXECUTION.md` (A, C time anchors, E), `15_DATEN_REGELN.md` (Transaktionen, IndexedDB), `05_MOBILE_UX.md` (Unterbrechungen), `17_EXECUTION_CHECKLIST.md`.

## Mission

Make the app start, persist atomically, survive interruptions, own exactly one simulation clock across tabs, and (last) work offline as a PWA.

## You own (write only here)

- `src/storage/database.ts` — IndexedDB `SaveRepository` (`createIndexedDbRepository(dbName)`)
- `src/storage/migrations.ts` — schemaVersion upgrade path (v1 only now; structure for later; unmigratable data is backed up to an `backups` store and explained, never silently reset)
- `src/storage/importExport.ts` — JSON export/import helpers (`ExportBundle`), file download/upload helpers, strict validation via `validateSave`/`validateMeta` from `src/simulation/save.ts` (WP-A lands them; until then code against the signatures)
- `src/storage/tabOwnership.ts` — `createTabOwnership()`: Web Locks (`navigator.locks.request('pfotenzeit-owner', {ifAvailable:true}…)` held for the page lifetime), fallback BroadcastChannel lease with heartbeat; second tab resolves `'other'` and must never run a clock or write
- `src/app/boot.ts` — `boot()`: see sequence below
- `src/app/lifecycle.ts` — active-time accumulator and interruption handling
- `src/app/routes.ts` — route helpers (`navigate(store, route)`, back handling with `history.pushState` so the Android back button closes sheets/returns home instead of leaving the app)
- `src/diagnostics/debug.ts` — dev-only panel (`import.meta.env.DEV`): advance clock N minutes/hours, set needs, set mode, force band, complete lessons, trigger WebGL loss, show metrics. Uses `store.dispatch` and `store.debugReplaceSave`; never shipped as player UI
- `src/diagnostics/metrics.ts` — boot timing marks, FPS sampling helper, memory snapshot where available
- `src/sw.ts` + `src/app/serviceWorker.ts` + `public/manifest.webmanifest` + `public/icon.svg` + `public/apple-touch-icon.png` — PWA, done LAST (see below)
- `tests/storage/**/*.test.ts` using `fake-indexeddb` (`import 'fake-indexeddb/auto'`)

Read-only: `src/state/store.ts` (use it; propose changes to ines-c3), `src/simulation/**`, `src/ui/**`, `src/render/**`.

## Boot sequence (14 A)

1. `performance.mark('boot:start')`.
2. Create providers (`createBrowserProviders`), open repository; on failure (private mode, quota) fall back to `createMemoryRepository()` and set `app.storageError` (game playable, warning shown, export offered).
3. Acquire tab ownership. If `'other'`: mount UI with `app.ownership='other'` (WP-E renders the "Spiel ist in einem anderen Tab geöffnet" screen), no clock, no writes, retry acquiring when the lock frees.
4. Load meta; if none → `createNewSave('standard')` + `createNewMeta`, commit both. Load active save; validate; if invalid → back up raw record, explain, offer import, start a new standard save only after the user confirms (WP-E has the dialog; you expose the flow).
5. `createStore({...})`, then one `APPLY_OFFLINE` with `nowUTC` (store.act).
6. Mount UI: `const { mountUi } = await import('../ui')` → `mountUi(store, { getRenderer })` where `getRenderer` lazy-loads `import('../render/app/GameRenderer')` and creates the renderer once. The UI decides when to mount the renderer into its scene container; you provide the factory and feed `app.rendererStatus`.
7. Start lifecycle. `performance.mark('boot:ui')`. Set `#app[aria-busy=false]`.

## Lifecycle (04 Zeitmodell, 15 Zeit)

- Active clock: `requestAnimationFrame`-independent; use a 1 s `setInterval` **only while active** that reads `providers.monotonic()` deltas and accumulates; every ≥ 60 000 ms accumulated (or on checkpoints) dispatch `TICK_ACTIVE{activeMs}`. Active ⇔ `document.visibilityState==='visible'` && `document.hasFocus()` (treat missing focus API as focused) && `isActiveRoute(app)` && `ownership==='owner'` && no `storageError`. Reset the monotonic reference whenever activity resumes so a return never produces a catch-up tick.
- Checkpoints: every 30 s active, dispatch `TICK_ACTIVE` with whatever accumulated (may be < 1 min; the reducer keeps the remainder) so `lastSeenUTC` stays fresh.
- `visibilitychange` → hidden: dispatch `CLOSE_APP` (re-anchor), push `'hidden'` into `pauseReasons`, stop audio (call the UI/audio hook via `store.patchApp`), remember `app.returnSummary = null`. On visible: dispatch `APPLY_OFFLINE`, remove `'hidden'`, set `returnSummary` text (e.g. "Du warst kurz weg. Nala hat gewartet." or the challenge summary with credited hours from the `offlineApplied` effect), reset the clock reference.
- `pagehide`/`beforeunload`: `CLOSE_APP` (best effort; IndexedDB write may not complete, that is acceptable because every commit already updated lastSeenUTC).
- `blur`/`focus`: pause reason `'blur'` toggles; no offline application on focus (only visibility).
- `online`/`offline` events → `app.online`.
- Ownership change to `'other'` → pause reason `'otherTab'`.
- Expose `createLifecycle(store, deps)` returning `{ start(), stop() }`; keep it testable with injected `document`/`window` stand-ins where practical.

## IndexedDB (15, 09)

- DB `pfotenzeit`, version 1, stores: `meta` (key `'meta'`), `saves` (key `saveId`), `backups` (key auto, value `{createdUTC, reason, payload}`), `ledger` (key auto: `{saveId, revision, transactionId, type, nowUTC}`; keep last 500 per save, prune in the same transaction).
- `commit(save, meta?)`: one `readwrite` transaction over `saves` (+`meta`, `ledger`); read stored revision first inside the transaction; if `stored.revision >= save.revision` → abort and reject `StorageError('conflict')`; resolve on `transaction.oncomplete`, reject on `onerror`/`onabort` with mapped kinds (`QuotaExceededError` → `'quota'`). No awaits of unrelated promises inside the transaction.
- Export: JSON bundle `{format:'pfotenzeit-export', version:1, exportedUTC, appVersion, meta, saves}` as a downloaded file `pfotenzeit-export-<date>.json`. Import: parse, validate every save with `validateSave`, meta with `validateMeta`, reject with readable errors, back up current data into `backups`, replace, then the caller reloads the page.

## Service worker (14 E) — only after everything else works

- `vite` build emits `sw.js` from `src/sw.ts` (configure in `vite.config.ts`? No: ask ines-c3; preferred: a tiny plugin-free approach using `public/sw.js` written by you with a version string injected at build by `scripts/stamp-sw.mjs` — propose which).
- Cache versioned app shell + small core assets (models, pixel index) atomically on install; never the docs images. Update strategy: new SW waits; the app shows "Update verfügbar" only outside a lesson and after a successful commit; `skipWaiting` on user confirm; first offline visit without cache gets a readable message (precached `offline.html`).
- Register only in production builds and only over https/localhost.

## Tests (tests/storage/)
- commit/load round-trip; conflict rejection; quota error mapped; export/import round-trip; invalid import rejected and nothing replaced; backup created before import; ledger pruned; migrations: unknown version backed up.
- lifecycle: with fake timers and a stub document, hidden state accumulates nothing; return after 2 h hidden dispatches exactly one APPLY_OFFLINE; focus loss stops accumulation; 61 s visible dispatches TICK with ≥ 60 000 ms; checkpoint cadence.
- ownership fallback with BroadcastChannel stub: second instance resolves `'other'`.

## Done means
`npm run typecheck`, `npm test` green; `npm run dev` boots to the UI shell (coordinate with WP-E: until their views exist, boot may render a minimal placeholder from `src/app/boot.ts` only if `../ui` cannot be imported — prefer waiting for `mountUi`). Message ines-c3: sequence implemented, how to use debug panel, SW proposal, commands run with results, contract change requests.
