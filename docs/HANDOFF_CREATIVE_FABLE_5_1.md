> Current human art integration: read [HANDOFF_SOFT_HUMAN_MODELS.md](HANDOFF_SOFT_HUMAN_MODELS.md) before modifying Mira/Alex or rebuilding models. The textured puppy integration remains active.

# Pfotenzeit — creative development handoff for Fable 5.1

Latest user direction: the angular Quaternius dogs were rejected. Smooth, textured puppy variants are now integrated into all three dog slots. Read [HANDOFF_SOFT_PUPPY_MODELS.md](HANDOFF_SOFT_PUPPY_MODELS.md) first for the official CC BY download, editable Blender rig, reproduction commands, live attribution, verification and remaining limits. Preserve these integrated licensed assets when rebuilding the courtyard. The earlier CC0 and premium sourcing documents are historical.

Historical character refinement: [HANDOFF_BLENDER_REFERENCE_PASS.md](HANDOFF_BLENDER_REFERENCE_PASS.md) includes rebuilt humans, refined dogs, turnarounds and validation evidence. Preserve current rigs and contracts when evaluating any replacement.


Prepared 2026-10-09. Target agent/model name is the user's supplied label, **Fable 5.1**. Continue the existing implementation in `/Users/patabrava/Documents/AI/github/Camilo/Ines`.

Blender is now installed and its official MCP bridge has been verified on this Mac. Read [BLENDER_CONNECTION.md](BLENDER_CONNECTION.md) for the stdio configuration needed by a separate Fable/Claude client, scene-preservation rules and a reproducible connection check. Codex's global MCP registration does not automatically configure another client. Continue to retain editable Blender sources and validate exported GLBs against the project's asset contracts.

A separate Blender refinement pass is ready for review: [HANDOFF_BLENDER_ASSET_PASS.md](HANDOFF_BLENDER_ASSET_PASS.md). It includes five isolated character candidates, editable source, before/after renders and measured validation. Transfer accepted geometry onto your current rig; preserve your newer 32-bone dog and eye/lid work. That earlier Blender pass did not replace production; the current smooth textured puppy integration described above does.

## 0. Paste-ready starting prompt

> Continue developing Pfotenzeit in `/Users/patabrava/Documents/AI/github/Camilo/Ines`. Read `docs/HANDOFF_CREATIVE_FABLE_5_1.md`, then the current root `CLAUDE.md`, `PROGRESS.md`, `docs/DECISIONS.md`, and `docs/VERIFICATION_REPORT.md`. Read the design references listed in the handoff before changing art or interaction. You own the next creative milestone: improve Nala and the mobile L01 experience into a cohesive, modern, adult-oriented 3D slice, then refine the courtyard and supporting cast. Preserve the working gameplay, separate standard/challenge saves, German UI and all verification fixes. Start by inspecting the actual game and reference sheets, documenting a concrete creative plan and taking baseline screenshots. Implement the improvements, integrate assets, and run the relevant automated/browser/asset checks. Keep asset status, source files, measured budgets and remaining issues honest. Do not restart the project or expand the feature scope before this slice is strong. Do not claim book coverage, final art, phone results or test passes you have not established. Communicate with the user in English. All player-facing copy remains German.

## 1. Product and creative intent

Pfotenzeit is a casual educational dog-school game for **adults learning to train their first dog**. It is a mobile-first responsive web app with modern stylized 3D; desktop is also supported. A satisfying natural session should take **3–5 minutes**. That target still needs human playtesting.

The player bonds with one puppy, Nala, while learning through short dog-school visits. Visiting dogs provide context and variety. Caring, noticing body language, making a choice, watching the response and receiving a short explanation form the loop. Rewards build memories, learning points, school decoration and a first growth step. The tone is warm, calm and entertaining, without infantilizing the player.

The separately opened pixel profile is a Tamagotchi-style bonding feature. It shows **the same dog and save** as the 3D world. It is not a second simulation.

Standard mode is forgiving. The user approved a **separate, optional Tamagotchi challenge mode** where prolonged active neglect can end a run. Absence alone cannot kill the puppy. This distinction is settled; preserve it.

