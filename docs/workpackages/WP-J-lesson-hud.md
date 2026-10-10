# WP-J — Lesson HUD, feedback and reward feel, reduced-motion readability (session: ines-24)

Read first: `docs/CREATIVE_PLAN.md` (F8, F9, F10 UI side; direction §2), `docs/DECISIONS.md` D-032, D-035, `docs/HANDOFF_CREATIVE_FABLE_5_1.md` §4C, §7, `docs/pfotenzeit/05_MOBILE_UX.md`, `06_ART_DIRECTION.md` (UI), baseline `verification/ui/*.png` (view with Read: 01, 03–06, 07, 10, 13, 14).

## Mission
Make the lesson screen feel like a calm observation, not a form: lighter cards, clear hierarchy (picture → observation → choice → feedback), a satisfying but short reward moment, and equivalent readability under reduced motion and WebGL fallback. Preserve every D-032 fix (scene strip measurement, banner tap-through, 300 ms sheet guard, 48 px targets, 200 % text).

## You own
`src/ui/**` except `src/ui/pixel/**`, `src/input/**`, `src/audio/**`. Content strings come from `src/content/de.ts` (WP-K is adding `de.poses` descriptions and absorbing the strings from `src/ui/strings.ts`; keep `t` as the facade so the switch is mechanical). Renderer changes are WP-H (ines-1f); if you need a hook (e.g. reward anchor coordinates), message ines-1f and ines-c3 with the proposal.

## Lesson screen (F8)
- Header: learning point + round counter in one slim line (≤ 44 px), supported/inserted labels as a small tag.
- Scene strip: keep the measured gap logic; aim for the strip to take ≥ 50 % of the viewport height at 390×844 in `observe`/`decide` by trimming card padding and the dock (dock ≤ 28 % of height stays the rule). Buttons 52–56 px, 8 px gaps.
- Observation card: title + one calm paragraph; "Genauer ansehen" is a quiet text button that expands the description inline with a thin sage rule, not a boxed callout; description scrolls inside the card if long.
- Decide: 2–3 option buttons in wood/chalk tones; the overflow "Menü" becomes a small icon button at the dock's right edge (still 48 px) so options get the width.
- React: inputs locked; show a one-line "Schau, was passiert …" without a spinner.
- Feedback: card slides up ≤ 200 ms (instant under reduced motion), feedback sentence first, Mira's line as a quoted line with her name, "Im Alltag" collapsible, "Weiter" primary. Helpful vs other direction indicated by a small symbol + text, never only colour.
- Reflection: success sentence, learning sentence, reward summary as three small rows (Marke, Erinnerung, Lernpunkt) with the glint timing from D-035; both closing buttons equal weight.

## Reward and sound (F9)
Mark counter in the header animates +1 (300 ms) when `visitRewarded`/`upgradeBought` is presented; audio chime stays optional. No reward animation over the dog.

## Reduced motion and fallback (handoff §4B)
When reduced motion is on or the renderer is not `ready`, show under the scene strip a one-line German pose description from `de.poses[poseId]` (WP-K; until it lands use the existing observation description) so the body language stays readable; the WebGL fallback view uses the same line. Keep the pixel face in the profile.

## Pixel/3D sync (F10, UI side)
Nothing to change in sprites (WP-K); ensure the profile canvas scaling keeps hard pixels at 2× and 3× DPR after layout changes.

## Deliverable and report
`npm run typecheck`, `npm run build` green; update `src/ui/dev/smoke.mjs` checks if layout rules changed (strip ≥ 50 % at 390×844 in observe/decide, dock ≤ 28 %). Message ines-c3 with: what changed, which D-032 behaviours you re-verified in code, open hooks requested from WP-H/WP-K, and commands run with real output. Browser screenshots are taken outside the sandbox by the verification run.
