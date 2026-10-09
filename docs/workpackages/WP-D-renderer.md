# WP-D — Three.js renderer: scene, actors, camera, demand rendering (session: ines-1f)

Read first: `/CLAUDE.md`, `docs/DECISIONS.md` (D-010), `docs/pfotenzeit/14_CLAUDE_EXECUTION.md` (B temporary dogs, C renderer adapter), `06_ART_DIRECTION.md`, `07_CHARAKTERE.md`, `08_3D_ASSET_HANDOFF.md` (skeleton, clip contract, coordinates), `16_ASSET_PRODUCTION.md` (manifest, placeholder branch), `09_TECHNIK.md` (Rendering und Laden). Look at `docs/pfotenzeit/characters/*.png` for identity.

## Mission

Implement `RendererHandle` (`src/render/types.ts`): a demand-rendered Three.js scene that projects a `SceneDirective` — courtyard, Nala, Bruno, Mira, Alex, props, two upgrades, three camera views — with **procedural articulated placeholders first**, and a GLB path that swaps in rigged models from the manifest without changing any behaviour. ines-c3 is producing code-authored GLBs in parallel with the same skeleton and clip names; your AssetManager must load them when `manifest.assets[key].status !== 'placeholder' && url` and otherwise use your procedural actors.

## You own (write only here)

- `src/render/app/GameRenderer.ts` — `createRenderer(options): RendererHandle`
- `src/render/app/CameraRig.ts` — `school` / `lesson` / `closeup` framings, portrait-first, 250–400 ms eased moves (instant with reduced motion)
- `src/render/app/resize.ts` — ResizeObserver, DPR policy (1–1.5 on low tier; never raw devicePixelRatio unchecked), ortho frustum sync
- `src/render/app/loop.ts` — `invalidate()` scheduling at most one rAF; continuous frames only while animations run; visual dt clamp 0.1 s
- `src/render/loaders/AssetManager.ts` — manifest fetch (`${baseUrl}assets/manifest.json`), GLTFLoader from `three/examples/jsm/loaders/GLTFLoader.js` (no Draco/KTX2 unless a decoder ships — not now), SkeletonUtils clone per instance, cache, ref-counted disposal
- `src/render/objects/DogActor.ts`, `HumanActor.ts`, `SchoolScene.ts`, `Props.ts`
- `src/render/materials/palette.ts` — MeshStandardMaterial/MeshLambert variants from the 06 palette and character colours
- `src/render/anim/PoseController.ts` — maps `PoseId`/`GestureId` to procedural poses or AnimationMixer clips with cross-fades; missing clip → defined fallback pose + timeout, never a blocked promise
- `src/render/fallback.ts` — WebGL unavailable / context lost handling (status, DOM stays usable)

Read-only: `src/render/types.ts`, `src/simulation/types.ts`, `src/content/**` (character colours), `src/state/store.ts`. You do not touch the store or the UI; the UI calls your handle.

## Procedural actors (14 B) — first deliverable

Build dogs from connected Three objects with a real hierarchy so poses are joint rotations, not swapped meshes:
```
root (ground origin) → pelvis → spine01 → spine02 → neck → head → {muzzle, earL(2 segments), earR, eyes}
pelvis → tail01 → tail02 → tail03
legs: shoulderL/R → upperArm → foreArm → paw ; hipL/R → thigh → shin → paw
harness: band around chest (sage for Nala, apricot for Bruno)
```
Use `CapsuleGeometry`/`SphereGeometry`/`CylinderGeometry` with the character colours from `content.dogs[id].colors`: Nala honey body, cream chest/paws/forehead stripe, floppy ears; Bruno chestnut, white muzzle/chest/toes, white forehead stripe and tail tip, folded ears, stockier. Proportions from 07: shoulder heights 0.28 m (arriving) / 0.36 m (growing, longer legs, relatively smaller head — **not** a uniform scale) / Bruno 0.31 m. Eyes dark brown with visible iris, normal lids; no permanent grin.

Poses (all 13 `PoseId`) as procedural keyframes on the joint hierarchy with eased blends: idle_relaxed (subtle breathing scale on chest only, ears/tail still unless performing), look_at_handler (head turn toward the human position + soft body shift), sniff (head down, slow lateral sweep), walk (in-place leg cycle; runtime moves position between StagePositions along a straight path, no foot sliding: step cycle phase tied to distance), sit, lie_down, rest_loop (lying, slow breathing), eat (head to bowl, small jaw motion), play_bow (front down, rear up, tail up), turn_away (body rotates away, head low, tail lower), tense_idle (stiff stance, ears back, tail low, slight weight shift back), tired_idle (lowered head, slow sway, eventually lying), recover (from tense to relaxed over 2 s). `hold:true` in the directive freezes idle variation so the observation picture never changes unnoticed (15).

