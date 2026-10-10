> Superseded by the user-requested smooth textured puppy replacement. Continue from [HANDOFF_SOFT_PUPPY_MODELS.md](HANDOFF_SOFT_PUPPY_MODELS.md); this CC0 pass is historical and visually rejected.

# Free dog model integration — Fable 5.1 handoff

Implemented in the Ines project on 2026-10-10. The user's latest direction is **find free 3D models and implement them**. This supersedes the paid asset purchase decision in HANDOFF_PREMIUM_ASSET_SOURCING.md. Three dog variants now ship in the existing asset slots. No purchase or seller inquiry is needed for these files.

## Source and license

Quaternius, [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html), CC0 1.0 Universal. The official page permits personal and commercial projects and links the downloadable Blender sources. Original ShibaInu and Husky files, plus the included license, are preserved in `art/free-models-2026-10-10/original/`. License copy: `public/assets/licenses/Quaternius-CC0.txt`.

Creator-linked public download folder: https://drive.google.com/drive/folders/1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk

Downloaded source IDs: ShibaInu `1HbN45J5I19ZZsuMwEqW0caho-EWp0VfX`; Husky `1TZJdLLCJ2fhd8wOEDI9BsJY9B7SIXCd4`; License `1F2uy8T2fRpdc6gZ4mnS02_C2E63WvKtn`. Original source files are unchanged. No other third-party model was installed.

## What ships

| Asset slot | Adapted source | Bytes | Triangles | Draw calls | Clips |
| --- | --- | ---: | ---: | ---: | ---: |
| dog.nala.puppy | ShibaInu, honey coat | 610996 | 1950 | 1 | 13 |
| dog.nala.growing | ShibaInu, larger body and relatively smaller head | 612048 | 1950 | 1 | 13 |
| dog.bruno.puppy | Husky, chestnut and cream markings | 637432 | 1920 | 1 | 13 |

The live filenames remain `public/assets/models/dog_nala_puppy.glb`, `dog_nala_growing.glb`, `dog_bruno_puppy.glb`. Manifest entries use `rig: vendor`, vertex materials, identity clip mappings, source provenance and `productionIntegrated: true`. Status remains `code-authored` because the project adds procedural adaptation and training animations; this is an integrated prototype, not final approved art. All eight live GLBs total 3,072,364 bytes against the 8 MiB budget.

Original idle, walking and eating motions are retained. Ten educational motions are authored and baked in Blender using the original IK constraints, preserving the runtime's 13 semantic names and durations. Native walk root drift is removed. Loop endpoints close exactly. Attack/death animations are excluded. No simulation, care balance, content, pixel profile or saved progress schema was changed.

## Reproduce and edit

1. Editable original files: `art/free-models-2026-10-10/original/`.
2. Native training rigs: `art/free-models-2026-10-10/native/ShibaInu_training.blend` and `Husky_training.blend`. Edit these for animation polish. The baked GLBs beside them feed adaptation.
3. Blender/MCP authoring script: `art/free-models-2026-10-10/scripts/export_native.py`. It can also run through Blender's background Python mode. It regenerates the native training rigs from preserved originals.
4. Run `node scripts/build-free-dogs.mjs` to stage adapted files. Run `node scripts/validate-assets.mjs --staging art/free-models-2026-10-10/candidates`.
5. Inspect staged animation renders with `node art/free-models-2026-10-10/scripts/verify_candidates.mjs`. It checks 195 pose/time samples across all three dogs and renders idle, sit, rest and play bow.
6. Run `node scripts/build-free-dogs.mjs --ship` to validate and copy into live slots, then `npm run build`. The build embeds a fingerprint of the asset manifest in the service worker, so an asset-only release can trigger an update and a fresh cache.
7. `npm run assets:build` now preserves integrated CC0 dogs. The guard was verified in an isolated full build, byte-for-byte. Do not replace them with procedural placeholders.

`art/free-models-2026-10-10/free_dog_library.blend` contains the three adapted live characters for visual editing. Original training rigs retain the native IK constraints; imported GLBs contain baked animation. Keep that distinction when authoring new motion.

## Observed verification

- TypeScript typecheck and production build pass.
- Vitest: 208 tests in 18 files pass, including the updated reflection reward regression.
- Playwright: 15 tests pass across mobile 390×844, mobile 360×640 and desktop. A new check waits for the service worker and verifies the served Nala GLB's SHA-256 against the live file, plus its CC0 provenance and 13 clips.
- Asset validator: eight live GLBs, zero errors, warnings or infos; staged dog check passes without relaxed requirements.
- Candidate WebGL: 65 pose/time samples per dog, finite skinned vertices, no exploded bounds, one draw call per character. Report `art/free-models-2026-10-10/reports/verification.json`.
- Integrated WebGL review at 360×640, 390×844, 430×932, 844×390, 1440×900: framing, presentation timings, reduced motion and demand-render suspension/resumption pass. Report and screenshots under `art/free-models-2026-10-10/after/browser/`. Lesson scene: 49,140 triangles in portrait, previously 64,608; reduction approximately 24%. Draw calls remain eight in portrait. Software rendering FPS is not a phone benchmark.
- UI harness: all 46 checks pass, including 200% text, keyboard focus, German label wrapping, optional descriptions, fallback and reward rows. Final log: `art/free-models-2026-10-10/reports/ui-smoke.txt`; screenshots: `after/ui/`.
- No backend exists in this architecture. No backend pass is claimed.

Two real issues found during browser verification were fixed: the reflection route could redirect home between the store's synchronous save publication and asynchronous persistence result, skipping the reward summary; and narrow home actions could split a German word. The reflection now holds its route while completion is pending and blocks duplicate completion taps. Home secondary actions use wider columns with icons above their labels. The UI harness now explicitly requests optional observation descriptions for its toggle checks (default descriptions are always shown), and expects two marks for first learning completion: visit plus learning mark.

## Visual evidence and limitations

Before/after game renders: `art/free-models-2026-10-10/before/browser/390x844_closeup.png` and `after/browser/390x844_closeup.png`. Studio poses and Bruno's coat are in `renders/`. The before GLBs and manifest are preserved under `before/`; replacing the whole old manifest would undo other agents' work, so restore individual dog entries only if needed.

These are stylized, faceted Shiba/Husky-derived models. They are not faithful golden-retriever/beagle replacements and are not realistic high-end sculpted characters. Do not rewrite breed teaching content to fit these silhouettes without a separate product decision. There are no independent eye/lid controls or facial morph targets; gazing relies on neck/head motion. Rest/sit are newly authored prototype poses and deserve artist polish. Physical iPhone/Android touch, GPU performance, OS backgrounding and HTTPS offline installation remain unmeasured. No claim of complete book adaptation or trainer approval is made.

## Next creative work

Keep these working free assets as the baseline. Improve the native IK training animation's ease, relaxed tail carriage and floor contact before increasing polygon count. Review silhouettes at the actual phone lesson strip size. Improve lighting and the courtyard in separate changes, preserving the semantic animation API and the verified game flow. Follow `docs/BLENDER_CONNECTION.md` to configure the Blender MCP connection in Fable's client; Codex's registration does not automatically connect another client.
