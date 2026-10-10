# WP-L — Vendor-rig dry run through ingest, validator and manifest (session: ines-93, reassigned 2026-10-10; ines-bc window closed)

Read first: `docs/VENDOR_INGEST.md` (yours), `docs/DECISIONS.md` D-036/D-038, `docs/HANDOFF_PREMIUM_ASSET_SOURCING.md` steps 5–6, `scripts/lib/assetContract.mjs`.

## Why
The real hero file (candidate A) will arrive with a vendor skeleton, vendor clip names, probably root motion on the walk and clips we must never map to stress semantics. Every validator path for `rig: 'vendor'` and `clipMap` is currently untested on a real file because the staged candidates use the project rig and identity clip names. Prove the path now so the purchased file is a data problem, not a code problem.

## You own
`art/staging/vendor-dryrun/**`, `scripts/dev/make-vendor-dryrun.mjs` (new, gltf-transform only), `scripts/ingest-vendor.mjs`, `scripts/validate-assets.mjs`, `scripts/lib/{textures,assetContract}.mjs`, `docs/VENDOR_INGEST.md`. No `src/**`, no `public/**`, no deps, no git.

## Build a synthetic vendor file from `art/blender-reference-pass-2026-10-09/candidates/dog_nala_puppy.glb`
`node scripts/dev/make-vendor-dryrun.mjs` writes `art/staging/vendor-dryrun/input/vendor_puppy.glb`:
- rename every bone to a vendor-ish name (`DEF-spine.001`, `Bone.014`, …), keep hierarchy and weights; rename the skin and mesh;
- rename the 13 clips to vendor names (`Idle_Loop`, `LookLeft`, `Sniff01`, `Walk_FWD`, `Sit_Down`, `LieDown`, `Sleep_Loop`, `Eat01`, `PlayBow`, `TurnAway`, `Alert_Idle`, `Tired_Idle`, `GetUp`);
- add two extra clips: `Attack01` (copy of Alert_Idle) and `Walk_RootMotion` (Walk_FWD plus 0.4 m root translation over the clip);
- leave textures/material untouched.
Write `art/staging/vendor-dryrun/clipmap.json` mapping all 13 semantics to the vendor names (walk → `Walk_FWD`).

## Run and prove
1. `node scripts/ingest-vendor.mjs art/staging/vendor-dryrun/input/vendor_puppy.glb --key dog.nala.puppy --out art/staging/vendor-dryrun/staged --clipmap art/staging/vendor-dryrun/clipmap.json` → inventory shows 15 clips, 26 joints with vendor names; draft entry has `rig: 'vendor'`, `clipMap`, `sourceClips` (15), `clips` (13 semantics), `status: 'pending'`.
2. `node scripts/validate-assets.mjs --staging art/staging/vendor-dryrun/staged` → green (vendor rig path: influences, weights, scale, min y, forward +Z, shoulder by bounds since bone names are unknown).
3. Negative cases, each must FAIL with a readable line (keep the files, name them `*.expect-fail.*`): (a) clipmap with `tense_idle: 'Attack01'`; (b) clipmap with `walk: 'Walk_RootMotion'`; (c) manifest `clips` missing `recover`; (d) manifest `drawCalls: 1` while the file has 2 primitives (split the mesh into two primitives in a variant).
4. Document in `docs/VENDOR_INGEST.md` under "Dry run (synthetic vendor file)" with the real output of 1–3 and the exact commands.

## Hand-off to ines-1f
Message ines-1f the path of `art/staging/vendor-dryrun/staged/manifest.json` so the Node render check loads the vendor-named file through `clipMap` (WP-M part 3). If ines-1f asks for a manifest `attachments` field (bone-name map for things the renderer attaches), add it to the contract and validator with the exact names they propose and tell me.

## Report to ines-c3
Commands with real output, the list of validator messages the negative cases produced, anything the vendor path could not check without a real file.
