# Asset report — code-authored 3D models (WP-F, D-010)

Generated 2026-10-09 by `scripts/build-models.mjs` (verification pass 2026-10-09: prop/upgrade node names aligned with the renderer) (Node 26, three 0.186.1 for geometry math only,
`@gltf-transform/core` 4.5.1 for authoring, `@gltf-transform/functions` for weld/resample/dedup/prune,
`gltf-validator` 2.0.0-dev.3.10). No external service, no Blender, no image-to-3D. Everything below is
**code-authored stylized** work: readable anatomy and identity, vertex colours instead of textures, one
material per file. It is above a placeholder and below final art; manifest status is `code-authored` and
the tickets A01–A09 stay open for a sculpted pass (see the bottom of this file).

Commands (run from the project root, `export npm_config_cache="$TMPDIR/npm-cache"` first):

```
npm run assets:build                                  # regenerate GLBs + public/assets/manifest.json
npm run assets:check                                  # re-read GLBs, validator, rig/clip/bounds checks
node scripts/build-models.mjs --preview [dir]         # additionally writes PNG contact sheets (dev aid)
```

The build is deterministic (byte-identical output per run; only `generatedUTC` in the manifest changes).

## Conventions shared by all files

- Metres, +Y up, characters face +Z, origin on the ground between paws/feet, root scale (1,1,1), no
  negative scales, no node matrices.
- Vertex colours in `COLOR_0` (uint8 normalized VEC3, linear RGB from the sRGB hex values of 06/07),
  `POSITION`/`NORMAL` float, `JOINTS_0` uint8, `WEIGHTS_0` float, indices uint16. No textures, no
  extensions (no Draco/Meshopt/KTX2/quantization), so three's `GLTFLoader` needs no decoders.
- Skinned files: one `SkinnedMesh` node at scene root (identity transform) + the joint hierarchy as a
  sibling root node; inverse bind matrices are pure translations (rest rotations are identity, so a bone's
  local axes equal the model axes). Max 4 influences per vertex, normalized, no unweighted vertices.
- Animations: `LINEAR` samplers, quaternion rotation tracks per animated bone, translation tracks only
  on `pelvis`/`hips` where a pose needs it, sampled at 24 fps from eased key poses and reduced with
  `resample` (lossless). Loops end exactly where they start (checked). Clip metadata (duration, loop,
  events) lives in the manifest `clipMeta`, not in the glTF.
- gltf-validator: **0 errors, 0 warnings, 0 infos** on every file (degenerate pole triangles are removed
  at merge time). Face winding agrees with the stored normals for 100 % of character triangles and
  ≥ 99.4 % of static triangles (the remainder are smoothing artefacts at sharp rims — bowl lip, slab edges —
  where averaged vertex normals lean away from one adjacent face; not inverted faces).

## Per asset

| key | file | bytes | triangles | material | clips | bounds (m, w×h×d) | validator |
|---|---|---:|---:|---|---:|---|---|
| dog.nala.puppy | dog_nala_puppy.glb | 487,132 | 9,684 | mat_nala_fur | 13 | 0.194 × 0.398 × 0.729 | 0E/0W/0I |
| dog.nala.growing | dog_nala_growing.glb | 486,924 | 9,684 | mat_nala_fur | 13 | 0.198 × 0.486 × 0.846 | 0E/0W/0I |
| dog.bruno.puppy | dog_bruno_puppy.glb | 487,280 | 9,684 | mat_bruno_fur | 13 | 0.225 × 0.424 × 0.756 | 0E/0W/0I |
| human.mira | human_mira.glb | 257,236 | 6,704 | mat_mira_body | 5 | 0.532 × 1.716 × 0.300 | 0E/0W/0I |
| human.alex | human_alex.glb | 246,536 | 6,352 | mat_alex_body | 5 | 0.552 × 1.776 × 0.300 | 0E/0W/0I |
| environment.school | school_courtyard.glb | 129,384 | 4,116 | mat_school | 0 | 7.0 × 2.30 × 7.0 | 0E/0W/0I |
| props.care | care_props.glb | 81,196 | 3,752 | mat_props | 0 | 0.64 × 0.089 × 0.48 (all props at origin) | 0E/0W/0I |
| props.upgrades | school_upgrades.glb | 103,944 | 4,704 | mat_upgrades | 0 | 1.54 × 1.16 × 1.24 | 0E/0W/0I |

