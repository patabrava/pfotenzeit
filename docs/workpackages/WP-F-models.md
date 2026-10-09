# WP-F — Code-authored rigged GLBs, manifest, validator (background agent of ines-c3)

Read first: `/CLAUDE.md`, `docs/DECISIONS.md` (D-010), `docs/pfotenzeit/08_3D_ASSET_HANDOFF.md` (skeleton, clip contract, coordinates, manifest), `07_CHARAKTERE.md` (proportions, identity), `06_ART_DIRECTION.md` (palette, style), `16_ASSET_PRODUCTION.md` (manifest format, production evidence). Look at `docs/pfotenzeit/characters/01_nala.png`, `02_gastwelpen.png`, `03_menschen.png`.

## Mission

Generate, from code and without any external service, rigged + skinned + animated GLBs for Nala (puppy and growing), Bruno, Mira and Alex, plus static GLBs for the courtyard, care props and upgrade props. Export through `@gltf-transform/core` in Node (three's GLTFExporter needs browser APIs), optimize with `@gltf-transform/functions`, validate with `gltf-validator`, write `public/assets/manifest.json` with real measured numbers, and provide `npm run assets:check`.

These are honest **code-authored stylized** models: readable anatomy, big colour blocks, no textures (vertex colours `COLOR_0`, one material per model → one draw call per character). They are not final art; the manifest says `"status": "code-authored"`.

## You own
- `scripts/build-models.mjs` (entry: `npm run assets:build`), `scripts/lib/**` (geometry builders, skinning, clips, export helpers)
- `scripts/validate-assets.mjs` (entry: `npm run assets:check`)
- `public/assets/models/*.glb`, `public/assets/manifest.json`, `docs/ASSET_REPORT.md`

Do not edit `src/**`. three 0.186.1 is installed and usable in Node for pure geometry math (`BoxGeometry`, `CapsuleGeometry`, `SphereGeometry`, `CylinderGeometry`, `LatheGeometry`, `BufferGeometryUtils.mergeGeometries`, `Matrix4`, `Quaternion`, `Vector3`). Do not add dependencies. Before npm commands: `export npm_config_cache="$TMPDIR/npm-cache"`.

## Coordinates and scale (08)
Metres, +Y up, model faces **+Z**, origin on the ground between the paws/feet. Root scale (1,1,1), no negative scales. Nala arriving shoulder height 0.28 m; growing 0.36 m with longer legs and a relatively smaller head (not a uniform scale); Bruno 0.31 m, stockier, slightly shorter muzzle but normal; Mira 1.70 m, Alex 1.76 m. Names: meshes `dog_nala_body`, skins `rig_nala`, materials `mat_nala_fur`; same pattern for others.

## Dog skeleton (08) — exact bone names
`root, pelvis, spine_01, spine_02, neck, head, jaw, ear_l_01, ear_l_02, ear_r_01, ear_r_02, tail_01, tail_02, tail_03, leg_fl_upper, leg_fl_lower, paw_fl, leg_fr_upper, leg_fr_lower, paw_fr, leg_bl_upper, leg_bl_lower, paw_bl, leg_br_upper, leg_br_lower, paw_br`. Hierarchy: root→pelvis→spine_01→spine_02→neck→head→jaw; head→ears; pelvis→tail chain; spine_02→front legs; pelvis→back legs. Rest pose = neutral standing. Max 4 weight influences per vertex, normalized, no unweighted vertices.

## Dog geometry
Build from merged primitives placed along the skeleton: torso (capsule/ellipsoid, chest deeper than belly), neck, head (sphere + muzzle box with rounded top), nose, two eyes (dark brown sphere with a tiny lighter iris ring and a dark pupil, normal lids implied by a brow ridge), floppy ears (flattened capsules hanging from the head sides for Nala; softly folded shorter ears for Bruno), tail (three tapered segments), four legs with separate paws (slightly larger rounded paws, cream for Nala, white toes for Bruno), harness band around the chest with a small back strap (sage #8FA98A for Nala, apricot #E4A67B for Bruno). Colours (vertex): Nala honey #C9955A body, darker honey #B07E45 ears/back saddle hint, cream #F1E3C8 chest/paws/forehead stripe; Bruno chestnut #7A4A2E, white #F4F0E8 muzzle/chest/toes/forehead stripe/tail tip. Eyes #2A1A12, nose #2B1C15. Target 6–12k triangles per dog (08 allows 12–18k; smaller is fine), smooth normals within body parts.

Skin weights: for every vertex compute distance to each bone segment (capsule around the bone from head to tail joint, radius per bone); weight = smooth falloff; keep top 4, normalize. Ears → ear bones, tail → tail bones, paws → paw bones, harness → spine_02/spine_01, head parts → head, jaw lower muzzle → jaw.

## Dog clips — all thirteen, exact names, durations from 08
`idle_relaxed` 4 s loop (soft breathing on spine_01 scale-free: tiny rotation, ear sway minimal, tail slow), `look_at_handler` 1.5 s (head/neck turn ~35° to the left-front where the handler stands, soft spine follow, tail small lift), `sniff` 2.5 s loop (head down, lateral sweep, tail level), `walk` 1 s loop (in place, diagonal gait, 4 legs, head bob; no root motion), `sit` 1.5 s (pelvis down, back legs fold, front straight; settle), `lie_down` 1.5 s (from stand to sternal lie), `rest_loop` 5 s loop (lying, slow breathing, head on paws), `eat` 4 s (head to bowl height ~0.08 m, jaw open/close rhythm, tail gentle), `play_bow` 1.5 s (front legs fold, chest down, rear up, tail high), `turn_away` 1.5 s (body yaw ~70° away, head low, tail lower, ears back), `tense_idle` 2.5 s loop (stiff, weight shifted back, ears back, tail low, minimal motion), `tired_idle` 3.5 s loop (head low, slow sway, blinking implied by head dip), `recover` 2 s (from tense pose to relaxed). Each clip starts from a sensible pose so cross-fades work; loops end where they start. Keyframes: quaternion rotation tracks per animated bone (+ translation on pelvis for sit/lie/bow), step/linear interpolation `LINEAR`. Store clip metadata (name, duration, loop, event times such as `eat: treat_received@2.0`) in the manifest, not inside the glTF.

## Growing Nala
Same skeleton names, bone lengths changed (legs +25 %, head radius −10 %, torso +12 %), same colours and markings. Clips rebuilt with the same generator (do not retarget; regenerate). Shoulder height 0.36 m.

## Humans
Simplified humanoid: `root, hips, spine, chest, neck, head, shoulder_l, upper_arm_l, lower_arm_l, hand_l, (r...), upper_leg_l, lower_leg_l, foot_l, (r...)`. Capsule limbs, box torso with rounded edges, sphere head with simple hair volume (Mira: dark #2A1C16 bun; Alex: short dark hair), skin tones (Mira medium brown #A5704F, Alex light olive #C9A17E), clothes as vertex colours (Mira forest #326B58 overshirt over cream #E8DFCB trousers, a small pouch at the right hip; Alex terracotta #B9623F top, charcoal #3C3F45 trousers, light sneakers). Clips: `idle` 4 s loop, `greet` 1.5 s (hand raise), `gesture_explain` 2 s (open side-on posture, one forearm gesture), `offer_reward` 2 s (knees bend, torso lowers ~0.3 m, hand forward low — never leaning over the dog), `kneel` 1.5 s. 5–9k triangles each.

## Environment and props (static, no skin)
`school_courtyard.glb`: ground slab ~7×7 m chalk-sand #E6DCC8 with a sage lawn patch, wooden fence posts + rails around (light wood #D9B98A), a wooden shelter (4 posts, flat sloped roof) at the back-left, a water bowl zone marker, a rest place (low wooden platform at right), a sniff corner base (two planter boxes at back-right, empty), two shrubs (sage spheres), three stones. ≤ 20k triangles, 1 draw call if possible (one material via vertex colours).
`care_props.glb`: separate named meshes `prop_bowl`, `prop_water`, `prop_blanket`, `prop_ball`, `prop_toy_rolling`, `prop_leaf` each at origin (pivot at base), ≤ 3k total.
`school_upgrades.glb`: `upgrade_rest_place` (blanket + cushion + small shade), `upgrade_sniff_corner` (planters filled with lavender tufts and a sniff mat) ≤ 5k total.

## Export, optimize, validate
- Author with `@gltf-transform/core` `Document` (buffers, accessors, primitives with POSITION/NORMAL/COLOR_0/JOINTS_0/WEIGHTS_0, skins with inverse bind matrices, animations with samplers/channels, scene). `NodeIO.writeBinary` → `.glb`.
- `@gltf-transform/functions`: `dedup`, `prune`, `weld` (if safe), `quantize` only if gltf-validator and the three GLTFLoader can read it without extension decoders (`KHR_mesh_quantization` is core-supported by three — ok). No Draco, no Meshopt, no KTX2.
- Validate every file with `gltf-validator` (`validateBytes`); zero errors; explain warnings in `docs/ASSET_REPORT.md`.
- Sanity loader test: write a tiny Node script using three's `GLTFLoader`? It needs DOM; skip. Instead verify with gltf-transform `NodeIO.readBinary` round-trip: skins have 26 joints (dogs), every animation name present, bounds (min/max) match expected shoulder heights ±10 %.

## Manifest (`public/assets/manifest.json`)
```json
{ "version": 1, "generatedUTC": "...", "assets": {
  "dog.nala.puppy": { "url": "assets/models/dog_nala_puppy.glb", "status": "code-authored", "bytes": 123456, "triangles": 8420, "clips": ["idle_relaxed", ...13], "textureSizes": [], "boundsMeters": [x,y,z], "source": "scripts/build-models.mjs (procedural, from 07/08 brief and reference sheets)", "license": "project-internal, generated code; no third-party assets", "version": 1,
     "clipMeta": { "eat": { "durationS": 4, "loop": false, "events": { "treat_received": 2.0 } }, ... } },
  "dog.nala.growing": ..., "dog.bruno.puppy": ..., "human.mira": ..., "human.alex": ..., "environment.school": ..., "props.care": ..., "props.upgrades": ...
}}
```
Relative URLs (no leading slash). `scripts/validate-assets.mjs` re-reads every GLB, checks bytes/triangles/clips against the manifest, runs the validator, prints a table and exits non-zero on mismatch or on a `final`/`code-authored` entry whose file is missing. Pending entries are reported as pending, not failures.

## Report
`docs/ASSET_REPORT.md`: per asset — generator, date, bytes, triangles, materials, clips, bounds, validator result, known visual limitations (what a sculpted pass must improve), and the open tickets A01–A09 with status. Finish by running `npm run assets:build` and `npm run assets:check` and reporting their actual output. Keep total models ≤ 8 MB (expect far less).
