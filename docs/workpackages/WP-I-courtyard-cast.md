# WP-I — Courtyard v2, props v2, Mira/Alex v2 (session: ines-93)

Read first: `docs/CREATIVE_PLAN.md` (F6, F7; direction §2), `docs/HANDOFF_CREATIVE_FABLE_5_1.md` §4C–D, §5, §6, `docs/pfotenzeit/06_ART_DIRECTION.md` (Schule, Materialien), `07_CHARAKTERE.md` (Mira, Alex), `08_3D_ASSET_HANDOFF.md`, `docs/ASSET_REPORT.md` (environment/human sections). View `docs/pfotenzeit/characters/03_menschen.png` and the baseline `verification/renderer/390x844_school.png`.

## Mission
Turn the flat yard into a quiet, grounded school and give Mira and Alex faces, hair volume and believable clothing, all inside the vertex-colour/one-material contract and the budgets (yard ≤ 20k triangles, humans ≤ 9k each, ≤ 2 MB each).

## You own
`scripts/lib/environment.mjs`, `humanGeometry.mjs`, `humanClips.mjs`, the static/human sections of `scripts/build-models.mjs`, `public/assets/models/{school_courtyard,care_props,school_upgrades,human_mira,human_alex}.glb` + their manifest entries via `npm run assets:build`, environment/human sections of `docs/ASSET_REPORT.md`. ines-bc (WP-G) edits the dog generators and `scripts/validate-assets.mjs` in parallel: message ines-bc before changing a shared function in `scripts/lib/geometry.mjs`, `exportGltf.mjs` or `pose.mjs`; if you need a validator expectation changed (e.g. new prop node, yard bounds), send ines-bc the exact lines.

## Courtyard (F6) — keep stage positions and bounds (~7×7 m, origin centre)
- Ground: sand slab with per-vertex colour variation (two chalk/sand tones, low-frequency noise), slight height undulation (≤ 3 cm) so light reads, a soft lawn edge (feathered vertex colour, slightly raised lawn), a worn path between shelter and training circle, baked contact darkening (vertex colour) under the shelter, planters, rest deck and fence posts.
- Shelter: light wood, two back walls with slats, a bench, a low roof with visible beams and a slight overhang; the water bowl zone under the shelter edge with a stone slab.
- Training circle: subtle sand ring, not a white line. Rest deck: wooden platform with a folded blanket (always present, free). Sniff corner base: two planters with soil; the upgrade adds plants, a sniff mat and a low lavender hedge.
- Plants: 3–5 shrubs with layered silhouettes (not single spheres), one small tree behind the shelter, three stones with flattened bottoms. Fence: posts with caps, two rails, slightly varied post heights.
- Budget ≤ 20k triangles, 1 draw call. Node names of `props.care`/`props.upgrades` unchanged (bowl, water, blanket, ball, toy_rolling, leaf, rest_place, sniff_corner).

## Props v2
Bowl and water bowl ceramic with a rim and a darker interior (water: lighter disc), blanket with soft folds, ball with a seam, rolling toy and leaf readable at phone distance. Pivots at the base.

## Mira and Alex v2 (F7)
Blended torso/limbs (same smooth-min approach WP-G uses for dogs, or lofted limbs with blended joints), hands with mitten-level fingers, faces with eyes (iris), brows, nose, closed mouth; Mira: dark curly hair volume with a short bun, medium brown skin, forest overshirt over cream tee, cream trousers, flat shoes, reward pouch at the right hip; Alex: short dark hair, light olive skin, terracotta sweatshirt, charcoal trousers, light sneakers. Heights 1.70/1.76 m. Keep the 20-bone humanoid and the 5 clips; improve `offer_reward` (knees bend, torso lowers, hand low and forward, never looming) and `gesture_explain` (open side-on posture).

## Deliverable and report
`npm run assets:build` and `npm run assets:check` green (paste real output). Contact sheets via `node scripts/build-models.mjs --preview <dir>`, viewed with Read: school from the three-quarter camera, Mira idle/offer_reward, Alex idle/greet, props. Update `docs/ASSET_REPORT.md`. Message ines-c3 with: changes, measured numbers, sheet paths, remaining limitations, and any validator lines you sent to ines-bc.
