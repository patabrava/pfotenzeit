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

## Shared contracts (coordinate changes explicitly)

- `src/simulation/types.ts` — every persisted/simulated shape, actions, effects, scene directive.
- `src/simulation/defaults.ts` — balance constants.
- `src/content/types.ts` — lesson/character/upgrade data shapes.
- `src/render/types.ts` — renderer handle, asset manifest.
- `src/storage/types.ts` — repository and tab-ownership interfaces.
- `src/state/store.ts`, `src/app/appState.ts` — store API and transient app state.

The original `ines-*` sessions below are historical. The continuing integration agent owns coordination: document necessary contract changes in `docs/DECISIONS.md`, update consumers and meaningful tests together, and preserve the settled product rules. Do not wait for or message a historical session unless the user explicitly asks. Broader gameplay/balance changes or new dependencies need a concrete proposal to the user.

## Package ownership (historical implementation map)

| Package | Session | Writes only in |
|---|---|---|
| WP-A simulation + rule tests | ines-bc | `src/simulation/{reducer,careClock,lessons,progression,transactions,selectors,save}.ts`, `tests/simulation/**` |
| WP-B content + pixel | ines-96 | `src/content/**` (except `types.ts`), `src/ui/pixel/**`, `tests/content/**`, `scripts/export-pixel.mjs`, `public/assets/pixel/**` |
| WP-C storage + app shell | ines-93 | `src/storage/**` (except `types.ts`), `src/app/{boot,lifecycle,routes,serviceWorker}.ts`, `src/diagnostics/**`, `src/sw.ts`, `public/manifest.webmanifest`, `tests/storage/**` |
| WP-D renderer | ines-1f | `src/render/**` (except `types.ts`) |
| WP-E UI + input + audio | ines-24 | `src/ui/**` (except `pixel/**`), `src/input/**`, `src/audio/**`, `public/assets/audio/**` |
| Integration, assets, e2e, docs | ines-c3 | everything else: `scripts/build-models.mjs`, `scripts/validate-assets.mjs`, `public/assets/models/**`, `public/assets/manifest.json`, `tests/e2e/**`, `PROGRESS.md`, `README.md`, configs |

## Conventions

- Before any npm command: `export npm_config_cache="$TMPDIR/npm-cache"` (the default cache is not writable in the sandbox). Keep existing dependencies; propose any new dependency to the user with its purpose.
- Git is initialized. Baseline commit `bd09218` predates verification fixes. Inspect status/diff and preserve existing uncommitted changes; never reset or clean them as part of continuation.
- Commands: `npm run typecheck`, `npm test`, `npm run build`, `npm run dev`, `npm run test:e2e`, `npm run assets:check`.
- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type`). No default exports. Named functions over classes except where Three.js needs instances.
- Game text: German, "du", calm adult tone. Mira speaks short and concrete. No blame, no "falsch". Code and comments: English.
- Every mutating UI action goes through `store.act(...)`/`store.dispatch(...)`; never mutate `Save` in place.
- Keep `PROGRESS.md` honest: only commands actually run, results actually seen.

## Creative milestone ownership (active, 2026-10-09)

| Package | Session | Writes only in |
|---|---|---|
| WP-G2 textured contract / vendor ingest (supersedes WP-G) | ines-bc | `scripts/validate-assets.mjs`, `scripts/ingest-vendor.mjs`, `scripts/lib/textures.mjs`, dog generator files, manifest schema fields, `art/staging/**`, `docs/VENDOR_INGEST.md`, pipeline section of `docs/ASSET_REPORT.md` |
| WP-H camera/choreography | ines-1f | `src/render/**` |
| WP-I courtyard/props (humans dropped, D-036) | ines-93 | `scripts/lib/environment.mjs`, static parts of `scripts/build-models.mjs`, environment/prop GLBs and manifest entries, their report sections |
| WP-J lesson HUD | ines-24 | `src/ui/**` (not `pixel/`), `src/input/**`, `src/audio/**` |
| WP-K content readability | ines-96 | `src/content/**` (not `types.ts`), `src/ui/pixel/**`, `tests/content/**`, `public/assets/pixel/**` |
| Integration/review | ines-c3 | configs, `docs/CREATIVE_PLAN.md`, `docs/CREATIVE_REVIEW.md`, `PROGRESS.md`, `docs/DECISIONS.md` |
| WP-L vendor-rig dry run (2026-10-10) | ines-93 (ines-bc closed) | `art/staging/vendor-dryrun/**`, `scripts/dev/make-vendor-dryrun.mjs`, ingest/validator/contract scripts, `docs/VENDOR_INGEST.md` |
| WP-M hero review harness + bone audit (2026-10-10) | ines-1f | `src/render/**` |
| WP-N Blender integration handoff (2026-10-10, after WP-L) | ines-93 | `docs/HANDOFF_HERO_BLENDER_INTEGRATION.md` |
| WP-O clip brief (2026-10-10) | ines-24 (ines-96 closed) | `docs/CLIP_BRIEF.md` |
| Vendor staging hygiene | ines-c3 | `art/vendor-evaluation/README.md`, `.gitignore` |

## Yard life milestone (D-041, active 2026-10-10) — see `docs/WORLD_PLAN.md`

| Package | Session | Writes only in |
|---|---|---|
| Simulation + content for exercises/moments/practice | ines-c3 | `src/simulation/**`, `src/content/**`, `tests/simulation/**`, `tests/content/**`, all `types.ts` contracts |
| WP-P world model + controller | ines-93 | `src/world/**` (not `types.ts`), `tests/world/**`, `src/app/world.ts`, wiring in `src/app/{boot,lifecycle,routes}.ts` |
| WP-Q renderer yard mode | ines-1f | `src/render/**` (not `types.ts`) |
| WP-R UI + input | ines-24 | `src/ui/**` (not `pixel/`), `src/input/**`, `src/audio/**` |

All five creative packages were delivered and sandbox-verified on 2026-10-09 (see `docs/CREATIVE_REVIEW.md`); the sessions are idle. Outside-sandbox verification follows `docs/HANDOFF_VERIFICATION.md` §11. The user rejected the angular CC0 dogs. Three smooth, textured CC BY puppy variants are now integrated. Read `docs/HANDOFF_SOFT_PUPPY_MODELS.md` before replacing or regenerating them; the earlier CC0 handoff is historical. Premium sourcing research is historical.

Git exists (baseline `bd09218`); uncommitted verification fixes must be preserved. Sessions do not run git commands.

## Current continuation handoff

Read `docs/WORLD_PLAN.md` + `docs/WORLD_REVIEW.md` (yard life, D-041), `docs/CREATIVE_REVIEW.md` (art milestone), `docs/HANDOFF_CREATIVE_FABLE_5_1.md` and `docs/VERIFICATION_REPORT.md` for verified behavior. Game rules and architectural boundaries above remain binding; the world model (`src/world`) is transient and never persisted.

Current human art: integrated textured CC0 Grab3D Mira/Alex with native vendor rigs. Read `docs/HANDOFF_SOFT_HUMAN_MODELS.md`; preserve integrated vendor humans during regeneration and the source AI-assisted disclosure.
