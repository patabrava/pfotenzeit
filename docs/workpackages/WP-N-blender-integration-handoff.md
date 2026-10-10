# WP-N — Outside-sandbox handoff for integrating the purchased hero model (session: ines-93)

Read first: `docs/HANDOFF_PREMIUM_ASSET_SOURCING.md` (all; steps 3–7 are what you document), `docs/BLENDER_CONNECTION.md`, `docs/HANDOFF_BLENDER_REFERENCE_PASS.md` (how the previous Blender pass exported and validated), `docs/VENDOR_INGEST.md`, `docs/DECISIONS.md` D-036..D-039, `art/vendor-evaluation/README.md`, `docs/pfotenzeit/08_3D_ASSET_HANDOFF.md`, `07_CHARAKTERE.md` (Nala identity, growth).

## Deliverable
`docs/HANDOFF_HERO_BLENDER_INTEGRATION.md`: a procedure another LLM runs outside the sandbox with Blender 5.2 + MCP, from "the user bought candidate A and put the files in `art/vendor-evaluation/<vendor>/<asset>/original/`" to "a validated staged GLB plus review screenshots exist and ines-c3 has a go/no-go sheet". Documentation only; do not touch assets, scripts or `src/**`.

## Must contain
1. Preconditions: PROVENANCE.md filled (template in `art/vendor-evaluation/README.md`), license answer for browser delivery recorded, nothing in `public/` touched.
2. Blender MCP session rules (separate scene, never the live scene, save as `blender/<asset>_work.blend`, reproducible Python conversion script committed next to it).
3. Inventory checklist and what to record: actual triangles, materials, texture sizes/memory, UV sets, rig joints and influences, every supplied clip with duration/loop/root motion, eye/lid/jaw/ear controls, scale/axis/pivot.
4. Conversion: metres, +Y up, +Z forward, floor pivot, root scale 1, ≤ 4 influences, bake runtime-system animation (CAT/Unity/Unreal controllers do not exist in Three.js), keep the vendor rig unless retargeting is deliberate (step 5), LOD to 12–18k triangles keeping muzzle and eyelids last, texture atlas ≤ 2 × 1024² (D-036), harness fit without intersections.
5. Clip authoring: all 13 semantics per `docs/CLIP_BRIEF.md` (ines-96 writes it in parallel; reference it by path, do not duplicate), loop closure, `treat_received` event on eat, no attack/death substitutes, walk in place.
6. Growing variant: proportion change (shoulder 0.28 → 0.36 m, longer legs, relatively smaller head, same markings), not uniform scale; second GLB `dog_nala_growing`.
7. Export + pipeline: `scripts/ingest-vendor.mjs` → `scripts/validate-assets.mjs --staging` → hero review harness (`scene.html?review=1…`, `verify-browser.mjs --review`, WP-M) → acceptance list from the sourcing handoff ("Visual acceptance") at 360×640, 390×844, 844×390 with the real HUD, 200 % text, reduced motion, moving close-up.
8. Go/no-go sheet template for ines-c3 and the user, and what happens next (manifest entry via D-0xx decision, pixel sync WP-K part 3, then Bruno/humans).
9. Explicit "do not": purchase more, contact sellers, commit originals, mark `final`, claim phone results.

## Report to ines-c3
Path of the document, a 5-line summary, anything in the existing docs that contradicts it (cite file + line) so I can fix the pointers.
