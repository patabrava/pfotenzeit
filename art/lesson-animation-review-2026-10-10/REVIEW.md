# Lesson animation review — 10 October 2026

## Scope and outcome

Reviewed all three lessons, all nine rounds, both choices in each round, and all three additional observation variants with both responses. That is **36 cases per growth stage**, checked with the actual shipped Three.js renderer and GLBs: **72/72 correct, settled, finite GLB cases** across arriving and growing Nala. Bruno uses his shipped puppy asset in both passes.

The review harness uses real lesson data and the same scene selector, actors, animation mixer, camera and assets as gameplay. It creates an isolated in-memory save and does not modify the player's saved game. It advances the animation clock deterministically for the contact sheets, and records real-time frames for the motion proof.

## Round-by-round review

| Round | Observation animation | Helpful response | Other response |
|---|---|---|---|
| L01_A: explore | Nose lowered to the leaf; relaxed ears and gentle tail. Corner variant stages Nala at the sniff area. | Finish sniffing, raise head, relaxed standing. | Step away, turn head and body away, ears back and tail lowered. Corner response steps away locally. |
| L01_B: Bruno and rolling toy | Head and body turned away; rear weight, ears back, low quiet tail. Toy actually rolls. | Walk farther from the toy, then release tension and look around. | Remain turned away with the same low tail and ear posture. |
| L01_C: tired Nala | Lie down behind the handler, head lowered over front paws, still tail and slow breathing. | Continue resting. | Stand up slowly, then hold a tired posture with lowered head and tail. |
| L02_A: sniffing | Nose close to the ground; gentle tail sweep. Water variant appears at the water area. | Lift head and turn toward the handler. | Continue sniffing. |
| L02_B: voluntary look | Raised head and neck orient toward the real handler, slightly forward ears and middle tail height. | Keep that gaze during the reward response. | Lower head and return to sniffing. |
| L02_C: rolling ball | Distinct forward alert stance, ears forward, high fast wagging tail, head tracks the rolling ball. | Walk farther from the ball; lower the tail, turn toward the handler. | Continue watching the ball with the alert stance and fast high tail. |
| L03_A: tired at rest area | Lowered head and tail, sleepy eyelids and a slow jaw yawn cycle. | Lie down on the blanket, head over paws, slow breathing. | Follow in short stretches with pauses, then stand tired with lowered head and tail. |
| L03_B: Bruno near noise | Turn away, rear weight, ears back, low quiet tail beside the rolling toy. | Remove the toy, walk farther away, then release tension. | Keep the head and body turned away; no forced approach. |
| L03_C: quiet rest | Front resting pose with head over paws, or genuine side lying with legs extended. Almost closed eyes, still tail and slow breathing. | Remain in the selected front or side resting pose. | Lift head and stand slowly into tired standing, from either resting variant. |

## Animation and runtime fixes

- Rebuilt all three dog GLBs from the editable Blender source, with 16 semantic clips each. Added distinct alert focus, side lying and standing up clips.
- Animated ears, tail pitch and tail wag, body weight, head, jaw, paw placement and ground contact on the shipped vendor skeleton.
- Enabled the existing breathing and blinking morph shapes, scaled their vertex deltas with each dog asset, and layered the appropriate breathing and eyelid state in the renderer.
- Replaced gaze directed at nonexistent eye bones with head and neck rotation on the shipped skeleton. Each frame removes the previous additive gaze, preventing accumulating rotation.
- Kept tail, breathing and stimulus loops running during lesson observation. Reduced motion still snaps the pose and holds motion.
- Use one shared seeded variant for both lesson copy and scene pose/staging. Preserve side rest through a resting response.
- Added rest, local step-away and retreat destinations; moved the handler out of the resting dog's view. Distance responses increase the distance to the stimulus.
- Complete lying down and standing up before switching to the resting or walking loop. Keep the final pose queued while walking. Wait for the reaction instead of advancing after the former short presentation window.
- Frame edge zones from the courtyard interior and include moving stimuli in the teaching frame. Preserve dog surface sample arrays when adding framing context.

## Measured evidence

For arriving Nala, the shipped model tests measured head joint height at about **0.331 m standing**, **0.137 m sniffing**, and **0.096 m resting**. Tail joint height changes from about **0.211 m relaxed** to **0.161 m tense** and **0.312 m alert**. These are joint measurements, not nose or tail-tip surface heights.

In the actual browser review, samples 0.37 seconds apart measured about **0.0258 m tail movement in alert focus**, **0.0091 m during relaxed standing**, and **zero resting tail movement**. Resting blink influence is **0.9** and the breathing morph continues to change. The full JSON reports retain the bone transforms, morph values, focused actor pose, asset tier, position, finite surface result and framing for every case.

## Verification

- `npm test`: **21 files, 225 tests passed**. Includes new checks of every lesson variant and response, retreat distance, asset clip coverage, head height, ear contrast, tail height and sweep, still resting tail, breathing, eyelids and non-accumulating gaze on all three shipped dog assets.
- `npm run build`: passed, including TypeScript checking and the production Vite build.
- `npm run assets:check`: passed. All three dog assets: **0 errors, 0 warnings**, 16 clips each, one draw call each. Total shipped model budget: 8,179,444 bytes of 8,388,608.
- Browser contact sheets: **36/36** cases passed at each growth stage. No procedural fallback appeared in the final evidence.

## Proof files

- [L01 puppy cases](proof/L01-arriving-after.png), [L02 puppy cases](proof/L02-arriving-after.png), [L03 puppy cases](proof/L03-arriving-after.png).
- [L01 growing cases](proof/L01-growing-after.png), [L02 growing cases](proof/L02-growing-after.png), [L03 growing cases](proof/L03-growing-after.png).
- [Puppy measurements](proof/lesson-animation-arriving-after.json), [growing measurements](proof/lesson-animation-growing-after.json).
- [Motion recording](proof/lesson-animations.mp4): captured from the actual shipped renderer; covers every observation variant and the key walking, lying down, getting up and distance responses. The contact sheets cover all 36 cases.
- [Live local review](http://localhost:5173/src/render/dev/lesson-review.html): select a case to see its animation and lesson text.

## Practical limits

These are authored educational poses on a stylized floppy-eared puppy. Ear direction is shown through the ear roots, not by making floppy ears stand upright. The video is renderer evidence from the isolated review harness; it is not a recording of clicking through a player's saved visit. Static images establish the settled poses; the video and frame measurements establish motion. The reduced-motion setting intentionally suppresses looping movement.
