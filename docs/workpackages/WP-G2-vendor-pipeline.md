# WP-G2 — Textured asset contract, vendor ingest, validator (session: ines-bc) — supersedes WP-G

Read first: `docs/DECISIONS.md` D-036, D-037; `docs/HANDOFF_PREMIUM_ASSET_SOURCING.md` (all, especially "Fable execution order" and "Shipping and acceptance"); `docs/HANDOFF_BLENDER_REFERENCE_PASS.md` (candidates, their manifest and `reports/`); `docs/HANDOFF_CREATIVE_FABLE_5_1.md` §6 (validator caveat); `docs/pfotenzeit/08_3D_ASSET_HANDOFF.md`.

## Why the change
The user rejected the code-authored character look and wants a professionally authored hero model (candidate A, pending their license confirmation and purchase). Rebuilding Nala procedurally (WP-G) is no longer the goal. What is needed now is the pipeline that can take a vendor GLB with textures and a vendor rig, measure it, validate it against our contract, stage it, and let the renderer load it with semantic clip names.

## What to do with the WP-G work in progress
If your SDF Nala already validates and reads better than the live `dog_nala_puppy.glb` in your contact sheets, finish the puppy only (no growing/Bruno), regenerate, and keep it as the improved fallback-tier asset; otherwise park `scripts/lib/sdf.mjs` with a short note in `docs/ASSET_REPORT.md` and do not regenerate live GLBs. Either way, the 32-bone extension (D-033) stays optional: if a dog GLB has the six eye/lid bones the validator checks them; if not (vendor rig), it does not require them.

## You own
`scripts/validate-assets.mjs`, new `scripts/ingest-vendor.mjs`, new `scripts/lib/textures.mjs` (measurement/resizing helpers using @gltf-transform only, no new deps), `public/assets/manifest.json` schema fields (no live URL changes), `docs/ASSET_REPORT.md` (pipeline section), `art/staging/**`, `docs/VENDOR_INGEST.md`. Do not touch `src/**` (ines-1f adapts the loader to the same manifest fields, see below) or `scripts/lib/environment.mjs`/human generators (ines-93).

## Manifest schema additions (D-036) — exact field names, used by the loader
```json
"dog.nala.puppy": {
  "url": "assets/models/dog_nala_puppy.glb", "status": "code-authored|final|pending|placeholder",
  "material": "vertex|textured",
  "textures": [{ "slot": "baseColor|normal|metallicRoughness|occlusion|emissive", "width": 1024, "height": 1024, "bytes": 123456, "mime": "image/png" }],
  "drawCalls": 1,
  "rig": "project|vendor",
  "clipMap": { "idle_relaxed": "Idle_Loop", "look_at_handler": "LookLeft", ... },
  "clips": ["idle_relaxed", ...],          // semantic names (always the 13 / 5)
  "sourceClips": ["Idle_Loop", ...],       // vendor names actually in the file
  "bytes": 0, "triangles": 0, "boundsMeters": [0,0,0], "source": "...", "license": "...", "version": 2, "clipMeta": {...}
}
```
Existing entries keep working: absent `material` means `vertex`, absent `rig` means `project`, absent `clipMap` means identity.

## Validator (extend, do not weaken)
- `material: 'textured'`: each texture ≤ 1024² for dogs/humans (environment ≤ 2048²), PNG or JPEG only (no KTX2/Basis, no WebP), decoded estimate `width*height*4*1.33` summed ≤ 6 MB per character; baseColor textures must be sRGB-flagged by slot (loader side), normal maps present only with tangents or MikkTSpace-compatible UVs (warn if tangents missing).
- Draw calls per character ≤ 3 (primitives × materials); environment ≤ 12.
- Rig: `project` → the 26/32-bone list as today; `vendor` → any skeleton, but: ≤ 4 influences normalized, no unweighted vertices, root scale 1, no negative scales, bounds within shoulder-height expectation ±15 %, forward +Z (check that the nose/muzzle bounds extend toward +Z more than −Z), origin on the ground (min y within ±1 cm).
- Clips: every semantic name must resolve through `clipMap` to an existing animation; durations reported; loop clips must close (first ≈ last keyframe) or be flagged `loop:false` in clipMeta; `walk` must have no root translation; no clip named like attack/death may be mapped to a stress/fatigue semantic (string check, documented).
- Keep every current check for the live vertex-colour assets.

## `scripts/ingest-vendor.mjs`
`node scripts/ingest-vendor.mjs <input.glb> --key dog.nala.puppy --out art/staging/<name>/ [--clipmap map.json] [--max-texture 1024]`: reads the GLB with gltf-transform, prints an inventory (meshes, primitives, materials, textures with sizes, skins/joints, animations with durations and whether they loop, bounds, triangles), applies prune → dedup → resize textures to the cap (nearest power of two, PNG re-encode via the `sharp`-free path: gltf-transform's `textureCompress` needs sharp, which is not installed — implement a simple box-filter downscale with Node's zlib PNG encoder you already have from `scripts/export-pixel.mjs`, JPEG inputs stay as-is if ≤ cap), optional `quantize` (KHR_mesh_quantization is core in three), writes `<name>.glb`, `<name>.report.json` and a draft manifest entry with `status:'pending'` and `productionIntegrated:false`. Never writes into `public/`.

## Test input now (no purchase needed)
Run the ingest on the five Blender reference-pass candidates `art/blender-reference-pass-2026-10-09/candidates/*.glb` (textured with normal maps, 26-bone project rig, 13/5 clips) into `art/staging/blender-reference/`. Validate the staged outputs with the extended validator in a `--staging` mode. Report the numbers (bytes before/after, triangles, texture sizes, decoded estimate, draw calls, validator result). This proves the textured path end to end before the vendor file arrives. Do not copy them over the live GLBs; whether they ship as an interim hero is ines-c3's call after the renderer loads them in the HUD.

## Deliverable and report
`npm run assets:check` green for the live assets (unchanged behaviour) and `node scripts/validate-assets.mjs --staging art/staging/blender-reference` green or with explained warnings; `docs/VENDOR_INGEST.md` (how to run, what it checks, what still needs Blender outside the sandbox: retarget/author missing clips, LOD). Message ines-c3 with real command output, the manifest fields you finalized (ines-1f codes against them), and the staged report paths.