Humans: simple stylized adults (capsule torso, head, limbs) with Mira (forest green over cream, dark bun, medium brown skin, reward pouch at hip) and Alex (terracotta top, charcoal trousers, light olive skin); gestures idle, greet (hand raise), gesture_explain (open side-on posture, one hand), offer_reward (kneel-ish lowering, hand forward, never looming over the dog), kneel.

School (06): compact fenced courtyard with wooden shelter, training area, rest place (blanket zone, always present), sniff corner (planter boxes; props appear when the upgrade is owned), water bowl, a few plants and props. Three `EnvironmentId`s: `courtyard`, `courtyard_loud` (add the rolling toy/leaf prop and a slightly busier edge), `rest_place` / `sniff_corner` (camera on those zones). Draw-call budget ≤ 100 in the lesson view; merge static geometry where sensible.

Lighting/colour (14 C): `renderer.outputColorSpace = SRGBColorSpace`, `ACESFilmicToneMapping` low exposure or `NoToneMapping` — decide and document; warm key `DirectionalLight` + `HemisphereLight` fill; no shadows on low tier, small shadow map (1024) optional on high; `MeshStandardMaterial` with roughness ~0.8. Background colour from the chalk palette so there is never a white flash.

Camera (06): fixed elevated three-quarter orthographic view, ~35° down. `school` frames the yard with Nala centred in the lower-middle; `lesson` frames the focus dog in the middle 55 % of the portrait viewport with paws and tail inside; `closeup` frames head + body for body language. Verify framing at 360×640, 390×844, 430×932, 844×390 and 1440×900 (the frustum adapts; the dog never leaves the frame). No OrbitControls.

## Renderer handle behaviour

- `mount(container)`: try `WebGLRenderer({antialias: dpr<=1.5, powerPreference:'low-power', alpha:false})`; on failure set `'failed'` and resolve. Register `webglcontextlost` (preventDefault, status `'contextLost'`, stop loop) and `webglcontextrestored` (rebuild, status `'ready'`).
- `apply(directive)`: diff against previous; move/rotate actors to `StagePosition`s (`center`, `left`, `right`, `rest`, `sniff`, `edge` are fixed yard coordinates), set poses, props, environment, upgrades, camera view; call `invalidate()`. Growth stage change swaps proportions (actor rebuild or parameter change) — never mid-animation; the UI only applies growth after `CONFIRM_GROWTH` outside lessons.
- `present(effect, options)`: care → eat/rest/play/recover animation with the bowl/blanket/toy prop reaching the dog (3–5 s, `maxDurationMs` from the UI; reduced motion → ≤ 300 ms snap). decision → cross-fade to `poseAfter`, optional human gesture. visitRewarded → a tiny gold mark particle burst near the UI anchor (keep it subtle; no purchase animation over the dog for upgrades). growth → short grow blend (1.5 s). lost → resolve immediately (no 3D death clip, 08). Always resolve by `maxDurationMs`.
- `setActive(false)`: cancel the rAF, stop mixers; `setActive(true)`: resume and invalidate.
- `getMetrics()`: from `renderer.info` + a 1 s FPS sampler while active.
- Disposal: geometries/materials/textures released through AssetManager ref counts.

## GLB path

`AssetManager.load(key)` reads the manifest entry; if `status` is `'code-authored'` or `'final'` and the URL loads and validates (has a `SkinnedMesh` and the expected clip names) → `GlbDogActor` using `AnimationMixer`, `SkeletonUtils.clone`, cross-fades, clip metadata events (e.g. `eat` resolves at clip end). Any load/validation error → log once, fall back to the procedural actor, report `assetTiers[key]='procedural'`. The same `PoseController` API wraps both tiers so the UI never knows which is active. Expected manifest keys: `dog.nala.puppy`, `dog.nala.growing`, `dog.bruno.puppy`, `human.mira`, `human.alex`, `environment.school`, `props.care`, `props.upgrades`. Coordinates: metres, +Y up, forward +Z, origin on the ground.

## Dev harness

Add `src/render/devScene.ts` exporting `mountDevScene(container)` that cycles through directives/poses with on-screen buttons (dev only, imported from the debug panel of WP-C). Use `npm run dev` and open `/?dev=scene` (WP-C will route this) — until then create `dev/scene.html` under `src/render/dev/` and open it via Vite (`vite` serves any html inside the root: put it at `/scene.html` in the project root? No — ask ines-c3 if you need a root file; preferred: export the harness and let WP-C/E wire a query flag).

## Done means
`npm run typecheck` clean, `npm run build` clean, all 13 poses + 5 gestures demonstrably distinct, demand rendering verified (no rAF while inactive — check with `renderer.info.render.frame` not increasing), framing verified at the five viewports, draw calls reported. Message ines-c3: what exists, the tone-mapping decision, measured draw calls/triangles, how GLB swapping is detected, commands run with results.
