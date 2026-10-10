# Smooth textured puppies — implementation handoff for Fable 5.1

The user rejected the angular Quaternius dogs. All three live dog slots now use smooth, textured derivatives of a downloaded Labrador puppy. Do not restore the rejected low-poly look when regenerating the courtyard. This pass changes assets, credits and validation; game rules and saves remain intact.

## Source and rights

[Dog Puppy by kenchoo](https://sketchfab.com/3d-models/dog-puppy-72331763040e4314b154f84348fe0957), based on [3d dog cute by Tech developers](https://skfb.ly/6WMyH), is offered under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The official download was obtained after the user signed in. No viewer extraction was used.

The original archive is `art/soft-puppies-2026-10-10/original/dog-puppy.zip`; its extracted GLB is `original/download/source/dog puppy.glb`. Source GLB SHA-256: `45bbe4ae0561c49f0dd1bc821305b577dd75b9c8cd8cc011dae6adc409990811`. No separate license file was included in the archive; `original/ATTRIBUTION.txt` records the license and credits observed on the official page/download dialog. Both authors, source links, license and modification notice are accessible under **Einstellungen → 3D-Modelle und Lizenzen**, as well as `public/assets/CREDITS.md` and `public/assets/licenses/Puppy-CC-BY-4.0.txt`. Preserve attribution with distribution.

## What ships

| Slot | Appearance | Bytes | Triangles | Model draws |
|---|---|---:|---:|---:|
| dog.nala.puppy | Gold coat, puppy proportions | 1,510,096 | 14,844 | 1 |
| dog.nala.growing | Taller, weighted head shrink of 10% | 1,511,200 | 14,844 | 1 |
| dog.bruno.puppy | Chocolate coat | 1,510,952 | 14,844 | 1 |

Both characters derive from one Labrador source; these are not three independently sourced breed models. Nala keeps the existing 0.28/0.36 m shoulder targets and Bruno 0.31 m. Material is textured PBR, with smooth normals, exported tangents, 1024² JPEG fur color and 256² PNG normal map; decoded estimate ≈5.65 MiB per model. No new dependencies/decoders. Total eight live GLBs: **5,744,136 bytes**, under the 8 MiB contract.

The source rig has 45 joints. Four retained paw IK controls make the exported rig 49 joints, with ≤4 influences. Flat-paw orientation constraints prevent the wrists/hocks from turning pads upward. Twelve educational motions are authored and baked on this skeleton; original idle is retained with gentler amplitude for mobile close-ups. All thirteen semantic names/durations remain unchanged, walk is in place, and loops close. Assets retain prototype `code-authored` status because of the adaptation and authored clips; they are not asserted as final art.

## Editable sources and reproduction

- `art/soft-puppies-2026-10-10/puppy_source.blend`: isolated source import.
- `art/soft-puppies-2026-10-10/puppy_training.blend`: editable native skeleton, controls and thirteen actions, currently open in Blender.
- `art/soft-puppies-2026-10-10/scripts/export_puppy.py`: original bind normalization, material optimization, controls and educational actions.
- `scripts/build-soft-puppies.mjs`: variant geometry/materials, gentler idle, durations, optimization, validation and staged shipping.
- `art/soft-puppies-2026-10-10/before/`: previous live dog GLBs/manifest plus saved GUI scene before opening the puppy.

Run from `/Users/patabrava/Documents/AI/github/Camilo/Ines`:

```sh
/Users/patabrava/.codex/integrations/blender/venv/bin/python art/blender-reference-pass-2026-10-09/scripts/mcp_run.py art/soft-puppies-2026-10-10/scripts/export_puppy.py art/soft-puppies-2026-10-10/puppy_source.blend
node scripts/build-soft-puppies.mjs
node scripts/validate-assets.mjs --staging art/soft-puppies-2026-10-10/candidates
node art/soft-puppies-2026-10-10/scripts/verify_candidates.mjs
# Only after inspecting candidate poses:
node scripts/build-soft-puppies.mjs --ship
```

`build-models.mjs` now preserves integrated vendor rigs regardless of CC0 versus CC BY. The isolated regeneration check verifies byte hashes and manifest entries. The service worker incorporates the manifest fingerprint so asset-only releases update cache versions. The browser smoke checks exact author/source/license, source hash and the worker-served live model hash, plus keyboard-accessible attribution.

Open external `.blend` files with auto-execution disabled. Preserve Fable's independent renderer, courtyard, UI and content edits. No simulation, balance, save schema or dependencies were changed. A stale content assertion was updated to match the already revised tired-head / resting-body descriptions, without editing that copy.

## Verification and visual evidence

Actual observed checks: typecheck/build pass; **208 Vitest tests in 18 files pass**; **15 Playwright cases on three projects pass**; **eight GLBs validate with zero errors/warnings/info**; **195 animated pose/time samples pass**; isolated procedural regeneration preserves all three live dog binaries and entries; **46/46 UI checks pass**, including 200% text and keyboard. The isolated integrated WebGL run also passes at five viewports: zero page errors and zero inactive/held frames, with close-up margins ≥6%. The earlier concurrent held-frame failure did not recur; no runtime/test assertion was changed for the rerun. Backend is absent by design.

Candidate renders: `art/soft-puppies-2026-10-10/renders/`. Blender-open screenshot: `renders/blender_open.png`. Same-camera before/after review: `reports/comparison/`, left is previous Quaternius model, right is the new live puppy. `reports/renderer-isolated/` is the isolated five-viewport WebGL verification; review its actual metrics before claiming any phone performance. Earlier `reports/renderer/` is the first run that exposed a 430px close-up margin issue; the final gentler idle supersedes it. `reports/renderer-final/` records a concurrent run with one held-frame check failure (360px); retain that evidence and use the isolated rerun to assess the final result.

Remaining limits: physical-phone performance, training/body-language review and human acceptance are still open. The source has no separately controlled eyelids; do not add closed-eye claims. The twelve added clips are authored prototype motions, not vendor-authored clips or professionally approved canine behavior. Keep further refinements on this soft silhouette and textured coat.
