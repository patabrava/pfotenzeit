# Pfotenzeit — project instructions

Mobile-first dog-training web prototype. Plain Three.js + TypeScript + Vite. DOM UI, German game text, English communication with the user. Design package lives in `docs/pfotenzeit/` (read `00_START_HERE_CLAUDE.md`, then `14`, `02`, `04`, `05`, `15`; art: `06`, `07`, `08`, `13`, `16`; validation: `11`, `17`).

## Precedence

User instructions > this file > `docs/pfotenzeit/CLAUDE.md` > the rest of the package. `15_DATEN_REGELN.md` resolves ambiguities of `09`; care constants come from `02`/`04`. Record every genuine deviation in `docs/DECISIONS.md`; never silently change care rules, session length or mobile-first scope.

## Non-negotiable boundaries

- `src/simulation/**` and `src/content/**` contain no DOM, Three.js, timers or `Date.now`. Time and ids come in through `Providers` / action payloads.
- Rendering projects domain state; it never owns progression or health. An animation ending only acknowledges an already-committed effect.
- Pixel profile and 3D share one `Save`. Standard and challenge are separate saves; a challenge loss never touches the standard save.
- Free feeding, rest, pause and leaving are always available; no paywalls, no reaction timers, no hover-only controls.
- Absence can never kill the challenge puppy. Standard mode has no offline penalties.
- No React/R3F/Drei, physics, backend, multiplayer, analytics.
- Procedural or code-authored characters are labeled as such in the manifest and PROGRESS.md. Never call them final art.
- Book material is incomplete: lesson texts are provisional, no page numbers, no claim of a full book adaptation.

## Shared contracts (do not edit without asking ines-c3)

- `src/simulation/types.ts` — every persisted/simulated shape, actions, effects, scene directive.
- `src/simulation/defaults.ts` — balance constants.
- `src/content/types.ts` — lesson/character/upgrade data shapes.
- `src/render/types.ts` — renderer handle, asset manifest.
- `src/storage/types.ts` — repository and tab-ownership interfaces.
- `src/state/store.ts`, `src/app/appState.ts` — store API and transient app state.

If a contract blocks you, send ines-c3 the exact proposed change and continue on something else.

## Package ownership (parallel sessions)

| Package | Session | Writes only in |
|---|---|---|
| WP-A simulation + rule tests | ines-bc | `src/simulation/{reducer,careClock,lessons,progression,transactions,selectors,save}.ts`, `tests/simulation/**` |
| WP-B content + pixel | ines-96 | `src/content/**` (except `types.ts`), `src/ui/pixel/**`, `tests/content/**`, `scripts/export-pixel.mjs`, `public/assets/pixel/**` |
| WP-C storage + app shell | ines-93 | `src/storage/**` (except `types.ts`), `src/app/{boot,lifecycle,routes,serviceWorker}.ts`, `src/diagnostics/**`, `src/sw.ts`, `public/manifest.webmanifest`, `tests/storage/**` |
| WP-D renderer | ines-1f | `src/render/**` (except `types.ts`) |
| WP-E UI + input + audio | ines-24 | `src/ui/**` (except `pixel/**`), `src/input/**`, `src/audio/**`, `public/assets/audio/**` |
| Integration, assets, e2e, docs | ines-c3 | everything else: `scripts/build-models.mjs`, `scripts/validate-assets.mjs`, `public/assets/models/**`, `public/assets/manifest.json`, `tests/e2e/**`, `PROGRESS.md`, `README.md`, configs |

## Conventions

- Before any npm command: `export npm_config_cache="$TMPDIR/npm-cache"` (the default cache is not writable in the sandbox). Do not add dependencies; ask ines-c3.
- There is no `.git` yet (sandbox blocks creating it). Do not run git commands.
- Commands: `npm run typecheck`, `npm test`, `npm run build`, `npm run dev`, `npm run test:e2e`, `npm run assets:check`.
- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type`). No default exports. Named functions over classes except where Three.js needs instances.
- Game text: German, "du", calm adult tone. Mira speaks short and concrete. No blame, no "falsch". Code and comments: English.
- Every mutating UI action goes through `store.act(...)`/`store.dispatch(...)`; never mutate `Save` in place.
- Keep `PROGRESS.md` honest: only commands actually run, results actually seen.
