# Vendor asset ingest and the textured asset contract (WP-G2, D-036)

How a professionally authored GLB (vendor file or Blender export) gets measured, normalized, staged
and validated against the project contract before anybody decides to ship it. The Node side runs inside
the sandbox with the existing dependencies only (`@gltf-transform/*`, `gltf-validator`, `node:zlib`);
everything that needs Blender runs outside the sandbox (D-037).

## Commands

```sh
export npm_config_cache="$TMPDIR/npm-cache"      # before any npm command in this environment

# 1. stage one file: --out is any directory outside public/ (art/staging/<name>/ for test inputs,
#    art/vendor-evaluation/<vendor>/<asset>/staged/ for licensed files, see art/vendor-evaluation/README.md)
node scripts/ingest-vendor.mjs <input.glb> --key dog.nala.puppy --out <dir>/ \
     [--name <basename>] [--clipmap map.json] [--max-texture 1024] [--quantize] \
     [--source "..."] [--license "..."]

# 2. validate everything staged in that directory (pending entries are fully checked)
node scripts/validate-assets.mjs --staging <dir>

# 3. live assets, unchanged behaviour
npm run assets:check
```

`--key` is the manifest key the file is meant for (it decides dog/human/static semantics and the
expectations table). `--name` defaults to the input basename. `--clipmap` is a JSON object
`{ "<semantic>": "<vendor clip name>" }`; semantics that are not listed are resolved by exact name, then
by a loose match (case, `_`, `-` and spaces ignored; reported as `autoMatched`). D-040 adds an object form
per semantic, `"eat": { "clip": "Eat01", "events": { "treat_received": 2.4 } }`, whose events replace the
semantic defaults in `clipMeta[semantic].events`; the validator then requires every event time to lie
strictly inside the clip and `eat` to carry `treat_received`. **Status 2026-10-10: applied and CLI-verified** (`scripts/dev/verify-d040.mjs`). `--quantize` applies
gltf-transform `quantize()` (adds `KHR_mesh_quantization`, which three's GLTFLoader supports natively).

The ingest refuses an `--out` inside `public/`. Shipping is a reviewed step of the owning work package:
copy the staged GLB to its 08 path, merge the draft entry into `public/assets/manifest.json`, set the
real `status`, `source` and `license`, and run `npm run assets:check`.

## What the ingest does

1. Reads the GLB header and refuses files whose extensions need a decoder the app does not ship
   (`KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu`, `EXT_texture_webp`,
   `EXT_texture_avif`): decode and re-export those outside the sandbox first.
2. Prints and records an inventory before and after normalization: bytes, triangles, vertices, draw
   calls, meshes/primitives (semantics, index type, material), materials (double-sided, alpha mode,
   texture per slot), textures (slot, size, bytes, mime, decoded estimate), skins and joint names,
   skeleton root, max influences, skin-weight sanity, animations (duration, channels, loop closure,
   root translation, interpolation), bounds, scale problems.
3. `prune({ keepAttributes, keepLeaves })` → `dedup()` → PNG textures above `--max-texture` are
   decoded (node:zlib), box-filtered to the nearest power of two per side ≤ cap and re-encoded (RGB or
   RGBA, per-line filter heuristic, deflate 9). JPEG textures above the cap are flagged, not resized
   (no JPEG decoder without a dependency). Averaging happens in the stored encoding (sRGB stays sRGB,
   normals are not renormalized) — acceptable for a staging pass, a Blender bake is the quality path.
4. Optional `quantize()`.
5. Runs gltf-validator on the output, resolves the semantic clip map, measures shoulder height (dogs
   with project joint names) or bounds height (humans), classifies the rig as `project` (joint list
   exactly the 26/32-bone dog or 20-bone human rig) or `vendor`.
6. Writes `<name>.glb`, `<name>.report.json` (everything above plus `nextSteps`), `<name>.manifest-entry.json`
   and merges the entry into `<out>/manifest.json` (`{ version: 2, staging: true, assets }`).

## Manifest entry fields (D-036)

Written by the ingest as a draft with `status: "pending"` and `productionIntegrated: false`; the loader
reads the same names. Existing entries keep working: absent `material` means `vertex`, absent `rig`
means `project`, absent `clipMap` means identity.

| field | type | meaning |
|---|---|---|
| `url` | string | relative path (`assets/models/x.glb` live, `<name>.glb` in staging) |
| `status` | `code-authored` \| `final` \| `pending` \| `placeholder` | pending/placeholder entries are skipped by the live check and fully checked in `--staging` |
| `productionIntegrated` | boolean | `false` on every staged draft |
| `material` | `vertex` \| `textured` | vertex colours only vs. PBR textures |
| `textures` | `[{ slot, width, height, bytes, mime }]` | one row per (texture, slot); slots `baseColor` \| `normal` \| `metallicRoughness` \| `occlusion` \| `emissive` |
| `textureSizes` | `number[]` | legacy field kept for the current loader type: max side per texture (empty for vertex) |
| `drawCalls` | number | primitives reachable from the default scene |
| `rig` | `project` \| `vendor` | `project` = exact 26/32-bone dog or 20-bone human list; `vendor` = any skeleton. Live entries written by `build-models.mjs` still carry the legacy object `{ joints, maxInfluences }`, which the validator and loader must read as `project` |
| `rigInfo` | `{ joints, maxInfluences, root }` | measured rig facts |
| `clipMap` | `Record<semantic, vendorName>` | semantic clip → animation name in the file |
| `clips` | string[] | the semantic names (13 dog / 5 human) |
| `sourceClips` | string[] | animation names actually in the file |
| `missingClips` | string[] | only present when semantics are unresolved |
| `bytes`, `triangles`, `boundsMeters` | | measured on the staged file |
| `measuredShoulderHeightM` / `measuredHeightM` | number | dogs with project joint names / humans |
| `source`, `license` | string | provenance; the license default is `UNVERIFIED …` until the purchase record and browser-delivery permission exist |
| `version` | 2 | entry schema version |
| `clipMeta` | `Record<semantic, { durationS, loop, events?, source? }>` | duration from the mapped clip, loop/events from the semantic defaults, `source` when renamed |

## What `validate-assets.mjs` checks

All current checks for the live vertex-colour assets are unchanged (see `docs/ASSET_REPORT.md`). On
top, per entry:

- **Extensions**: none for `material: vertex`; for textured files only extensions three handles without
  a decoder (`KHR_mesh_quantization`, `KHR_texture_transform`, the `KHR_materials_*` set); decoder
  extensions and unknown extensions fail.
- **Textured material**: file has textures; manifest `textures` equals the measured list; each texture
  ≤ 1024² (dogs, humans) or ≤ 2048² (environment); PNG or JPEG only; decoded estimate
  `width × height × 4 × 1.33` summed over unique textures ≤ 12 MiB per character (D-040: two 1024² maps;
  the shared script cap is now 12 MiB); primitives with a
  textured material need `TEXCOORD_0`; a normal map without `TANGENT` is a warning (three derives
  tangents per fragment, MikkTSpace is not guaranteed). baseColor sRGB flagging is checked by slot in the
  loader, not here.
- **Draw calls** ≤ 3 per character, ≤ 12 environment/props; `drawCalls` in the manifest must match.
- **Rig**: `project` → the 26-bone (08) or 32-bone (D-033) dog list or the 20-bone human list, exact
  order; when the 32-bone list is present the six face bones are required. `vendor` → any skeleton, but
  ≤ 4 influences (`JOINTS_1` fails), weights sum to 1 with no unweighted vertex, scene-root scale 1, no
  negative scale anywhere, min y within ±1 cm, dog nose toward +Z (mean z of the top 20 % height band
  > 0), shoulder height by joint names when `spine_02`/`leg_f*_upper` exist (±10 %) else bounds height
  ÷ 1.4 within ±15 %; humans by bounds height ±3 %.
- **Clips**: `clips` must be the semantic list, `sourceClips` the file's names, every semantic resolves
  through `clipMap` to an existing animation; durations equal `clipMeta`; loop clips close
  (first ≈ last keyframe) or are deliberately flagged `loop: false`; events inside the clip; `walk` has
  no translation on the skeleton root/scene roots (> 1 mm range fails); `tense_idle`, `tired_idle`,
  `recover`, `turn_away` must not map to clips named like attack/death/bite/hurt/… (string check).
- **Budgets** stay: dogs ≤ 18k triangles / ≤ 3 MB, humans ≤ 2 MB, courtyard ≤ 20k, total ≤ 8 MB for
  the live manifest (only reported in staging mode).

## Proof run: Blender reference-pass candidates (2026-10-09)

The five candidates in `art/blender-reference-pass-2026-10-09/candidates/` (textured with one PNG
normal map each, 26/20-bone project rig, 13/5 clips) were staged into `art/staging/blender-reference/`
with `--max-texture 1024` and validated. No file changed size: prune/dedup found nothing to remove and
every texture is already within the cap.

| key | staged bytes | triangles | texture | decoded est. | draw calls | rig | clips | validator | measured |
|---|---:|---:|---|---:|---:|---|---:|---|---|
| dog.nala.puppy | 2,032,320 | 17,680 | normal 1024² PNG 440,031 B | 5.32 MB | 1 | project 26 | 13/13 | 0E/0W/0I | shoulder 0.290 m |
| dog.nala.growing | 2,030,884 | 17,680 | normal 1024² PNG 465,581 B | 5.32 MB | 1 | project 26 | 13/13 | 0E/0W/0I | shoulder 0.380 m |
| dog.bruno.puppy | 2,034,532 | 17,680 | normal 1024² PNG 453,685 B | 5.32 MB | 1 | project 26 | 13/13 | 0E/0W/0I | shoulder 0.323 m |
| human.mira | 1,646,428 | 15,499 | normal 512² PNG 134,904 B | 1.33 MB | 1 | project 20 | 5/5 | 0E/0W/0I | height 1.701 m |
| human.alex | 1,509,584 | 15,500 | normal 512² PNG 138,260 B | 1.33 MB | 1 | project 20 | 5/5 | 0E/0W/0I | height 1.756 m |

`node scripts/validate-assets.mjs --staging art/staging/blender-reference` → all five `ok`, total
9,253,748 bytes (above the 8 MB live budget — reported, not enforced in staging; the live cast would need
to ship fewer characters up front or smaller normal maps). The resize path was exercised separately
with `--max-texture 512` on Bruno into a temp directory: 1024² → 512² normal map, 453,685 → 134,253 B,
file 2,034,532 → 1,715,100 B, mean texel value preserved, 0 validator errors, staging check green.

Reports: `art/staging/blender-reference/<name>.report.json`, draft entries
`<name>.manifest-entry.json`, combined `art/staging/blender-reference/manifest.json`.

## Dry run (synthetic vendor file, WP-L, 2026-10-10)

The purchased hero file will arrive with a vendor skeleton, vendor clip names, probably root motion on the
walk and clips that must never fill a stress semantic. Until it exists, `scripts/dev/make-vendor-dryrun.mjs`
(gltf-transform only, no Blender) builds a synthetic vendor file from the staged Blender reference candidate
so every `rig: 'vendor'` / `clipMap` path above is proven on a real GLB. Everything lives in
`art/staging/vendor-dryrun/`; `input/` is regenerable, nothing here is a shipping candidate.

What the generator changes in `art/blender-reference-pass-2026-10-09/candidates/dog_nala_puppy.glb`:
all 26 bones renamed to vendor-ish names (`Armature_Root`, `DEF-hips`, `DEF-spine.001`, `mixamorig:Head`,
`Bone.014`–`Bone.016` for the tail, `DEF-upper_arm.L` … `DEF-foot.R`; hierarchy and weights untouched),
skin → `Armature`, mesh → `GoldenRetrieverPuppy_LOD0`, material → `M_Puppy_Fur`; the 13 clips renamed to
`Idle_Loop, LookLeft, Sniff01, Walk_FWD, Sit_Down, LieDown, Sleep_Loop, Eat01, PlayBow, TurnAway, Alert_Idle,
Tired_Idle, GetUp`; two extra clips added: `Attack01` (copy of Alert_Idle) and `Walk_RootMotion` (Walk_FWD plus a
0.4 m +Z translation channel on the skeleton root). Textures and material values are untouched. A second
variant `vendor_puppy_2prims.glb` splits the body indices into two primitives for the draw-call case.
`clipmap.json` maps all 13 semantics to the vendor names (walk → `Walk_FWD`).

```sh
export npm_config_cache="$TMPDIR/npm-cache"
node scripts/dev/make-vendor-dryrun.mjs
node scripts/ingest-vendor.mjs art/staging/vendor-dryrun/input/vendor_puppy.glb --key dog.nala.puppy \
     --out art/staging/vendor-dryrun/staged --clipmap art/staging/vendor-dryrun/clipmap.json
node scripts/validate-assets.mjs --staging art/staging/vendor-dryrun/staged
# negative cases
node scripts/ingest-vendor.mjs art/staging/vendor-dryrun/input/vendor_puppy_2prims.glb --key dog.nala.puppy \
     --out art/staging/vendor-dryrun/expect-fail/d-drawcalls-1-vs-2 --clipmap art/staging/vendor-dryrun/clipmap.json
node scripts/dev/make-vendor-dryrun.mjs --negatives
for c in a-tense-idle-attack b-walk-rootmotion c-missing-recover d-drawcalls-1-vs-2; do
  node scripts/validate-assets.mjs --staging art/staging/vendor-dryrun/expect-fail/$c; echo "exit $?"; done
```

### 1. Ingest (real output, 2026-10-10)

```
ingest art/staging/vendor-dryrun/input/vendor_puppy.glb → art/staging/vendor-dryrun/staged/vendor_puppy.glb  (key dog.nala.puppy, kind dog)
  generator: glTF-Transform v4.5.1; extensions used: none
  [input] 2037600 B, 17680 tris, 18141 verts, 1 draw calls, 1 meshes, 1 materials, bounds 0.183x0.391x0.730 m
  [input] textures: normal:1024x1024 image/png 440031 B; decoded estimate 5.32 MB
  [input] skins: Armature (26 joints); animations: Idle_Loop 4s, LookLeft 1.5s (open), Sniff01 2.5s, Walk_FWD 1s, Sit_Down 1.5s (open), LieDown 1.5s (open), Sleep_Loop 5s, Eat01 4s (open), PlayBow 1.5s (open), TurnAway 1.5s (open), Alert_Idle 2.5s, Tired_Idle 3.5s, GetUp 2s (open), Attack01 2.5s, Walk_RootMotion 1s (open) (root translation)
  [staged] 2037600 B, 17680 tris, 18141 verts, 1 draw calls, 1 meshes, 1 materials, bounds 0.183x0.391x0.730 m
  textures: dog_nala_puppy_surface_normal 1024x1024→1024x1024 unchanged
  gltf-validator: 0E/0W/0I
  rig: vendor (26 joints, max 4 influences, root Armature_Root); shoulder n/a; min y 0.0002
  clips: 13/13 semantics resolved
  wrote art/staging/vendor-dryrun/staged/vendor_puppy.glb (2037600 B, was 2037600 B), vendor_puppy.report.json, vendor_puppy.manifest-entry.json, manifest.json
```

Draft entry (`staged/vendor_puppy.manifest-entry.json`): `status: "pending"`, `productionIntegrated: false`,
`material: "textured"`, `drawCalls: 1`, `rig: "vendor"`, `rigInfo: { joints: 26, maxInfluences: 4, root: "Armature_Root" }`,
`clipMap` = the 13 vendor names, `clips` = the 13 semantics, `sourceClips` = 15 file names (incl. `Attack01`,
`Walk_RootMotion`), no `missingClips`, no `measuredShoulderHeightM` (no project joint names, so the validator
falls back to bounds). The inventory marks `Walk_RootMotion` with `(root translation)` and the non-loop
clips with `(open)`; loop clips (Idle_Loop, Sniff01, Walk_FWD, Sleep_Loop, Alert_Idle, Tired_Idle) close.

### 2. Validator, vendor path (real output)

```
staging mode: …/art/staging/vendor-dryrun/staged/manifest.json
asset               status        mat/rig                bytes    tris clips  validator   result
dog.nala.puppy      pending       textured/vendor      2037600   17680    15  0E/0W/0I    ok  (pending entry fully checked (staging mode); textures 1, decoded ≈ 5.32 MB; baseColor sRGB flagging is the loader's job (by slot); 1 draw call(s); clipMap: 13 renamed; vendor rig Armature: 26 joints; meshes GoldenRetrieverPuppy_LOD0; materials M_Puppy_Fur; shoulder ≈ 0.279 m from bounds (vendor rig))

total model bytes: 2,037,600 (budget 8,388,608, reported only in staging mode)

all staging checks passed
```
exit 0. Exercised on the vendor path: ≤ 4 influences, weights sum to 1, root scale 1 / no negative scale, min y
within ±1 cm (0.0002), nose toward +Z, shoulder from bounds height ÷ 1.4 (0.279 m vs 0.28 ±15 %), every semantic
resolved through `clipMap`, durations vs `clipMeta`, loop closure, no root translation on the mapped walk,
stress semantics not mapped to attack/death names, `Attack01`/`Walk_RootMotion` present in `sourceClips` but
unused.

### 3. Negative cases (each must fail; files kept under `expect-fail/`)

(a) and (b) are the entries the ingest writes with `clipmap.a-tense-idle-attack.expect-fail.json` /
`clipmap.b-walk-rootmotion.expect-fail.json` (the ingest itself accepts both maps and reports
`13/13 semantics resolved`; the rejection is the validator's job). Their `url` points at the staged GLB
(`../../staged/vendor_puppy.glb`) so the 2 MB file is not duplicated. (c) removes `recover` from `clips`.
(d) is the real ingest of the two-primitive variant with `drawCalls` patched from 2 to 1.

```
--- a-tense-idle-attack
dog.nala.puppy      pending       textured/vendor      2037600   17680    15  0E/0W/0I    FAIL  (…)
    - tense_idle is mapped to "Attack01", which reads as attack/death (not allowed for stress/fatigue semantics)
1 asset check(s) failed
exit 1
--- b-walk-rootmotion
dog.nala.puppy      pending       textured/vendor      2037600   17680    15  0E/0W/0I    FAIL  (…)
    - walk loop does not close (max endpoint diff 4.00e-1); fix the clip or set loop:false deliberately
    - walk has root translation (range 0.400 m); walk must animate in place
1 asset check(s) failed
exit 1
--- c-missing-recover
dog.nala.puppy      pending       textured/vendor      2037600   17680    15  0E/0W/0I    FAIL  (…)
    - manifest clips must be the semantic list idle_relaxed,look_at_handler,sniff,walk,sit,lie_down,rest_loop,eat,play_bow,turn_away,tense_idle,tired_idle,recover
1 asset check(s) failed
exit 1
--- d-drawcalls-1-vs-2
dog.nala.puppy      pending       textured/vendor      2037844   17680    15  0E/0W/0I    FAIL  (…; 2 draw call(s); …)
    - manifest drawCalls 1 ≠ 2
1 asset check(s) failed
exit 1
```

### What the dry run cannot prove

The synthetic file keeps the project's hierarchy, rest pose, weights and clip timing, so it does not exercise:
a skeleton with a different joint count or a non-identity scene-root transform, PBR baseColor/roughness
textures and multiple materials (only one normal map is present), JPEG textures, quantized or
extension-bearing files, clips with root motion on a node other than the skeleton root, blend-shape
(morph) targets, or loose clip-name matching on real vendor names (all 13 are mapped explicitly here).
Shoulder height is only checked by the bounds fallback; a real vendor rig with a tall ear or tail silhouette
may need the ratio in `BUDGET.dogHeightToShoulder` revisited. No renderer load is part of this run
(WP-M part 3 loads `art/staging/vendor-dryrun/staged/manifest.json` in the Node render check).

## What still needs Blender (outside the sandbox, D-037)

- Authoring or retargeting missing semantic clips for a vendor rig (the ingest lists them under
  `missingClips`/`nextSteps`); baking CAT/Unity/Unreal runtime animation to skeletal clips.
- Fixing loop clips that do not close, or deciding `loop: false`.
- LOD/decimation to the 12–18k budget (candidate A lists 38k triangles), atlas baking, re-baking normal
  maps after decimation, fur-card cleanup.
- Fitting the harness and the growing variant on a vendor body.
- Anything that changes the `.blend` or needs a GPU (headless Blender segfaults in the sandbox).

## Not done here

No purchase, no seller contact, no dependency added (no sharp, no KTX2/Meshopt decoders). The loader
side (`src/**`) is WP-? / ines-1f: `material`, `textures` (sRGB for `baseColor`), `rig`, `clipMap`
and `sourceClips` are read from the same entry.
