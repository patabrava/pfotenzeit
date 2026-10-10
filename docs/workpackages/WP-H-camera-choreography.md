# WP-H — Camera framing, grounded lighting, reaction choreography (session: ines-1f)

Read first: `docs/CREATIVE_PLAN.md` (F1, F2, F6 lighting part, F9; direction §2), `docs/DECISIONS.md` D-032..D-035, `docs/HANDOFF_CREATIVE_FABLE_5_1.md` §4A–C, §7, `docs/VERIFICATION_REPORT.md` (measurements), baseline screenshots `verification/renderer/*.png` and `verification/ui/0[4-6]*.png`.

## Mission
Make the dog the picture. Re-frame all three camera views to D-034, ground the scene with light and contact shading inside the mobile budget, and add the calm decision → reaction → feedback → reward choreography of D-035. Support the new lid/gaze bones from GLBs (WP-G) without depending on them.

## You own
`src/render/**` (keep `src/render/types.ts` unchanged unless you message ines-c3 with the diff). Do not edit `src/ui/**`: the UI calls `present()`/`apply()`; if you need a new hook (e.g. an anchor for the reward glint), propose it via message and continue with a default.

## Framing (F1, F2, D-034)
- `CameraRig`: compute the frustum from the focus dog's skinned bounds (ears, tail, paws) so the dog fills 55–65 % of viewport height in `closeup`, 40–50 % in `lesson`, with ≥ 6 % margin; elevation 22–28° closeup, ~30° lesson; azimuth front three-quarter on the side where the human stands so eyes and tail are both visible. Growing Nala and Bruno must satisfy the same share (bounds-driven, not constant-driven).
- `school`: frame the training circle, shelter front and rest deck; Nala at ≥ 18 % of viewport height in the lower-middle third; the full fence may be cut. Landscape 844×390 keeps the same height share.
- The lesson strip measured by `AppShell` (D-032) is the viewport you receive via resize; verify framing against the real strip (dev harness + verify-browser), not only the full-screen dev scene.
- Update `src/render/dev/renderer.check.ts` to assert the D-034 numbers at the five viewports for arriving/growing Nala and Bruno in idle, sit, lie_down, play_bow, turn_away.

## Lighting and grounding (F6 light part)
Warm key from front-left-above, hemisphere fill, slightly cooler ground bounce; keep NoToneMapping + sRGB (D-029). Add a soft radial contact shadow under each actor sized from its bounds (already a blob: make it elliptical, directional, fade with height in play_bow/sit). Ground colour variation via vertex colours is WP-I's; you may add a very subtle vignette on the canvas clear colour toward chalk at the edges only if it costs nothing. High tier shadow map stays optional.

## Choreography (F9, D-035)
- `present({type:'decision'})`: 250–400 ms eased camera accent (slight push-in toward the focus dog, 3–5 % frustum change) → cross-fade to `poseAfter` (clip or procedural) → human gesture if the directive provides one → ≤ 600 ms settle → resolve. Reduced motion: no accent, instant pose, resolve immediately.
- `present({type:'visitRewarded'|'upgradeBought'})`: tiny gold glint (6–10 sprites, 500 ms) at a screen-space anchor near the top of the canvas (header counter), never over the dog; resolve in ≤ 700 ms.
- `present({type:'care'})`: prop approaches (bowl/blanket/toy) and the dog's clip plays; resolve at the clip event (`treat_received`) or `maxDurationMs`.
- `present({type:'growth'})`: 1.5 s proportion blend stays.
- Hold semantics stay: during `observe`/`decide` the picture does not change except blink.

## GLB lids/gaze (D-033)
`MixerPerformer`: nothing to do for clips. Add a light gaze layer: when the directive has a human and the pose is `look_at_handler`, rotate `eye_l/eye_r` bones (if present) toward the human within ±20°; otherwise leave clip values. Skip silently when bones are absent (procedural rig).

## Budget
Lesson view ≤ 100 draw calls (currently 10). No new textures larger than 256². No post-processing. Keep demand rendering: zero frames while inactive or held.

## Deliverable and report
`npm run typecheck`, `npm run build`, `npx vitest run --config src/render/dev/vitest.config.ts` green with the D-034 assertions added. Message ines-c3 with: framing numbers achieved per viewport, the choreography timings, draw calls/triangles from the Node traversal, anything you need from the UI (anchor hook) or the assets (bounds), and the dev-scene path for screenshots. Browser screenshots are taken outside the sandbox by ines-c3's verification run.
