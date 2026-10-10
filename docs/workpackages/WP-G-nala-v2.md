# WP-G — Nala v2: continuous body, lids/gaze, harness, distinct clips (session: ines-bc)

Read first: `docs/CREATIVE_PLAN.md` (findings F1, F3, F4, F5; direction §2), `docs/DECISIONS.md` D-033, `docs/HANDOFF_CREATIVE_FABLE_5_1.md` §4B, §5, §6, `docs/ASSET_REPORT.md`, `docs/pfotenzeit/07_CHARAKTERE.md`, `08_3D_ASSET_HANDOFF.md`. View `docs/pfotenzeit/characters/01_nala.png` and `02_gastwelpen.png` with the Read tool, and the baseline `verification/renderer/390x844_closeup.png`.

## Mission
Replace the primitive-assembled dog bodies in the generator with a continuous, deformable stylized puppy that reads at phone distance, add eyelid and gaze bones (D-033), fit the harness to the body, and make the 13 clips distinct silhouettes. Puppy Nala first; growing Nala and Bruno reuse the same generator with their proportion sets.

## You own
`scripts/lib/dogGeometry.mjs`, `dogProportions.mjs`, `skeleton.mjs` (dog part), `skinning.mjs`, `dogClips.mjs`, `scripts/validate-assets.mjs`, dog sections of `docs/ASSET_REPORT.md`, `public/assets/models/dog_*.glb` and the dog entries of `public/assets/manifest.json` via `npm run assets:build`. Do not touch `src/**` or the human/environment generators (WP-I edits those in parallel — coordinate shared helpers in `scripts/lib/geometry.mjs`/`exportGltf.mjs`/`pose.mjs` by messaging ines-93 before changing a shared function signature).

## Body (F3)
- Build the torso+neck+head+upper limbs as **one blended surface**: sample a signed-distance field of overlapping ellipsoids/capsules (torso, chest, belly tuck, neck, head, muzzle base, shoulder and hip masses, upper legs) with smooth-min blending and extract it (marching cubes on a ~1.2 cm grid, then Laplacian smoothing), or loft cross-sections along the spine with blended limb roots. Either way: no visible seams at shoulder/hip/neck; soft silhouette; chest deeper than belly; belly tucked up; relaxed puppy proportions (head ~1/3 of body length, short muzzle but a real one, not a box).
- Separate meshes allowed for: lower legs + paws (rounded, slightly larger, cream for Nala / white toes for Bruno), ears (flat, soft-edged pads that hang and swing; Bruno folded and shorter), tail (tapered, three bones, slight downward curve at rest), harness, eyes, nose.
- Target 9–14k triangles per dog, ≤ 3 MB, vertex colours only (keep the loader contract), smooth normals, one material.

## Face (F4)
- Eyeballs: spheres with iris ring (warm brown) and pupil, slight inward gaze convergence; placed so they are visible from the front three-quarter camera.
- Lids: upper and lower lid meshes (thin curved shells over the eyeball) skinned to `eyelid_upper_l/r`, `eyelid_lower_l/r`; `eye_l/r` bones rotate the eyeballs (gaze). Rest: lids open ~75 %, soft. No brow ridge that reads as a frown; a faint cream brow patch is fine.
- Muzzle rounded, closed mouth line, nose slightly up-turned; the cream forehead stripe stays.

## Harness (F5)
Chest plate + two straps that follow the blended body surface with a 4–6 mm offset (sample the SDF), sage for Nala, apricot for Bruno, small buckle on the back strap resting on the surface. Skinned to spine_01/spine_02 so it moves with the body in sit/lie.

## Skeleton and skinning
32 bones per D-033 in that exact order; rest pose neutral standing; max 4 influences normalized; no unweighted vertices; the harness and lids get hard-ish weights. Keep bone names of 08 for everything else.

## Clips (all 13, same names/durations as now) — make silhouettes distinct
idle_relaxed: breathing, lids soft, occasional blink (every ~3 s), tail level with tiny motion. look_at_handler: head turn ~35° to the handler side, eyes lead, ears lift, tail slight lift. sniff: nose down, slow lateral sweep, tail level, lids half. walk: in place, diagonal gait, paws plant flat. sit/lie_down: smooth, harness follows. rest_loop: curled or sternal, lids closed, slow breath. eat: head to bowl height, jaw rhythm, lids half, tail gentle. play_bow: chest down, rear up, tail high, lids wide, ears forward. turn_away: body yaw ~70°, head low, ears back, tail low, lids slightly narrowed. tense_idle: weight back, stiff legs, ears back, tail low and still, lids narrowed, no wag. tired_idle: head low, slow sway, lids heavy, blink slow. recover: from tense to relaxed, lids open, ears forward. Loops close; eased multi-keyframes; events kept (`eat: treat_received@2.0`).

## Validator
Update `scripts/validate-assets.mjs` to expect the 32-bone list for dogs, clip names/durations, ≤ 18k triangles, ≤ 3 MB, shoulder heights 0.28/0.36/0.31 ±10 %, eyes/lids present (bone names), harness vertex colour present. Do not weaken existing checks.

## Deliverable and report
`npm run assets:build` and `npm run assets:check` green (paste real output). Render contact sheets with `node scripts/build-models.mjs --preview <dir>` and view them with the Read tool: idle, look_at_handler, sniff, turn_away, tense_idle, tired_idle, rest_loop, play_bow for Nala puppy, Nala growing and Bruno. Update the dog sections of `docs/ASSET_REPORT.md` (provenance, bytes, triangles, limits). Message ines-c3 with: what changed, measured numbers, contact-sheet paths, known remaining limitations, and whether `scripts/lib/pose.mjs`/`exportGltf.mjs` signatures changed.
