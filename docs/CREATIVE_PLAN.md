# Pfotenzeit — creative plan (milestone: Nala / L01 slice)

Prepared 2026-10-09 by ines-c3 from `docs/HANDOFF_CREATIVE_FABLE_5_1.md`, the verification screenshots in `verification/` and the reference sheets in `docs/pfotenzeit/characters/`. Baseline commit `bd09218` plus the uncommitted verification fixes (D-032) are the starting point and must be preserved.

## 1. Visual baseline (observed in verification/renderer and verification/ui, 390×844)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | Closeup camera frames the whole lawn patch; Nala occupies ~15 % of the portrait height, body language unreadable at phone distance | `renderer/390x844_closeup.png` | high |
| F2 | School view shows the full fence; Nala is a ~40 px figure, lower-left of centre; 60 % of the frame is empty chalk | `renderer/390x844_school.png` | high |
| F3 | Nala reads as assembled primitives: visible seams at shoulder/hip, tubular legs, rigid neck join, box muzzle, tail a stiff rod | `renderer/390x844_closeup.png`, `docs/ASSET_REPORT.md` | high |
| F4 | Eyes: dark discs with an odd brow ridge, no lids, no gaze; expression reads worried rather than soft | closeup | high |
| F5 | Harness: thin band and neck loop, no body contact shading; buckle floats | closeup | medium |
| F6 | Courtyard: flat slab, hard lawn edge, shelter is four posts and a roof, rest deck and planters are boxes, no ground texture, no contact darkening except under actors | school | medium |
| F7 | Mira: stiff capsule figure, flat hair, no face; stands inside the training circle like a marker | school | medium |
| F8 | Lesson HUD: the scene strip between header and dialog is correct (D-032) but the dialog card and dock are heavy; the observation text competes with the picture | `ui/05-lesson-decide.png` | medium |
| F9 | No reaction choreography: option → pose cross-fade only; no anticipation, no camera accent, reward is a toast | acceptance screenshots, presenter | medium |
| F10 | Pixel Nala and 3D Nala share colours but not proportions (pixel head larger, ears shorter) | `public/assets/pixel/*.png` vs closeup | low |

## 2. Direction (within 06 Art Direction, no new aesthetic)

- **Readable dog first.** In `closeup` Nala fills 55–65 % of the portrait height with ears, eyes, tail and all four paws inside the frame; in `lesson` 40–50 %. The camera looks slightly down (22–28°) and from front-three-quarter so the eyes and the tail are both visible.
- **Continuous body.** One smoothly blended surface for torso, neck, head and upper limbs (loft/metaball-style blending in the generator), separate paws, ears and tail that still deform with their bones. Soft silhouette, restrained puppy proportions, no toy anatomy.
- **Eyes that can look and blink.** Eyeballs with iris/pupil, upper and lower lids as bones, gaze bones; lids half-closed for tired/rest, wide-soft for relaxed, narrowed with tense ears for tense. No permanent grin; mouth closed by default.
- **Posture tells the story.** Each pose has a distinct silhouette: relaxed (level tail, soft ears), look_at_handler (head turn + ear lift), sniff (nose down, tail level, slow sweep), turn_away (body yaw, head low, tail low, ears back), tense_idle (weight back, stiff legs, tail low, lids narrowed), tired_idle (head low, slow sway, lids heavy), rest (curled). Tail never a generic happiness meter.
- **Quiet, grounded yard.** Matte wood, sand with a slight colour variation and a soft lawn edge, baked contact darkening under the shelter and props, a visible water bowl, a few plants with silhouette. Shadows stay off on low tier.
- **Calm choreography.** Decision → 250–400 ms camera accent toward the dog → reaction clip → 600 ms settle → feedback card slides up. Reward: a short gold mark glint at the header counter, not over the dog. Reduced motion: instant pose, same texts.
- **UI stays paper-and-wood.** Lighter cards (less padding, no double borders), observation text in a single calm block, options as rounded wood-tone buttons; nothing glassy, no dashboard.

## 3. Milestone scope and work split (parallel, disjoint files)

| Package | Window | Owns | Deliverable |
|---|---|---|---|
| WP-G Nala v2 model and clips | ines-bc | `scripts/lib/{dogGeometry,dogProportions,skeleton,skinning,dogClips}.mjs`, `scripts/validate-assets.mjs`, `docs/ASSET_REPORT.md` (dog sections) | continuous Nala (puppy + growing) and Bruno with lid/gaze bones, improved harness, 13 distinct clips with blink/gaze, validator updated (D-033) |
| WP-H camera, lighting, choreography | ines-1f | `src/render/**` | closeup/lesson/school framing targets, grounded lighting, decision/reaction/reward choreography, GLB lid/gaze support, FPS-safe |
| WP-I courtyard and cast props | ines-93 | `scripts/lib/{environment,humanGeometry,humanClips}.mjs`, `scripts/build-models.mjs` (static + human sections), `docs/ASSET_REPORT.md` (environment/human sections) | yard v2 (ground variation, soft lawn edge, shelter with walls/bench, planters, plants, water), props v2, Mira/Alex v2 with faces/hair volume |
| WP-J lesson HUD and reward feel | ines-24 | `src/ui/**` (except `pixel/`), `src/input/**`, `src/audio/**` | lighter lesson cards, observation/feedback hierarchy, reward moment, reflection polish, profile shows pose description under reduced motion; keep D-032 |
| WP-K content for readability | ines-96 | `src/content/**`, `src/ui/pixel/**`, `tests/content/**` | German pose descriptions per PoseId (`de.poses`), absorb UI-only strings from `src/ui/strings.ts`, pixel proportions synced to Nala v2 (after WP-G lands) |
| Integration, plan, review | ines-c3 | configs, `docs/CREATIVE_PLAN.md`, `docs/CREATIVE_REVIEW.md`, `PROGRESS.md`, `docs/DECISIONS.md` | contracts, acceptance, before/after screenshot run (outside sandbox), review |

Order inside the milestone: B (Nala) and framing first, then C (yard/choreography), then D (cast, pixel), then E (stabilize with the existing verification scripts).

## 4. Acceptance for this milestone

- Nala fills the target share of the frame in closeup/lesson at 360×640, 390×844, 430×932 and 844×390, with ears, eyes, tail and paws inside the frame (renderer check updated).
- All 13 dog clips visibly distinct in the real HUD; lids and gaze move; harness sits on the body in every pose.
- `npm run assets:check` passes with the updated validator; dog ≤ 18k triangles, ≤ 3 MB; lesson draw calls ≤ 100.
- Existing automated suites still pass (201 unit/integration, 12 e2e, renderer checks, UI harness, acceptance scripts) outside the sandbox.
- Before/after screenshots for home, L01 observe/decide/feedback, profile, school, growth in `verification/creative/`.
- `docs/CREATIVE_REVIEW.md` written with observed results and honest limits (no phone results unless obtained).
