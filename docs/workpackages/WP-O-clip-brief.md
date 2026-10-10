# WP-O — Clip brief for vendor evaluation and Blender clip authoring (session: ines-24, reassigned 2026-10-10; ines-96 window closed)

Read first: your `de.poses` / `de.gestures` in `src/content/de.ts`, `docs/pfotenzeit/03_LERNPLAN_QUELLEN.md` (D1: several signs together, never a diagnosis), `07_CHARAKTERE.md`, `08_3D_ASSET_HANDOFF.md` (clip list, durations), `public/assets/manifest.json` `clipMeta` for the live durations/loop flags/events, `src/render/anim/dogPoses.ts` (DOG_CLIP_EVENTS), `docs/HANDOFF_PREMIUM_ASSET_SOURCING.md` step 6.

## Deliverable
`docs/CLIP_BRIEF.md` (English, German descriptions quoted verbatim from `de.ts`): one table row or short block per semantic clip, 13 dog + 5 human:
- semantic id, German description from `de.poses`/`de.gestures`;
- body signals that must be readable at phone size (ears, gaze, tail, weight, back line, mouth; for humans: posture height, hand position, side-on vs frontal);
- duration range and loop flag (take the live `clipMeta` as the baseline and say so), events (`treat_received` on eat at ≈ 2.0 s);
- what disqualifies a vendor clip for this semantic (e.g. a "happy" clip with constant tail wag for idle_relaxed; attack/alert-bark for tense_idle; death/collapse for tired_idle; any growl or bared teeth anywhere);
- which vendor clip names typically map to it (Idle, Sniff, Sit, LieDown, Sleep, Eat, Walk, Bow, Alert, Tired, GetUp …) as hints for `clipmap.json`.
Plus: a section on growing Nala identity cues (markings, harness colour, proportions, same face), and a short "educational meaning check" the reviewer runs on each clip (D1 principle: several signs together, never a feeling verdict).

Documentation only; no code or content edits. If a `de.poses` text turns out to contradict the 03/07 brief while writing, tell me the key and the proposed change instead of editing.

## Report to ines-c3
Path, clip count covered, any contradictions found (file + line).
