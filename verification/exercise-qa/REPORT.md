# Übungen verification — 10 October 2026

Verified the local application in installed Google Chrome, using isolated saves. Deterministic world positioning was used for exercise setup; exercise selection, attempts, choices, retries, completion, and navigation were driven through the player UI.

## Issues fixed

- Rest-place lesson framing could swing outside the courtyard as Nala changed between standing and lying, putting fence rails across her body. Edge lesson cameras now stay on the courtyard side. See `framing-L03_A-observe.png`, `framing-L03_A_rest.png`, `framing-L03_C_side.png`, and `framing-L01_A_corner.png`.
- A resting dog near the foreground fence could be obscured during free practice. The yard camera now increases its elevation smoothly near the front/right boundary while preserving the viewing direction. See `framing-yard-rest-390.png` and `framing-yard-rest-844.png`.

Regression coverage is in `tests/render/lessonFraming.test.ts`. Full lesson progression coverage is in `tests/e2e/exercises.spec.ts`. The repeatable animation/practice audit is `node scripts/verify-exercises.mjs`; it starts an isolated Vite server with hot reload disabled.

## Verified coverage

- All three lessons, all nine authored rounds, supported retries, inserted unaided repetitions, exercise response choices, care closure, reflection, reward confirmation, and reload persistence.
- 40 observation/variant/decision animation cases for each growth stage: 80/80 expected settled poses, actual shipped GLBs, finite geometry, and no page errors. Measurements: `lesson-animation-arriving-after.json` and `lesson-animation-growing-after.json`. Contact sheets were captured during the original pose audit; the `framing-*` screenshots show the camera fixes afterward.
- All three free Übungen — Rufen und Kommen, Eine ruhige Stelle finden, Auf einen Blick warten — with none/toy/other-dog distraction, at 390×844, 360×640 with reduced motion, and 1440×900: 27/27 combinations. Each includes an attempt, repeat, and exit. Tested successful responses and adverse toy/other-dog responses. Results: `results.json`; screenshots: `{width}-{kind}-{distraction}.png`.
- Movement controls at 360×640, 390×844, 430×932, and 844×390, including press/release, cancellation, and hiding controls under sheets.
- WebGL-unavailable text fallback, challenge save isolation, second-tab ownership, shipped model availability, and installed service-worker assets.
- 308 unit/integration tests passed; three new framing regressions included. Four targeted yard renderer checks passed. Type checking, production build, and all asset checks passed.

Final production browser run: **33/33 passed** across mobile-390, mobile-360, and desktop (3.6 minutes). See `final-browser/` for screenshots and the Playwright completion state.

## Test environment

The production browser run used a frozen copy of the final build on a dedicated preview port. Initial shared-preview failures were caused by an older build and concurrent rebuilds; the checks were repeated against the frozen build. Developer animation review used software WebGL where configured. These results cover local Chrome automation, not physical-device Safari testing or a deployment of the changes to the public site.