Total 2,279,632 bytes (2.2 MB) against the 8 MB initial-load budget; each dog ≤ 3 MB, each human ≤ 2 MB.

### Dogs (A01, A02, A03, A06)

Mesh `dog_nala_body` / `dog_bruno_body`, skin `rig_nala` / `rig_bruno`, exactly the 26 bones of 08 in this
order: `root, pelvis, spine_01, spine_02, neck, head, jaw, ear_l_01, ear_l_02, ear_r_01, ear_r_02, tail_01,
tail_02, tail_03, leg_fl_upper, leg_fl_lower, paw_fl, leg_fr_upper, leg_fr_lower, paw_fr, leg_bl_upper,
leg_bl_lower, paw_bl, leg_br_upper, leg_br_lower, paw_br`. Hierarchy: root→pelvis→spine_01→spine_02→neck→
head→jaw, head→ears, pelvis→tail chain, spine_02→front legs, pelvis→back legs.

Measured shoulder (withers) heights: Nala puppy **0.281 m** (target 0.28), Nala growing **0.361 m**
(0.36), Bruno **0.311 m** (0.31). Measured as the highest vertex dominated by `spine_02`/front upper-leg
joints, i.e. the top of the shoulders including the thin harness back strap. Growing Nala is a separate
proportion set (legs ≈ +35 % — more than the +25 % mentioned in the brief because 0.36 m with a +12 %
torso otherwise does not add up — head radius −8 %, torso length +20 %, longer neck and tail), clips are
regenerated for it, not retargeted.

Geometry: deformed superellipsoid torso (chest deeper than the belly, belly tucked up), neck, head
ellipsoid with brow ridges, rounded-box upper muzzle, lower jaw on the `jaw` bone, nose, two eyes (dark
brown with lighter iris ring and dark pupil, coloured by angle), forehead stripe, ears (Nala: long
floppy pads hanging from the head sides; Bruno: shorter, set higher, folding outward-down), three-segment
tapered tail, four legs with shoulder/thigh volumes and separate rounded paws, harness (chest band, back
strap with buckle, neck loop and sternum strap; the band and back strap are deformed with the same
function as the torso so they sit on the fur). Markings: Nala honey #C9955A with darker saddle #B07E45,
cream #F1E3C8 chest/belly/throat/socks/paws/chin/stripe, sage #8FA98A harness; Bruno chestnut #7A4A2E,
white #F4F0E8 muzzle/chest/stripe/toes/tail tip, apricot #E4A67B harness, 14 % wider body.

Clips (all 13, exact names, durations from 08; loops close):

| clip | s | loop | what it does |
|---|---:|---|---|
| idle_relaxed | 4 | yes | breathing on spine/neck, slow tail swing, minimal ear sway, tiny weight shift |
| look_at_handler | 1.5 | no | spine/neck/head turn ≈ 35° to the left-front, ears forward, tail lifts and wags; holds |
| sniff | 2.5 | yes | head down, lateral nose sweep, small forward bob, tail level, ears hang |
| walk | 1 | yes | in-place diagonal gait (fl+br / fr+bl), knee flex in swing, pelvis bob, head bob, no root motion |
| sit | 1.5 | no | pelvis down and pitched, hind legs fold (solved so paws stay on the ground), front legs vertical, settles |
| lie_down | 1.5 | no | stand → half sit → sternal lie (chest on the ground, forearms flat, hind legs tucked) |
| rest_loop | 5 | yes | lying, head on paws, slow breathing, tail/ear micro-motion |
| eat | 4 | no | head to bowl height (nose ≈ 0.085 m), jaw open/close at 2.5 Hz 0.75–3.4 s, gentle tail; event `treat_received@2.0` |
| play_bow | 1.5 | no | elbows on the ground, forearms flat, rear up, tail high and wagging, head up |
| turn_away | 1.5 | no | body yaw −70° (away from the handler side), head low, tail low, ears back, small stepping |
| tense_idle | 2.5 | yes | weight shifted back, stiff, ears back, tail tucked, shallow fast breathing |
| tired_idle | 3.5 | yes | head low, slow sway, periodic head dip (blink implied) |
| recover | 2 | no | from the tense pose to relaxed with a small tail wag and head shake; ends in the neutral stance |

