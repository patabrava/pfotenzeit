# WP-Q — Renderer yard mode (session: ines-1f)

Read first: `docs/WORLD_PLAN.md` (§2, §3, §5, §6 step 3, §9), `src/simulation/types.ts` (`WorldDirective`, `WorldActorDirective`, CameraView `'yard'`), `src/render/types.ts` (`updateWorld`, `pick`, `PickResult`), D-034/D-039 (framing), D-035 (choreography).

## You own
`src/render/**` except `types.ts`. Existing fixes stay (D-032, D-039). The current typecheck errors in `CameraRig.ts`/`GameRenderer.ts` (`CameraView` now includes `'yard'`) and `dev/lessonReview.ts` (`attempts`) are yours to resolve.

## Deliver
1. **Yard view** (`view: 'yard'`, `directive.world` present): actors placed at absolute `position`/`facing` in metres on the courtyard GLB (same origin as the stage), handler drawn as a quiet marker (soft ring + small chalk pawprint, no human model), Mira/Alex/Bruno/Nala from the existing actors. Camera: follow rig framing handler + dog (both inside, dog share ≥ 12 % portrait like D-039 school, slight lead in the walking direction, 320 ms ease, instant under reduced motion); landscape keeps the same subject share.
2. **`updateWorld(world)`**: per-step update (≈ 20–60 Hz) of positions/facing/speed/pose without structural work; walk clip time scaled by speed (walkCycleLength), blend to the directive pose when speed → 0; frames continue while any actor moves or blends, then back to demand mode (zero frames when still — keep the existing checks).
3. **`pick(clientX, clientY)`**: raycast against the ground plane, actor bounds (dog first, then others) and the prompt zone disc; returns `PickResult` or null outside yard view.
4. **Prompt and moment visuals**: subtle sage ring at `prompt.position` (breathing 2 s, static under reduced motion), small chalk marker at `momentSpot`; distraction: ball in the circle when `distraction === 'toy'`, Bruno + Alex at their spots (always present, `other_dog` adds no extra object).
5. **Exercise responses**: given the world's pose sequence through `updateWorld`, make `present({type:'exercise'})` resolve when the world reports settled motion (the controller calls `present`; resolve on the next `updateWorld` whose dog speed is 0 and pose equals the directive pose, or at maxDurationMs). Same for `present({type:'moment'})`.
6. **Care in the yard**: `present({type:'care'})` plays the care pose where the dog stands (bowl under the shelter, blanket on the deck): props shown at the zone, not at stage centre, when `directive.world` exists.
7. **Dev harness**: `scene.html?yard=1` with WASD/tap moving a scripted handler (no app), Node check: yard view framing (handler + dog in frame at 390×844 and 844×390), pick hits (ground/dog/zone), continuous frames only while moving, walk phase follows speed.

## Report to ines-c3
`npx tsc --noEmit`, Node check count, framing numbers for the yard view, the exact `pick` semantics, anything you need from WP-P (positions) or WP-R: message them directly and copy me.