## 2. Read and inspect first

Read in this order:

1. Root `CLAUDE.md`, `PROGRESS.md`, `docs/DECISIONS.md` (through D-032).
2. `docs/VERIFICATION_REPORT.md`: actual results, fixes and remaining acceptance limits.
3. `docs/pfotenzeit/00_START_HERE_CLAUDE.md`, `01_SPIELVISION.md`, `02_SPIELSCHLEIFE.md`, `04_PFLEGE_CHALLENGE.md`, `05_MOBILE_UX.md`, `15_DATEN_REGELN.md`.
4. `docs/pfotenzeit/06_ART_DIRECTION.md`, `07_CHARAKTERE.md`, `08_3D_ASSET_HANDOFF.md`, `13_BILDPROMPTS.md`, `16_ASSET_PRODUCTION.md`.
5. `docs/ASSET_REPORT.md`: measured current assets, missing anatomy/rig detail and A01–A09 tickets.
6. `docs/pfotenzeit/10_MVP_ROADMAP.md`, `11_QA_ABNAHME.md`, `17_EXECUTION_CHECKLIST.md`, and `docs/HANDOFF_VERIFICATION.md`.

Inspect the actual reference images, not just their filenames:

- `docs/pfotenzeit/characters/01_nala.png`
- `docs/pfotenzeit/characters/02_gastwelpen.png`
- `docs/pfotenzeit/characters/03_menschen.png`

These are generated art references from the planning phase. They are not rigged models or validated turnaround geometry. The latest sourcing handoff supersedes sheet fidelity as the visual target; retain useful identity cues and the product/export requirements. Inspect `public/assets/manifest.json` and the actual GLBs before replacing anything.

Run the real app, inspect home, L01 observation/decision/feedback, care, profile, school and growth at **360×640 and 390×844**. Inspect both narrow portrait and **844×390 landscape**. The renderer-only dev scene cannot prove the integrated HUD leaves the dog visible.

## 3. Existing implementation: continue it

| Area | Current implementation |
|---|---|
| Stack | Plain Three.js 0.186.1, TypeScript, Vite; DOM UI; no React/R3F |
| Loop | L01 Hinschauen, L02 Orientierung, L03 Runterfahren; supported practice, optional inserted retry, reflection and reward |
| Progression | Learning points, memories, two upgrades, Nala arriving→growing |
| Care | Free meal, rest and context-appropriate play/calm; active-time accounting |
| Saves | IndexedDB, transactional commits, ledger/backups, validated JSON export/import, separate mode saves |
| Lifecycle | Pauses/return summary, Web Locks ownership, second-tab screen, production service worker |
| 3D | Nala puppy/growing, Bruno, Mira, Alex, courtyard, care props and upgrade props; GLB loading with procedural fallback |
| Pixel | 13 code-authored states; Pflege/Erinnerungen/Gelernt profile |
| Audio | Optional synthesized WebAudio, default off; reduced motion supported |

Current architecture:

- `src/simulation/**`: deterministic rules, state machine, selectors and progression.
- `src/content/**`: German lesson, character, upgrade and memory data.
- `src/state/store.ts`: sole state mutation boundary.
- `src/storage/**`, `src/app/**`: persistence, boot, lifecycle, routing and service-worker registration.
- `src/render/**`: Three.js actors, scene, camera, loaders and effects.
- `src/ui/**`, `src/input/**`, `src/audio/**`: DOM experience, presenter, controls and sound.
- `scripts/build-models.mjs`, `scripts/lib/**`: current code-authored asset generation.
- `scripts/validate-assets.mjs`: current validation contract.

There is **no server backend** to rebuild or add. No multiplayer, analytics, physics engine or account system is in scope. Assets and visual effects must not introduce a second progression system.

## 4. Next creative milestone and work order

The recommendation is a **complete Nala/L01 slice first**, followed by the supporting world. Document it in `docs/CREATIVE_PLAN.md`; proceed with routine creative choices within this brief.

### A. Establish the visual baseline

