# Pfotenzeit — execution instructions

## Mission

Build a playable mobile-first dog-training web prototype. Plain Three.js + TypeScript + Vite. DOM UI, German game text, English user communication. Preserve the existing design and finish the MVP in 10_MVP_ROADMAP.md.

## Read first

00_START_HERE_CLAUDE.md → 14_CLAUDE_EXECUTION.md → 02_SPIELSCHLEIFE.md → 04_PFLEGE_CHALLENGE.md → 05_MOBILE_UX.md → 15_DATEN_REGELN.md. For art read 06, 07, 08, 13 and 16. For validation read 11 and 17. All referenced filenames are relative to this handoff folder; they are not filesystem paths from another computer.

## Precedence

User instructions outrank this package. Plain Three.js supersedes the old R3F suggestion. The explicit clarifications in 15_DATEN_REGELN.md resolve ambiguities in the earlier state sketch; product/care constants come from 02 and 04. Log any remaining genuine conflict and choose the interpretation preserving the stated user experience. Do not silently change care rules, gameplay length or mobile-first scope.

## Non-negotiable boundaries

- Rules contain no Three.js or DOM imports.
- Rendering projects domain state; it does not own progression or health.
- Pixel profile and 3D share one state. Separate saves for standard/challenge.
- Free feeding, rest and pause always available; no paywalls.
- Absence cannot cause death. Standard starts by default.
- Touch-first, no hover-only controls or reaction timers.
- No React/R3F/Drei, physics engine, backend or multiplayer needed for this MVP.
- Character sheets are references, not rigged assets. Identify placeholders honestly.
- Book material is incomplete; do not claim a complete book adaptation.

## Workflow

Inspect repository instructions and existing files before editing. Implement a complete vertical slice before broad polish. Run meaningful rule tests, typecheck/build and browser checks for each milestone. Track work in PROGRESS.md: completed, currently building, verified, next, blockers, asset status. Avoid rewriting working systems without evidence.

If a tool is missing, use a documented reversible fallback and continue. Lack of Blender or image-to-3D access is an asset blocker, not a blocker for simulation/UI. Ask for access only when it truly becomes necessary. Do not imply that a procedural dog meets final art acceptance.

## Completion report

Provide local run commands, playable status, verification evidence, actual device/browser results, pending final models, remaining book review and any known bugs. Do not claim real-device testing from desktop emulation. Public hosting is a separate user-authorized step.
