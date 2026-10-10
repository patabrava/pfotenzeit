# Fable 5.1 handoff: polished human replacements

The user asked to replace the human models after approving the textured puppies. Both live human slots now use adapted Grab3D characters: **Mira = Casual Woman**, **Alex = Casual Man**. Keep the mobile-first German prototype and the ongoing lesson-animation work. This change owns human art, its source/rebuild pipeline, attribution, regeneration protection and verification; it changes no simulation, content, balance or saves.

## Sources and rights

- https://grab3d.com/models/characters/woman/
- https://grab3d.com/models/characters/man/
- Official rigged GLBs: `https://grab3d.com/dl/woman-rigged/woman-rigged.glb` and `https://grab3d.com/dl/man-rigged/man-rigged.glb`.
- Both are **CC0 1.0**. Source license copies are retained with the downloads and in `public/assets/licenses/Grab3D-CC0-1.0.txt`; the game settings and `public/assets/CREDITS.md` disclose sources and modifications.
- Grab3D explicitly discloses **AI-assisted Meshy base mesh/textures, cleaned in Blender**. Preserve this disclosure for any future store/platform requiring it. Do not represent these as entirely manually sculpted originals.
- Original files and source hashes: `art/soft-humans-2026-10-10/original/`, each manifest entry's `sourceSha256`, and `reports/adaptation.json`.

## Live files and contracts

- `public/assets/models/human_mira.glb`: 10,909 triangles, 1.70 m.
- `public/assets/models/human_alex.glb`: 10,987 triangles, 1.76 m.
- One material/draw call per model. 1024² JPEG color + 256² JPEG normal maps; estimated decoded textures with mips ≈5.65 MiB each. Existing 6 MiB texture budget remains unchanged.
- Native vendor skeleton: 58 joints including four editable hand/foot IK controls. Each vertex has at most four normalized skin weights. Byte weights sum exactly 255, with zero-weight joint indices cleared. No compression decoder or dependency added.
- `idle` (4 s loop), `greet` (1.5 s), `gesture_explain` (2 s), `offer_reward` (2 s), `kneel` (1.5 s). Identity semantic `clipMap`; source walk/run are removed from shipping assets, not substituted for gestures.
- `rig:'vendor'`, `material:'textured'`, `productionIntegrated:true`; status remains prototype `code-authored`, not final approved art. Do not impose project skeleton names on these vendor models.
- The legacy `scripts/build-models.mjs` human builder now preserves integrated vendor files and manifest entries. Missing integrated files fail instead of silently regenerating the rejected figures. Dogs have their existing equivalent protection.
- Asset-only service-worker updates use the existing manifest fingerprint. Build again whenever model files/manifest change.

## Editable Blender files and regeneration

Under `art/soft-humans-2026-10-10/`: `mira_source.blend`, `alex_source.blend`, `mira_training.blend`, `alex_training.blend`, and their exported training GLBs. Original downloads are immutable. `before/` contains the replaced human GLBs and manifest; the previous GUI session was preserved before opening the new character. Blender is open with Mira's training rig.

The saved Python script imports sources with no downloaded script execution, removes the unrelated source Icosphere, clears source actions, corrects imported bone lengths without changing bind rotations, applies scale, welds duplicate geometry seams before decimation, smooths normals while preserving sharp creases, reduces maps, normalizes dimensions and grounds the bind pose. Native hand/foot IK and flat-shoe orientation constraints create the five baked gestures. Welding **before** decimation is essential: a first un-welded attempt caused visibly broken seams and was rejected.

From project root, use the existing official Blender MCP runner:

```sh
/Users/patabrava/.codex/integrations/blender/venv/bin/python \
  art/blender-reference-pass-2026-10-09/scripts/mcp_run.py \
  art/soft-humans-2026-10-10/scripts/export_humans.py \
  art/soft-puppies-2026-10-10/puppy_training.blend
node scripts/build-soft-humans.mjs
node scripts/validate-assets.mjs --staging art/soft-humans-2026-10-10/candidates
node art/soft-humans-2026-10-10/scripts/verify_candidates.mjs
node scripts/build-soft-humans.mjs --ship
```

The runner's starting blend is only a background-process seed; the export script builds each human from its downloaded GLB. Node optimization repairs degenerate UV tangents, promotes skinned meshes to scene roots, packs core-compatible weights/joints, closes loop endpoints and validates candidates before shipping. `--ship` also checks the **combined live eight-model 8 MiB budget**, preserving current dog entries rather than writing an old manifest snapshot.

## Verification and coordination