Capture integrated mobile screenshots and list concrete visual problems. Record the intended silhouette, materials, lighting and pose changes. Use the current palette and reference identities. Avoid rebuilding the UI as a generic dashboard.

### B. Improve Nala and her readable behavior

Prioritize continuous body surfaces, convincing limb attachment, eyes/lids/gaze, muzzle, ears, tail and fitted harness. Current models are assembled from primitives, have rigid deformation and lack expressive eyelid/gaze controls. Fix those limitations rather than adding high-cost fur.

Check the existing pose/clip set in the actual lesson camera. A player must be able to observe the dog's body, ears, gaze and tail, not merely a cute face. Relaxed observation, orientation, sniffing, turning away, tension, tiredness and rest need distinct, context-appropriate silhouettes. Avoid a universal wagging tail as an emotion shortcut.

Use L01 to validate anatomy, deformation, paws on the ground, harness fit and mobile readability. Keep motions short and calm. Reduced-motion mode must retain equivalent readable poses and German descriptions.

### C. Polish the courtyard and feedback

Refine the compact school: light wood shelter, credible ground/grass edges, quiet plants, visible water and a clear training space. Improve contact grounding and lighting within the mobile budget. Keep rest accessible before an upgrade; upgrades add decoration and scenario variety.

Make anticipation, reaction, reflection and reward feel satisfying without longer mandatory waits. Camera motion is 250–400ms between decisions, instant when reduced motion is on. Do not add reaction timers or rapid tapping tests.

### D. Bring the remaining MVP cast into the same style

After Nala/L01 is strong: Bruno, Mira/Alex, growing Nala, care props and upgrades. Keep growth a proportion change, not simple uniform scaling. Then synchronize the pixel identity and growth state with the revised 3D art.

### E. Stabilize the slice

Recheck L02/L03, care, profile, growth, challenge bands and recovery after visual changes. Complete desktop verification and prepare physical-device acceptance. New lessons and extra characters are later milestones.

## 5. Art identity and direction

Modern stylized 3D for adults: clear anatomy, soft silhouettes, matte materials, restrained facial exaggeration. No photorealistic hair particles, constantly grinning dogs or toy-like anatomy. Do not replace the quiet school with a neon/glass dashboard aesthetic.

| Element | Identity to preserve |
|---|---|
| Nala | Honey coat, cream chest/paws, small cream forehead stripe, floppy ears, dark brown eyes, sage harness; renameable |
| Nala growth | Shoulder 0.28m arriving, 0.36m growing; longer legs, relatively smaller head, same markings |
| Bruno | Chestnut coat, white muzzle/chest/forehead stripe and tail tip, softly folded ears, apricot harness; shoulder 0.31m |
| Mira | Fictional trainer, dark curly hair in a short bun, medium brown skin, forest green/cream clothing, reward pouch; about 1.70m |
| Alex | Bruno's person, short dark hair, light olive skin, terracotta top/dark trousers; about 1.76m |

Palette: chalk `#F4F0E8`, ink `#243631`, sage `#AFC6AE`, forest `#326B58`, apricot `#E4A67B`; restrained gold `#D1AE62` for progress. Warning meaning always includes text/symbols.

The fictional trainer is not Martin Rütter. Do not copy his face, voice or branding. Keks/Lotti/Sam/Jo are specified in the character bible but belong to expansion 1, not this slice. Adult Nala is also roadmap work.

## 6. 3D production and integration contract

Deliver actual GLBs plus editable source files and provenance. A generated reference image is not a finished 3D asset. If using an external generation tool, inspect its available capability first; do not claim rigging, retopology or animation has happened merely because a tool generated a mesh. Do not purchase services or publish the game as part of this handoff.

Preserve stable manifest keys and paths:

| Manifest key | GLB |
|---|---|
| `dog.nala.puppy` | `public/assets/models/dog_nala_puppy.glb` |
| `dog.nala.growing` | `public/assets/models/dog_nala_growing.glb` |
| `dog.bruno.puppy` | `public/assets/models/dog_bruno_puppy.glb` |
| `human.mira` / `human.alex` | `public/assets/models/human_mira.glb`, `human_alex.glb` |
| `environment.school` | `public/assets/models/school_courtyard.glb` |
| `props.care` / `props.upgrades` | `public/assets/models/care_props.glb`, `school_upgrades.glb` |

