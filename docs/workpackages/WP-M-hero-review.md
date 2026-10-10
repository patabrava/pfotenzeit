# WP-M — Hero review harness, bone-name audit, vendor dry-run load (session: ines-1f)

Read first: `docs/HANDOFF_PREMIUM_ASSET_SOURCING.md` step 4 ("small actual Three.js hero review") and step 5, `docs/DECISIONS.md` D-034/D-035/D-038/D-039, your `src/render/dev/scene.html` and `verify-browser.mjs`.

## You own
`src/render/**` (not `types.ts`; if a manifest field is needed, send the exact type addition to ines-c3 and the validator rule to ines-bc).

## Part 1 — review mode in the dev harness
`scene.html?review=1&a=<manifestKey|url>&b=<manifestKey|url>[&light=neutral|courtyard][&pose=<poseId>][&turn=1]`:
- two instances side by side on one canvas (or two canvases, your call, but one screenshot), same pose, same clip time, same ground;
- fixed cameras selectable with `&cam=front|side|closeup_portrait|lesson_strip|landscape`: front and side orthographic-ish at shoulder height; closeup_portrait = the D-034/D-039 closeup at 390×844; lesson_strip = 390×232 lesson framing; landscape = 844×390 closeup;
- two lighting presets: `neutral` (white hemisphere + soft key, no colour grading) and `courtyard` (the live WP-H rig);
- `turn=1` rotates both subjects 360° over 6 s for the moving close-up (screenshots at 0/90/180/270 in verify-browser);
- `a`/`b` accept a live manifest key (procedural fallback allowed), `candidates:<key>` (staged Blender manifest) or a direct GLB url; pending entries accepted in dev only.
`verify-browser.mjs --review a=<…> b=<…> --out <dir>` writes one contact sheet per camera × light preset plus `review.json` (triangles, draw calls, texture bytes, share, margin per subject). Node check: one CPU snapshot of the review layout (procedural Nala vs staged candidate) so the layout is proven in the sandbox.

## Part 2 — bone-name audit for GLB actors
List every place the renderer relies on project bone names or project skeleton structure for a GLB actor (gaze eye bones are known and optional; check attachments, look-at targets, contact shadow, reward/treat positions, name labels, growth blend, pose fallbacks). For each: either make it work from the deformed-surface bounds / skin root, or specify a manifest field `attachments: { head?: string, mouth?: string, chest?: string, tailTip?: string }` (bone names in the file) with sensible fallbacks when absent. Send me the exact field proposal before implementing it; ines-bc adds the validator rule.

## Part 3 — load the vendor dry run
When ines-bc messages the path of `art/staging/vendor-dryrun/staged/manifest.json`: load it in the Node check via `manifestUrl`, assert clipMap resolution (vendor names → semantic), that `Attack01`/`Walk_RootMotion` are ignored, that framing holds without any project bone names, and that gaze silently does nothing. Add `?manifest=vendor-dryrun` to the harness.

## Report to ines-c3
`npx tsc --noEmit`, Node check count, the audit list with your decision per item, the review-mode URL examples, real output.
