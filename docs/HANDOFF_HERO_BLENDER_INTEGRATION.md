> Continuation update (2026-10-10): D-040 script changes are now applied and verified by scripts/dev/verify-d040.mjs. References below to pending 6 MiB enforcement are historical. Paid hero sourcing is superseded by the integrated free licensed assets; keep this document as a future ingest reference.

# Hero model integration — Blender 5.2 + MCP procedure (outside the sandbox)

Prepared 2026-10-10 (WP-N, ines-93) for the agent or person who runs Blender on this Mac. It starts
where `docs/HANDOFF_PREMIUM_ASSET_SOURCING.md` step 2 ends ("the user bought one hero source and put the
files in `art/vendor-evaluation/<vendor>/<asset>/original/`") and ends with a validated staged GLB, runtime
review screenshots and a filled go/no-go sheet for ines-c3 and the user. Nothing in this document is a
purchase authorization; nothing here changes `public/`.

Related documents (read before starting, in this order): `CLAUDE.md` (boundaries, ownership),
`docs/HANDOFF_PREMIUM_ASSET_SOURCING.md` steps 3–7 and "Shipping and acceptance",
`art/vendor-evaluation/README.md` (layout, PROVENANCE template), `docs/BLENDER_CONNECTION.md` (MCP bridge),
`docs/HANDOFF_BLENDER_REFERENCE_PASS.md` (how the previous Blender pass scripted, exported and validated),
`docs/VENDOR_INGEST.md` (ingest, validator, dry run), `docs/CLIP_BRIEF.md` (the 13 dog semantics, written
by WP-O; referenced here, not duplicated), `docs/pfotenzeit/08_3D_ASSET_HANDOFF.md` (asset contract),
`docs/pfotenzeit/07_CHARAKTERE.md` (Nala identity and growth), `docs/DECISIONS.md` D-036..D-039.

## Execution prompt

> Read `docs/HANDOFF_HERO_BLENDER_INTEGRATION.md` top to bottom, then `CLAUDE.md`, `docs/DECISIONS.md`
> D-036..D-039 and `docs/CLIP_BRIEF.md`. Work only in `art/vendor-evaluation/<vendor>/<asset>/`,
> `art/staging/<asset>/` and `docs/`. Open Blender through the MCP bridge in a new scene, never in the user's
> live scene. Record every measurement you actually took and every command you actually ran. Do not buy,
> download or contact anyone; do not commit originals; do not write into `public/`; do not mark anything
> `final`; do not claim phone results you did not obtain. Finish with the go/no-go sheet in section 11.

## 0. Vocabulary

- **original**: the vendor files exactly as delivered (`original/`, never committed).
- **work file**: `blender/<asset>_work.blend`, the editable Blender source you create.
- **export**: `export/<asset>_<variant>.glb`, what Blender writes (not committed).
- **staged**: `staged/`, what `scripts/ingest-vendor.mjs` writes (GLB, report, draft manifest entry).
- **semantic clip**: one of the 13 dog clip ids the game requests (`idle_relaxed` … `recover`, list in
  `scripts/lib/dogClips.mjs` and `docs/CLIP_BRIEF.md`). A vendor clip is mapped to a semantic via `clipMap`.
- **project rig / vendor rig**: `rig: 'project'` is exactly the 26- or 32-bone list in
  `scripts/lib/skeleton.mjs`; anything else is `rig: 'vendor'` and goes through the vendor checks (D-038).

## 1. Preconditions (stop if any is missing)

1. `art/vendor-evaluation/<vendor>/<asset>/PROVENANCE.md` exists and every line of the template in
   `art/vendor-evaluation/README.md` is filled ("unknown" is allowed, a missing line is not): vendor, listing
   URL, purchase date / order id / price, exact license label, delivered files with bytes and sha256.
2. The **browser-delivery answer is recorded** in PROVENANCE.md: "Written permission for Three.js / open GLB
   delivery: yes (file) | no | pending". With `no`, stop and report. With `pending`, you may do sections 2–8
   (inspection, conversion, staging in a non-public directory) but not section 9 (hero review screenshots in
   the committed `review/` folder) and not the go recommendation; say so in the sheet.
3. "AI-assisted local processing permitted" is answered. If the license forbids AI-assisted processing
   (the MalberS listing in the sourcing handoff is such a case), an LLM must not script the conversion;
   hand the file to a human and report.
4. `original/` is listed in `.gitignore` (it is: `art/vendor-evaluation/*/*/original/`). Confirm with
   `git check-ignore -v art/vendor-evaluation/<vendor>/<asset>/original/<file>` before anything else.
5. Nothing in `public/` is touched by this procedure. `scripts/ingest-vendor.mjs` refuses `--out` under
   `public/`; do not work around it.
6. Blender 5.2.2 LTS and the MCP bridge respond:
   `/Users/patabrava/.codex/integrations/blender/venv/bin/python /Users/patabrava/.codex/integrations/blender/verify.py`
   must report the Blender version and tool discovery (see `docs/BLENDER_CONNECTION.md`). Headless Blender
   does not run inside the Claude sandbox (D-037); this whole document is an outside-the-sandbox procedure.
7. Node ≥ 22.12 with the project's existing dependencies (`npm ci` if needed; no new packages). Before any
   npm command: `export npm_config_cache="$TMPDIR/npm-cache"` when in a sandboxed shell.

## 2. Blender MCP session rules

- **Separate scene, separate file.** The MCP tools operate on the open Blender scene. Before the first edit
  run `open_review.py`-style protection or simply: `bpy.ops.wm.read_homefile(app_template="")` in a fresh
  Blender process you started for this job, then `bpy.ops.wm.save_as_mainfile(filepath=<blender/<asset>_work.blend>)`.
  Never import into or save over a scene the user had open. If Blender was already running with an unsaved
  scene, save that scene as a timestamped snapshot first (the reference pass did this in `open_review.py`).
- **Reproducible scripts, not clicks.** Every conversion step is a Python file under
  `art/vendor-evaluation/<vendor>/<asset>/blender/scripts/` (`01_import.py`, `02_inventory.py`,
  `03_convert.py`, `04_clips.py`, `05_growing.py`, `06_export.py`), run through the bridge
  (`art/blender-reference-pass-2026-10-09/scripts/mcp_run.py <script.py> [work.blend]` is a working runner:
  without a `.blend` argument it targets the visible Blender, with one it uses the background CLI tool).
  Tool code assigns a JSON-serializable dict to `result`; write that dict to `reports/<step>.json` too.
- **Commit policy for `blender/`**: `.blend` and scripts are committed **only if the license allows
  redistribution of a derived editable source** (README). If not, keep the work file locally, commit the
  scripts (they contain no vendor data) and say so in PROVENANCE.md.
- **One agent at a time** on the scene (`docs/BLENDER_CONNECTION.md`). Do not run the MCP conversion while
  another agent's Blender job is active.
- **Units**: Blender scene unit metres, unit scale 1.0, before importing. Check `scene.unit_settings`.
- Save after every step (`bpy.ops.wm.save_mainfile()`); the work file is the restart point.

## 3. Inventory (record before changing anything)

Import the original (FBX, glTF or `.blend`, whichever the vendor marks as the master; if several, import the
glTF first and compare with FBX, note differences). Write `reports/inventory.json` and copy the numbers into
the go/no-go sheet. Record, per object:

| what | how (Blender Python) | why it matters |
|---|---|---|
| actual triangles (all meshes, after triangulation) | `sum(len(p.vertices) - 2 for p in me.polygons)` per mesh with modifiers applied in an evaluated depsgraph | the seller's "38,154 triangles" is a claim; budget is 12–18k shipped (08) |
| vertex count, loose parts, fur cards / hair particles | `me.vertices`, `bpy.ops.mesh.separate` on a copy, `ob.particle_systems` | hair particles do not export; cards may ship selectively |
| materials and their node trees | `ob.material_slots`, image nodes per slot | one PBR material target, ≤ 3 draw calls per character (D-036) |
| textures: file, resolution, channel packing, colour space, bytes | `img.size`, `img.colorspace_settings.name`, `img.filepath` | atlas cap and decoded-memory budget (section 4.7) |
| UV sets | `me.uv_layers` | TEXCOORD_0 required for textured materials; extra sets are pruned |
| armature: joint count, names, hierarchy, rest pose, bone roll, deform flag | `arm.bones`, `bone.use_deform` | `rig: 'vendor'`; ≤ 4 influences; which bones carry eyes/lids/jaw/ears |
| max influences per vertex | max `len(v.groups)` with weight > 0 across the body | validator fails on `JOINTS_1` (> 4) |
| every supplied clip: name, frame range, fps, duration s, loop closure (first vs last pose), root motion (object or root-bone translation range), which bones it animates | `bpy.data.actions`, `action.frame_range`, fcurve sampling | `clipMap`, loop flags, walk-in-place rule |
| eye / lid / jaw / ear controls | bones or shape keys (`me.shape_keys`) | the game needs lids and gaze (07, D-033); shape keys do not survive our loader as controls |
| scale, axis, pivot | `ob.dimensions`, `ob.matrix_world`, lowest vertex y, forward axis of the muzzle | metres, +Y up, +Z forward, floor pivot |
| controller type | CAT / Biped / Unity Humanoid / Unreal / Rigify / Mixamo markers in names | runtime controllers do not exist in Three.js; only baked bone keys ship |

Also screenshot the imported original in Blender from front, side and three-quarter (material preview,
neutral world) into `review/blender/original_*.png`. These are the "before" images for the hero review.

## 4. Conversion rules (what the staged GLB must satisfy)

All of these are checked by `scripts/validate-assets.mjs --staging`; the list tells you what to fix in
Blender rather than after export.

1. **Metres, +Y up, +Z forward, floor pivot, root scale 1.** Blender is Z-up; the glTF exporter converts
   once (`export_yup=True`). Apply all object transforms (`bpy.ops.object.transform_apply(location, rotation, scale)`)
   so no node carries scale ≠ 1 or a negative scale. The muzzle must point to **+Z after export**, which is
   **−Y in Blender**; the validator checks that the mean z of the top 20 % of the body (head, ears) is > 0.
   Lowest vertex at y = 0 ± 1 cm in the rest pose. Origin between the paws, not at the hips.
2. **Size.** Puppy shoulder height 0.28 m (07). The vendor rig has no project joint names, so the validator
   estimates shoulder = bounds height ÷ 1.4 and allows ±15 % (bounds height 0.333–0.451 m). Scale the whole
   character (mesh + armature, then apply) to meet it; do not stretch.
3. **≤ 4 influences.** Limit weights (`bpy.ops.object.vertex_group_limit_total(limit=4)`) then normalize
   (`vertex_group_normalize_all`). Export option "Influences 4". No vertex may be unweighted.
4. **Bake runtime-system animation.** CAT, Biped, Unity/Unreal controllers, IK constraints, drivers and
   NLA blending do not exist in Three.js. Before export: `bpy.ops.nla.bake(frame_start, frame_end,
   only_selected=False, visual_keying=True, clear_constraints=True, bake_types={'POSE'})` per action, or export
   with "Sampling" on and constraints baked. After baking, every clip is plain bone translation/rotation/scale
   keys. Remove control bones that do not deform (`use_deform=False`) from the exported armature only if
   nothing in the keyed hierarchy depends on them; otherwise keep them (they are cheap) and let the ingest prune
   nothing it should not (`prune({ keepLeaves: true })` keeps joints).
5. **Keep the vendor rig unless retargeting is deliberate** (sourcing handoff step 5). The renderer works
   from deformed-surface bounds and `clipMap` for GLB actors (WP-M audit); it does **not** need project bone
   names. Retarget to the project 32-bone rig only when (a) the vendor rig cannot hold lids/gaze or (b) the
   vendor clips are unusable and the project clips must be reused. Retargeting is a separate decision, written
   into the sheet, never a silent side effect. If the renderer needs named attachment bones (head, mouth, chest,
   tail tip), WP-M proposes a manifest `attachments` field; record the vendor bone names for those four points
   in `reports/inventory.json` now so they can be filled in later.
6. **LOD to 12–18k triangles, muzzle and eyelids last.** Order of reduction: hidden/duplicate shells → fur
   cards nobody sees at gameplay size → body (decimate "Collapse" with vertex-group weights protecting the
   head, or manual unsubdivide) → paws/tail → ears → **never** the muzzle, nostrils, eyelids and eye surfaces
   below the point where the gaze and blink read at 390×844 closeup (dog 55–65 % of viewport height,
   D-034/D-039). Re-skin check after decimation (`Data Transfer` of weights from the original if the modifier
   destroyed groups). Re-bake normal maps **after** decimation if the original had high-poly detail.
7. **Textures: ≤ 1024² per texture, PNG or JPEG, decoded budget 12 MiB per character (D-040).** The
   validator allows each dog texture ≤ 1024² and sums `width × height × 4 × 1.33` over unique textures
   against the per-character cap (`BUDGET.decodedTextureBytes`, `scripts/lib/assetContract.mjs`). One 1024²
   texture is ≈ 5.3 MiB, so the cap means **one 1024² baseColor atlas plus one 1024² normal map at most**.
   D-040 superseded the 6 MiB wording of D-036; if `assetContract.mjs` still says 6 MiB when you run, the
   script change is pending (see section 12) and only one 1024² map passes. Pack metallic/roughness into
   channels of one image if the material needs them. Bake in Blender (`Cycles`,
   `bake_type='DIFFUSE'` colour only with lights off, `'NORMAL'` tangent space) into images saved as PNG
   (JPEG for baseColor if the fur gradient compresses cleanly and bytes matter). Do not ship the vendor's 4K
   originals. baseColor is sRGB, normal/roughness are non-colour.
8. **One material per character where possible (≤ 3 draw calls).** Eyes may be a second material if the
   cornea needs alpha; a third slot is the limit. Avoid blanket double-sided; set `use_backface_culling` per
   material and check fur cards, eyelids and ears separately (sourcing handoff).
9. **Harness fit without intersections.** Nala wears a sage harness (07, 06). Either the vendor model has
   none (model a simple strap set as part of the same mesh and atlas, weighted to spine/chest bones) or adapt
   the vendor's collar. Check sit, lie_down, play_bow and eat for strap intersection with the chest and neck;
   fix with weights, not by thickening the body.
10. **Eyes that can blink and look.** Keep or add lid bones (upper/lower per eye) and eye bones. If the vendor
    uses shape keys for blink, bake the blink into the clips as lid-bone motion where possible; the loader does
    not drive shape keys as controls today. Record what exists; absence of lids is a listed limitation, not a
    blocker for the dry run.
11. **No extensions that need a decoder** (Draco, Meshopt, KTX2/Basis, WebP, AVIF). Export plain PNG/JPEG,
    no compression; `KHR_mesh_quantization` is acceptable later via `--quantize` on the ingest side.
12. **Names.** Mesh `dog_nala_body`, armature `rig_nala`, material `mat_nala_fur` are the project's preferred
    names (08) but the validator does not require them for a vendor rig; keep the vendor's names if renaming
    would break the vendor's own scripts, and record the mapping.

## 5. Clip authoring (all 13 semantics)

The semantics, their German readings, body-signal requirements, durations, loop flags, events and the
disqualifiers per clip are in **`docs/CLIP_BRIEF.md`** (WP-O). Do not duplicate it; apply it. Rules the
pipeline enforces on top:

- Every semantic must resolve to exactly one action in the file via `clipmap.json`
  (`{ "idle_relaxed": "<vendor name>", … }`). Names in the file may stay the vendor's; the ingest copies the
  mapping into the manifest (`clipMap`, `sourceClips`).
- **Loop clips close**: `idle_relaxed`, `sniff`, `walk`, `rest_loop`, `tense_idle`, `tired_idle` need first
  pose = last pose (validator tolerance 1e-3 on every channel; quaternion sign is handled). In Blender: copy the
  first keyframe to the last frame, or use a cycle modifier and bake. Non-loop clips (`look_at_handler`, `sit`,
  `lie_down`, `eat`, `play_bow`, `turn_away`, `recover`) may be open.
- **Walk in place**: no translation on the root bone or on any scene-root node (> 1 mm range fails). Remove
  the vendor's root motion (delete the location F-curves of the root bone, or bake with the root pinned); the
  runtime moves the character.
- **`eat` carries the `treat_received` event** (`clipMeta.events`). The default is 2.0 s; D-040 lets
  `clipmap.json` set the real contact time per semantic in the object form
  `"eat": { "clip": "Eat01", "events": { "treat_received": 2.4 } }` next to the plain string form. The ingest
  writes it into the draft entry and the validator requires every event time to lie strictly inside the clip and
  `eat` to carry `treat_received`. Measure the frame where the mouth reaches the bowl and write that time; do
  not re-time the clip to hit 2.0 s. (If the ingest rejects the object form, the D-040 script change is still
  pending; see section 12.)
- **No attack/death substitutes**: a clip whose name matches attack, death, die, bite, kill, hit, hurt,
  damage or injur(y) can never be mapped to `tense_idle`, `tired_idle`, `recover` or `turn_away`; the
  validator fails it. The content rule is stricter than the name check: bared teeth, growl posture or a
  collapse are disqualified for any semantic even under a harmless name (CLIP_BRIEF "educational meaning
  check").
- Durations: the ingest records the real clip duration; the targets in 08 (idle 3–5 s, walk 1 s, eat 3–5 s,
  rest 4–6 s, …) are what to author to.
- Author missing semantics in Blender on the vendor rig (pose library + keyframes, baked). Prefer editing a
  vendor clip that is close (Alert → `tense_idle` with stiff legs, weight back, tail low, ears back; Sleep →
  `rest_loop` curled) over building from zero. Review each clip in Blender from the gameplay camera angle
  (front three-quarter, 25° down) at a small viewport size before export.

## 6. Growing variant (`dog_nala_growing`)

Second GLB, same identity, changed proportions (07): shoulder height 0.28 → **0.36 m**, legs longer,
head relatively smaller, body steadier, same markings, same harness colour, same face. **Not a uniform
scale.** Procedure on a copy of the work file (`05_growing.py`):

1. Lengthen the limb bones (upper/lower front and hind) in edit mode by ≈ 25–30 % along their axis; move the
   spine chain up accordingly so the paws stay on the floor; keep the head bone length, reduce the head mesh
   relative to the body by scaling the head vertex group ≈ 0.92 about the head bone head.
2. Apply the rest pose as the new rest pose (`bpy.ops.pose.armature_apply(selected=False)`), then re-apply
   the baked clips (they are rotation-driven; translation keys on non-root bones must be re-baked from the
   new rest pose — check sit/lie_down ground contact afterwards).
3. Keep the same atlas; the UVs do not change.
4. Export as `dog_nala_growing`; validator expectation shoulder 0.36 m (bounds height 0.428–0.580 m by the
   ÷ 1.4 fallback). Review growing next to puppy in the hero harness (`a=` puppy, `b=` growing) so the growth
   reads as the same dog.

## 7. Export from Blender

Per variant (`06_export.py`), selected objects only (body mesh + armature; no studio floor, lights, camera
or helper empties):

```python
bpy.ops.export_scene.gltf(
    filepath=export_path, export_format='GLB', use_selection=True,
    export_yup=True, export_apply=True,
    export_texcoords=True, export_normals=True, export_tangents=True,
    export_vertex_color='NONE',           # textured contract (option name in 4.2+; verify on 5.2)
    export_materials='EXPORT', export_image_format='AUTO',
    export_skins=True, export_all_influences=False,   # 4 influences
    export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=False,
    export_frame_range=False, export_force_sampling=True, export_optimize_animation_size=True,
    export_bake_animation=True, export_anim_single_armature=True, export_reset_pose_bones=True,
    export_def_bones=True,                # deform bones only, when control bones were kept
    export_draco_mesh_compression_enable=False,
)
```

Check the exact option names against the installed exporter (`bpy.ops.export_scene.gltf.get_rna_type()`;
5.2 renamed a few). Write `export/<asset>_puppy.glb` and `export/<asset>_growing.glb`. These files are not
committed.

## 8. Ingest and validate (Node, may run inside the sandbox)

```sh
export npm_config_cache="$TMPDIR/npm-cache"
node scripts/ingest-vendor.mjs art/vendor-evaluation/<vendor>/<asset>/export/<asset>_puppy.glb \
     --key dog.nala.puppy --name dog_nala_puppy \
     --out art/vendor-evaluation/<vendor>/<asset>/staged \
     --clipmap art/vendor-evaluation/<vendor>/<asset>/blender/clipmap.json \
     --max-texture 1024 \
     --source "<vendor> <asset>, order <id>, converted with blender/scripts 01–06" \
     --license "<exact license label>; browser delivery permission: <yes/pending, file>"
node scripts/ingest-vendor.mjs …/export/<asset>_growing.glb --key dog.nala.growing --name dog_nala_growing \
     --out art/vendor-evaluation/<vendor>/<asset>/staged --clipmap …/clipmap.json --max-texture 1024 …
node scripts/validate-assets.mjs --staging art/vendor-evaluation/<vendor>/<asset>/staged
```

The ingest prints the inventory before/after, the validator counts, `rig: vendor (<n> joints, max 4
influences, root <name>)`, the clip resolution (`13/13 semantics resolved`) and `nextSteps`. Read
`staged/<name>.report.json`: `clipMapping.missing`, `clipMapping.loopDoesNotClose`, `textureChanges`,
`scaleProblems`, `skinWeights.unweighted` must be empty / 0 before the validator can pass. The validator must
print `all staging checks passed` for both entries. Fix causes in Blender, re-export, re-ingest; do not edit
the staged GLB or the manifest by hand. The whole vendor path was proven on a synthetic file
(`docs/VENDOR_INGEST.md` "Dry run"); a failure here is a data problem in the export, not an unknown code path.

Budgets the validator enforces for the dog: ≤ 18k triangles, ≤ 3 MB per file, ≤ 3 draw calls, each texture
≤ 1024², decoded texture estimate ≤ 6 MiB, ≤ 4 influences, min y ±1 cm, +Z forward, shoulder by bounds
±15 %, clips as in section 5. The 8 MB total is only reported in staging mode; what ships up front is a
D-decision with the hero (D-038).

## 9. Hero review harness (WP-M, ines-1f) and visual acceptance

The review mode of the renderer dev harness (`src/render/dev/scene.html`, `src/render/dev/review.ts`) landed
with WP-M (2026-10-10). Forms that exist today:

```sh
# A. the three live views (school/lesson/closeup) at the five viewports, with the staged manifest instead of
#    the live one; --manifest takes 'candidates', 'vendor-dryrun' or a URL path served by the Vite dev server
node src/render/dev/verify-browser.mjs \
     --manifest /art/vendor-evaluation/<vendor>/<asset>/staged/manifest.json \
     --out art/vendor-evaluation/<vendor>/<asset>/review/views
# B. side-by-side review: two subjects, same pose and clip time, fixed cameras × two light presets
node src/render/dev/verify-browser.mjs --review a=<spec> b=<spec> [pose=<poseId>] \
     --out art/vendor-evaluation/<vendor>/<asset>/review
#    subject specs: <manifestKey> (live), procedural:<key>, candidates:<key> (Blender reference staging),
#    vendor-dryrun:<key> (synthetic dry run), or <glb url>@<key>
# C. manual inspection in Chrome (npm run dev):
#   src/render/dev/scene.html?manifest=/art/vendor-evaluation/<vendor>/<asset>/staged/manifest.json
#   src/render/dev/scene.html?review=1&a=procedural:dog.nala.puppy&b=<spec>&cam=front|side|closeup_portrait|lesson_strip|landscape&light=neutral|courtyard&pose=<poseId>&turn=1
```

Limitation to know before you start: the `<glb url>@<key>` subject builds a one-entry manifest **without a
`clipMap`**, so a vendor-named clip set will not play through it; it is fine for the vendor **original**
exported untouched (silhouette and surface comparison) but not for judging the staged clips side by side.
For the staged file use form A (whole staged manifest) and, for a true side-by-side with clips, ask ines-1f
for a subject form that points at an arbitrary staged manifest (e.g. `manifest:<url>#<key>`); it is a small
addition in `review.ts`. `review.json` records triangles, draw calls, texture bytes, viewport share and
margin per subject. Keep one contact sheet per camera × light preset and the `turn=1` frames
(0/90/180/270°) in `review/`.

**Real HUD.** The game itself has no manifest switch (`public/assets/manifest.json` is the only source the
app boot reads, and it must stay untouched). The real-HUD pass with the staged model therefore happens in
two stages: (1) before the go decision, the harness cameras `closeup_portrait` (390×844), `lesson_strip`
(390×232) and `landscape` (844×390) stand in for the HUD framing, plus the full live views from form A at
360×640 / 390×844 / 844×390; (2) immediately after ines-c3's go and the manifest merge, and before the
D-number is closed, run `npm run dev` with Chrome device emulation and walk the table below in the real
HUD. Record which stage each row was judged in. Walk the acceptance list from the sourcing handoff ("Visual
acceptance") and record pass/fail per item with a screenshot filename:

| viewport | views | checks |
|---|---|---|
| 360×640 | home, L01 observe/decide/feedback, closeup, school | appealing face at gameplay size; gaze, ears and tail readable; paws grounded; no plastic coat; no fur-card bands or alpha sorting defects |
| 390×844 | same + 200 % text (Chrome font size) | closeup share 55–65 % (≥ 50 % standing, D-039), all paws/ears/tail inside with ≥ 6 % margin; dialog and dock still usable at 200 % |
| 844×390 | closeup, lesson, school | same share by height in landscape; stable highlights while the dog moves |
| any | "Bewegung reduzieren" on | poses snap, same texts, nothing animates that should not |
| any | moving close-up | record 6 s of `idle_relaxed`, `look_at_handler` and `eat` (screen recording or the `turn=1` frames); judge joint bends and harness contact in motion, not on a still |

Draw calls in the lesson view ≤ 100 (expected ≈ 6–18), read from the harness `renderer.info`. Also run
the existing checks that do not need a phone: `npm run assets:check` (live manifest must be unchanged and
green), `npm run typecheck`, `npm test`, `npm run build`, Playwright smoke (`docs/HANDOFF_VERIFICATION.md`
§5), the renderer check (§6). **Real-phone acceptance (§8) is a separate step**: do it if a phone is at hand
and record device, OS, browser, DPR, draw calls and FPS; otherwise write "not measured on a device".

## 10. Afterwards (not part of this procedure)

- ines-c3 and the user decide go / no-go from the sheet. On go, ines-c3 records a D-number; the owning work
  package copies the staged GLBs to `public/assets/models/dog_nala_puppy.glb` / `dog_nala_growing.glb`, merges
  the draft entries into `public/assets/manifest.json` with the real `status`, `source`, `license`, and runs
  `npm run assets:check`. Status is `code-authored` or a new sourced label decided then — not `final`
  (`CLAUDE.md`: never call procedural or unreviewed art final; a licensed model is also not "final" until the
  acceptance in section 9 passed on a device).
- WP-K part 3 syncs the pixel profile proportions to the accepted hero.
- Only after Nala's mobile slice is accepted: Bruno, then Mira/Alex, then the environment finish
  (sourcing handoff step 7).

## 11. Go/no-go sheet (fill completely; copy to `review/GO_NO_GO.md` and paste into the report to ines-c3)

```
Hero model go/no-go — <vendor> / <asset> — <date> — prepared by <agent/session>

Provenance        PROVENANCE.md complete: yes/no | browser-delivery permission: yes (file) / no / pending
                  AI-assisted processing permitted: yes / no / unclear | originals ignored by git: yes (check-ignore output)
Original          files, bytes, sha256 (from PROVENANCE) | triangles measured | materials | textures (res, bytes) | UV sets
                  armature joints | max influences | controller type | clips supplied (name, s, loop, root motion) | eye/lid/jaw/ear controls
Conversion        work file path | scripts 01–06 present | retarget: no / yes (why) | LOD: <before> → <after> triangles, what was reduced
                  atlas: <n> textures <res> <format> <bytes>, decoded estimate | draw calls | harness: vendor / modelled / none
                  lids+gaze: bones / shape keys baked / absent
Clips             13/13 mapped (clipmap.json) | authored new: <list> | edited vendor: <list> | loop closure ok | walk in place ok
                  treat_received at <t> s | any clip flagged by the educational meaning check (CLIP_BRIEF)
Growing           shoulder puppy <m> / growing <m> | proportion changes applied | clips re-baked | reads as the same dog: yes/no (sheet)
Pipeline          ingest output pasted (puppy, growing) | `validate-assets.mjs --staging` pasted: all staging checks passed / FAIL lines
                  bytes per file | triangles | validator E/W/I
Review            harness contact sheets: <paths> | review.json shares: closeup 390×844 <%>, 844×390 <%>, lesson <%>
                  real HUD screenshots: <paths> | acceptance table (section 9) with pass/fail per row
                  draw calls lesson view | 200 % text ok | reduced motion ok | moving close-up judged: <notes>
Device            not measured on a device | or: device, OS, browser, DPR, draw calls, FPS over 60 s
Limitations       honest list (what the model cannot do, what was not checked)
Recommendation    GO / NO-GO / GO WITH CONDITIONS: <conditions>; open decisions for ines-c3: <list>
```

## 12. Open points for ines-c3 (found while writing; not resolved here)

1. **Texture budget — decided (D-040):** 12 MiB decoded estimate per character, i.e. two 1024² textures;
   the 6 MiB in D-036 was a wording error. **Script change pending**: `scripts/lib/assetContract.mjs`
   `BUDGET.decodedTextureBytes` dog/human 6 → 12 MiB, with the matching number in `docs/VENDOR_INGEST.md`.
   Until it lands, the validator passes only one 1024² map per character.
2. **Staging directory wording — decided:** `--out` is any directory outside `public/`; conventions
   `art/staging/<name>/` for test inputs and `art/vendor-evaluation/<vendor>/<asset>/staged/` for licensed
   files. Pending in the two error strings of `scripts/ingest-vendor.mjs`; `docs/VENDOR_INGEST.md` is updated.
3. **`08_3D_ASSET_HANDOFF.md`** keeps its historical numbers; D-040 records the supersession pointer.
4. **`eat` event time — decided (D-040):** per-semantic events in `clipmap.json` (object form in section 5);
   ingest writes `clipMeta[semantic].events`, validator checks `0 < t < duration` and that `eat` has
   `treat_received`. **Script change pending** in `scripts/ingest-vendor.mjs` and `scripts/validate-assets.mjs`.
5. **Shape-key controls** (blink via morph targets) are not driven by the loader; if the hero's lids are
   shape keys only, WP-H/renderer needs a decision (bake into clips vs. morph support).
6. **Review subject for an arbitrary staged manifest** (section 9): needs a small `review.ts` addition by
   ines-1f before clips of the hero can be compared side by side with the live dog.
7. **Real-HUD stage 1 is a stand-in** (section 9): without a manifest switch in the app boot, the HUD pass
   with the staged model happens after the manifest merge. A dev-only `?manifest=` in the app would move it
   before the go decision; that is a WP-H/ines-c3 call, not part of this procedure.

## 13. Do not

- Do not purchase, download or evaluate further models; one hero source only (sourcing handoff).
- Do not contact sellers or platforms; the draft inquiry in the sourcing handoff is for the user to send.
- Do not commit `original/`, `export/` or any vendor archive; do not rename or compress originals to get
  around that (README: compression or renaming is not compliance).
- Do not write into `public/` or the live manifest; do not mark any entry `final`.
- Do not claim phone or performance results that were not measured on a named device; harness screenshots
  with SwiftShader are not phone results.
- Do not run git commands if the session rules forbid it (`CLAUDE.md`: sessions do not run git; ines-c3
  integrates). `git check-ignore` in section 1 is read-only; if even that is out of scope, ask ines-c3 to
  confirm the ignore rule.
- Do not change `src/**`, `scripts/validate-assets.mjs`, `scripts/ingest-vendor.mjs` or the contract files
  as part of this procedure; send exact lines to their owners via ines-c3 instead.