### Humans (A05)

Mesh `human_mira_body` / `human_alex_body`, skin `rig_mira` / `rig_alex`, 20 bones: `root, hips, spine,
chest, neck, head, shoulder_l, upper_arm_l, lower_arm_l, hand_l, shoulder_r, upper_arm_r, lower_arm_r,
hand_r, upper_leg_l, lower_leg_l, foot_l, upper_leg_r, lower_leg_r, foot_r`. Rest pose: relaxed standing
with arms hanging (A-pose is approximated by the `idle` clip's slight outward arm angle). Heights measured
1.716 m (Mira, target 1.70) and 1.776 m (Alex, 1.76) to the top of the hair.

Mira: medium brown skin #A5704F, dark hair #2A1C16 with a bun, forest #326B58 overshirt open over a cream
#E8DFCB inner strip, cream trousers, dark belt, pouch at the right hip, olive sneakers. Alex: light olive
skin #C9A17E, short dark hair, terracotta #B9623F top with long sleeves, charcoal #3C3F45 trousers, light
sneakers. Clips: `idle` 4 s loop (breathing, weight shift), `greet` 1.5 s (right hand raised beside the
head with a wave, holds), `gesture_explain` 2 s (hips/chest turned 22° side-on, left forearm gesture,
palm up), `offer_reward` 2 s (knees bend, hips lower 0.31 m, torso stays upright-ish, right hand forward
and low — never leaning over the dog), `kneel` 1.5 s (left knee on the ground, right foot forward, hands
low; feet solved to ground contact).

### Environment and props (A04, A08)

`school_courtyard.glb`: one mesh `school_courtyard`, one material, 4,116 triangles. 7 × 7 m chalk-sand
slab (vertex-colour variation), sage lawn patch front-left, wooden fence posts (1 m spacing) with two rails
and a 2 m entrance gap at the front, shelter back-left (−2.3, −2.3) with four posts, sloped roof, low back
wall and a bench, water-bowl zone marker (ring + tinted disc) at (−1.2, 0.3), rest platform at (2.3, 0.5),
two empty planter boxes at (2.0/2.8, −2.5) as the sniff-corner base, two sage shrubs, three stones.

`care_props.glb`: separate nodes named `bowl` (ceramic bowl with kibble), `water` (bowl with water
disc), `blanket`, `ball`, `toy_rolling`, `leaf` — exactly the ids the renderer resolves with
`getObjectByName` (src/render/app/GameRenderer.ts); the meshes inside keep the prefixed names `prop_bowl`
… `prop_leaf`. Each sits at the origin with the pivot at the base (min y = 0; the rolling toy's ridges dip
5 mm). 3,752 triangles total.

`school_upgrades.glb`: nodes `rest_place` (mesh `upgrade_rest_place`: blanket + cushion + shade on two
posts, 1.24 × 1.16 × 0.99 m) and `sniff_corner` (mesh `upgrade_sniff_corner`: two planters with lavender
tufts + nubbed sniff mat). 4,704 triangles total.
Both are centred on their own origin; the runtime places them at the courtyard's rest platform / planter
positions.

## What `npm run assets:check` verifies

File present for every `code-authored`/`final` entry (pending entries only reported), relative URL, bytes
and triangles equal to the manifest, bounds within 2 mm, no textures, gltf-validator 0 errors, exact clip
names and order (13 dog / 5 human), durations equal to `clipMeta`, every clip has channels, loops close
(first/last keyframe values within 1e-3, q ≡ −q), event times inside the clip, exactly one skin with the
08 joint names in order, one material with the agreed names, static files expose the node names the renderer
looks up (`bowl` … `leaf`, `rest_place`, `sniff_corner`), skin weights sum to 1 with no unweighted
vertex, dog shoulder heights within ±10 % (0.28/0.36/0.31), human heights within ±3 % (1.70/1.76),
winding/normal agreement ≥ 98 %, triangle budgets (dogs ≤ 18k, courtyard ≤ 20k, props ≤ 8k, upgrades ≤
10k), dog ≤ 3 MB, human ≤ 2 MB, total ≤ 8 MB. Exits non-zero on any failure.

## Known visual limitations (what a sculpted pass must improve)

- Primitive-assembled surfaces: parts intersect instead of flowing into each other (neck/chest, legs/torso,
  ear roots, muzzle/skull). No fur tufts, no eyelids as geometry (lids are only implied by the brow ridge),
  no blink/gaze bones (08 asks for lid targets and a separate gaze direction — not present).
- Colour boundaries are vertex-interpolated on a ~10k-triangle mesh, so marking edges (chest bib, saddle,
  socks, Bruno's toes and tail tip) are soft and slightly stepped; the forehead stripe is a separate thin
  strip rather than fur.
- Harness: no buckles on the sides, the sternum strap is two straight segments; the neck loop can clip into
  the neck during strong neck pitch (sniff/eat/rest), the chest band deforms with the spine blend and can
  sink into the chest slightly when sitting.
- Rigid-ish skinning: distance-based weights with a steep kernel, so knees/elbows crease; the shoulder
  volume and thigh volume use fixed blend weights, so extreme poses (lie, bow) show some pinching where the
  legs meet the body. Hind legs in `sit`/`lie_down` are tucked mostly under the body and read better from
  the three-quarter camera than from the side.
- Walk is a rotation-only treadmill (no foot IK): paws slide a little on the ground and the step length is
  modest. Turn_away rotates `root`; the renderer must not apply its own facing on top during this clip.
- Growing Nala reuses the puppy's harness size relative to the chest, and the ear/tail lengths were chosen
  by eye; no reference exists for the intermediate stage.
- Humans: no fingers (mitten hands), no facial features except eye ovals, hair is a cap volume (Mira's
  curls are a smooth bun), clothes have no folds, feet are rounded blocks; the greet wave is a forearm
  roll, not a wrist wave.
- Environment: no baked contact shadows, fence rails are plain boxes, no gate, the lawn edge is a hard
  colour step, shrubs are spheres. The courtyard's bounds (7 × 7 m) are the only collision data.
- Everything was judged through an orthographic software preview (`--preview`), not on a phone; the real
  on-device check (A09) is still open.

## Tickets A01–A09

| ticket | status | notes |
|---|---|---|
| A01 Nala puppy GLB with neutral rig | code-authored, open for art | 26-bone 08 skeleton, 4 influences, identity markings; no UVs by design (vertex colours) |
| A02 Nala 13 clips | code-authored, open for art | all 13 names present, durations per 08, loops close, event `treat_received@2.0` in manifest |
| A03 Bruno GLB | code-authored, open for art | own proportion set (wider, shorter muzzle, folded ears), same clip contract |
| A04 courtyard | code-authored, open for art | one draw call, 4.1k triangles, layout per 06 |
| A05 Mira/Alex | code-authored, open for art | 20-bone rig, 5 gestures, heights 1.72/1.78 incl. hair |
| A06 Nala growing | code-authored, open for art | separate proportions, regenerated clips, 0.361 m |
| A07 pixel profile | not part of WP-F | see WP-B (`scripts/export-pixel.mjs`) |
| A08 props/upgrades | code-authored, open for art | named nodes, pivots at the base |
| A09 shipping (validator, bytes, clips, mobile view) | partly done | validator/bytes/clips verified by `assets:check`; mobile device view not done in this environment |