Evidence is retained under `art/soft-humans-2026-10-10/reports/`. Never claim a pass without the matching log. The current expanded suite passed 225 tests / 21 files with serialized workers. A simultaneous full-suite run timed out in two DOM cases and ledger pruning while the machine was busy; keep that report as `unit-tests-concurrent-timeouts.log`, and rerun with the unchanged test assertions/timeouts and serialized workers.

```sh
export npm_config_cache="$TMPDIR/npm-cache"
npm run assets:check
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
node art/soft-humans-2026-10-10/scripts/verify_regeneration.mjs
node art/soft-humans-2026-10-10/scripts/verify_candidates.mjs
node art/soft-humans-2026-10-10/scripts/verify_e2e.mjs
node art/soft-humans-2026-10-10/scripts/verify_ui.mjs
node art/soft-humans-2026-10-10/scripts/verify_renderer.mjs
```

The E2E runner copies an immutable source/public/test snapshot into a temporary directory and starts a fresh production preview on an available port. This avoids the observed shared port 4173 preview serving stale characters. Its six tests run in all three viewport projects. A new test checks the exact service-worker-served hashes, source/rights, five semantic clips and settings credits of **both humans**; the existing puppy provenance test remains strict. Concurrent lesson work increased puppy semantics from 13 to 16 (`alert_focus`, `rest_side`, `stand_up`): its count expectation was aligned to 16 without changing those animations or the lesson behavior. The L03 wake response now uses `tired_idle` in the companion task; its old `rest_loop` content-test expectation was aligned to that existing response without editing lesson content. The first old-preview run failed six provenance cases; the isolated run passed. Retain failure evidence rather than claim the old-preview run passed.

Candidate verification samples five times in every clip, checks all deformed vertices for finite values, rejects an exploded rig or excessive below-ground bounds, and captures all five poses. There is one skinned mesh in each selected human. The regeneration check compares the exact hashes and manifest entries of all five integrated characters. The renderer runner also uses an immutable frontend/public snapshot; an attempted live-checkout rerun was interrupted by a navigation during concurrent edits. Earlier reports in `reports/renderer/`, `renderer-final/` and `renderer-paused-props-before-fix/` retain failures/interruption evidence. The parallel “Launch the game locally” task deliberately keeps dog tail/breathing and moving toys active during lesson observation. Observation `hold` is therefore not a full animation pause. An initial attempt to freeze edge props during hold was withdrawn after checking that companion request. Preserve the ongoing lesson behavior. The browser verifier now explicitly requires **positive observation frames** and **zero inactive / reduced-motion held frames**; it does not merely drop the old zero-frame assertion. Run software WebGL checks sequentially. The UI harness checks keyboard use and 200% text.

The new native kneeling clip exposed a separate, genuine compatibility issue: the human loader's legacy loop set repeated a clip whose manifest specifies `loop:false`, standing the trainer up every cycle. Vendor human loop selection now honors `entry.clipMeta`, falling back to the legacy set only when metadata is absent. `tests/render/human-clip-metadata.test.ts` failed before the fix and verifies that the actual integrated native rig stays at its kneeling endpoint across more than two clip durations. Gesture explanation also follows its authored one-shot contract.

Before/after comparisons use the actual renderer with the same camera/light and pose, not promotional renders: `reports/comparison-mira/`, `reports/comparison-alex/`. Individual native-clip renders and the actual Blender window screenshot are in `renders/`.

Remaining acceptance: physical mobile GPU FPS/touch/OS background behavior, professional animation/training review and final art approval. No backend exists. Keep real-phone performance unclaimed; software-renderer FPS does not establish device FPS. Consider improving trainer clothing and adding a treat prop in a future art pass while preserving this friendly face/hair quality and mobile budgets.


## Observed completion

- Build/typecheck pass. Expanded full unit suite: **225 tests / 21 files**, serialized workers, unchanged assertions and timeouts.
- Production browser smoke: **18 cases / 3 projects** pass against an immutable snapshot, including both model hashes and source credits.
- All **8 GLBs** validate with zero glTF errors/warnings/info and fit the existing combined budget; current per-file numbers/hashes are in `reports/completion.json`.
- All **50 human pose/time samples** and **46 UI checks** pass. Isolated procedural regeneration preserves five exact character files and entries.
- Final immutable WebGL verification passes **all 5 viewports**, zero page errors, positive observation motion, zero inactive frames and zero reduced-motion held frames. Both people are GLB assets; before/after comparison reports separately verify Alex as well as Mira.
- Physical-phone performance remains unmeasured. Human models are prototype adaptations, with final animation/art review open.