Units: metres, +Y up, local forward +Z, origin at ground between feet/paws, root scale 1, no negative scales. Preserve current joint/clip names and required prop nodes unless adapting the entire loader/validator contract explicitly. Maximum four skin influences per vertex. Walk clips animate in place; runtime handles movement. An animation callback never commits game progress.

Dog clips: `idle_relaxed`, `look_at_handler`, `sniff`, `walk`, `sit`, `lie_down`, `rest_loop`, `eat`, `play_bow`, `turn_away`, `tense_idle`, `tired_idle`, `recover`. Human clips: `idle`, `greet`, `gesture_explain`, `offer_reward`, `kneel`. There is no death animation.

Current manifest measures **8 GLBs, 2,279,588 bytes total**, all **code-authored**, with zero validator errors/warnings/info. This is a working prototype baseline, not final art. The integrated runtime has observed all five character variants, including growing Nala.

Budget targets: dog ≤18k triangles and ≤3MB, human ≤2MB, initial 3D ≤8MB, max two dogs/two humans visible; lesson draw calls ≤100. Current measured lesson is 10 calls/42,272 triangles at DPR2; extended cast is 15 calls/74,368 triangles at DPR1. Phone performance is unmeasured. Low tier caps DPR at 1–1.5 and disables dynamic shadows; high caps at 2.

**Validator caveat:** the current code-authored pipeline validates vertex colors/no textures, one material, exact skeleton/clip conventions and a courtyard ≤20k triangles. The broader design allows future atlas-based art, but does not mean the current loader and validator already support it. For textured/sculpted assets, adapt the loader and validator together, add texture/material/budget checks, record the change in `docs/DECISIONS.md`, and retain existing integrity checks. Do not weaken validation simply to make a new asset pass. Do not introduce Meshopt/KTX2 assets without the required decoder and tested fallback.

Keep `source`, license, bytes, triangles, bounds, clip metadata, texture sizes and version accurate in `public/assets/manifest.json`. Update `docs/ASSET_REPORT.md` and A01–A09. Mark `final` only after the intended art, deformation, expression and device review, not merely successful export. Keep reference PNGs outside the shipped app.

## 7. Preserve the verified behavior and fixes

Do not undo D-032 while polishing:

- `.scene` has explicit dimensions; home fills its scene layer.
- `src/ui/AppShell.ts` measures the gap between lesson header and dialog so the dog remains visible. It follows resize/text changes. Do not restore a full-screen lesson camera hidden beneath cards.
- Noninteractive banner text does not intercept taps; banner buttons still work. Context loss must leave profile/care usable.
- First service-worker claim preserves the current page. Updates retain their later controller-change reload.
- Public same-origin precached files handle `Vary: Origin`; all four fonts are cached. First-install offline support is tested without requiring an online reload first.
- Debug metrics await the renderer handle. Dev harnesses have valid favicons.
- UI action guards prevent click-through for 300ms after sheets close. Tests wait for committed state, not transient toast text.

Core rules also stay intact:

- German UI, adult tone, no blame or “falsch” feedback.
- Free feeding/rest/pause/leaving; no health/paywall economy.
- Standard offline needs unchanged; challenge offline credits at most 8h, loses at most 16 satiety/8 comfort, does not push values below 25 or change vitality.
- Challenge loss only from active neglect; neutral memorial, new run, untouched standard save.
- Pixel and 3D reflect one save; rewards and effects commit once, before presentation.
- Simulation/content remain free of DOM, Three.js, timers and `Date.now`; injected providers own time/IDs.
- D-005 inserted retries occur only while the learning point remains unlearned. They are not unconditional after every wrong choice.

The book is **Welpentraining mit Martin Rütter**, but full source material was never available for a complete review. Current lesson text is provisional. Preserve source-status metadata. Do not invent quotations, chapter/page citations, “all learnings covered” claims or new professional recommendations. New educational content needs source and training review; art improvements can proceed independently.

## 8. Working tree and coordination

Git now exists. Baseline commit **`bd09218`** was created before verification fixes. Verification fixes, scripts, reports and docs are currently uncommitted. Inspect `git status`/diff first; preserve that work. Do not reset/clean or regenerate all GLBs blindly.

The `ines-*` names in older work-package documents describe the original parallel implementation sessions. They are historical ownership context, not proof those agents are still active. The root instructions have been updated accordingly. This handoff does not request spawning agents or sending messages to those sessions.

As the continuing agent, you own creative integration. Make small coherent changes, record genuine design/contract deviations, and keep documentation synchronized. New dependencies or a broader gameplay/balance change should be proposed concretely rather than slipped into an art pass. Routine visual choices inside this brief do not require repeated user confirmation.

## 9. Verification after changes

Start with the existing tests, not a fresh scaffold. Node 26/npm11 were used; Node ≥22.12 is required. Installed Chrome is used by browser scripts. Observe results before reporting them.

```sh
npm run typecheck
npm test
npm run build
npm run assets:check
npm run test:e2e
npx vitest run --config src/render/dev/vitest.config.ts
node src/render/dev/verify-browser.mjs --out ./verification/renderer
```

Current observed baseline: **17 files/201 unit+integration tests**, **12 production smoke runs** (four scenarios × three projects), **14 renderer unit checks**, **13 UI harness checks**. Test counts may legitimately grow; failures or exclusions must be disclosed.

For extended acceptance, use a dev server on port 5231 and a production preview on port 4173 in separate terminals:

```sh
npx vite --host 127.0.0.1 --port 5231 --strictPort
npm run preview -- --port 4173 --strictPort
```

Then:

```sh
PZ_BASE=http://127.0.0.1:5231 node src/ui/dev/smoke.mjs
node scripts/verify-acceptance.mjs
node scripts/verify-offline.mjs
node scripts/verify-interruption.mjs
```

Inspect occupied ports first and reuse appropriate servers; do not kill unrelated processes. The interruption script waits 120s and uses synthetic visibility events when headless Chrome keeps tabs visible. Do not edit app modules during it: Vite reloads invalidate that scenario. It is not a real phone background test.

The extended script checks all lessons, retries, +30 rest, upgrades/growth, care/feedback/purchase/reflection reloads, export/invalid import, challenge bands/loss/new run/mode isolation, offline caps, context recovery, growing GLB and missing-model fallback. Keep model loading tests and screenshot inspection when changing visuals.

Physical acceptance remains open: real iPhone/Safari and Android/Chrome; full session, profile during lesson, screen lock/return, rotation, actual touch scrolling and OS text scaling, and 60s FPS/DPR/draw-call measurement. LAN HTTP does not establish PWA offline/install support; use HTTPS for that test. SwiftShader FPS is not phone FPS.

## 10. Required milestone deliverables

Save everything in this existing Ines project:

1. `docs/CREATIVE_PLAN.md`: prioritized visual findings, selected direction and bounded milestone.
2. Updated GLBs/manifest plus editable sources in a documented asset-source location; provenance/license notes.
3. Integrated Nala/L01 mobile screenshots before/after, plus affected school/profile/growth views. Inspect poses and readability in the real HUD.
4. Updated `docs/ASSET_REPORT.md`, `PROGRESS.md`, and `docs/DECISIONS.md` where decisions changed.
5. `docs/CREATIVE_REVIEW.md`: changes, observed tests, budgets, visual limitations, device results actually obtained, next priorities.

A milestone is complete when the selected visual changes work in the existing loop, anatomy/pose readability is improved, assets validate and load as GLBs, free care and persistence still work, the dog is visible in mobile portrait/landscape, text/actions remain reachable at 200%, keyboard/reduced-motion/fallback remain usable, relevant tests pass, and remaining phone/content/art gaps are stated honestly.

Do not call the whole product release-ready based on desktop automation. Keep expansion characters, new lessons, adult growth, voiceover, backend/sync and native-store packaging on the roadmap until the current slice is cohesive and accepted.
