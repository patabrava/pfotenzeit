# WP-B — German content data and pixel profile sprites (session: ines-96)

Read first: `/CLAUDE.md`, `docs/DECISIONS.md`, `docs/pfotenzeit/03_LERNPLAN_QUELLEN.md` (all three lesson scripts + Effekte), `02_SPIELSCHLEIFE.md`, `05_MOBILE_UX.md` (Beispieltexte), `06_ART_DIRECTION.md` (Pixelprofil), `07_CHARAKTERE.md`, `16_ASSET_PRODUCTION.md` (Pixelassets), and look at `docs/pfotenzeit/characters/01_nala.png` (bottom right: pixel idea).

## Mission

1. Replace the temporary `src/content/index.ts` with the real typed German content: three lessons as data, characters, upgrades, memory texts, learning points, and all UI strings.
2. Author the pixel profile: Nala in two growth stages × six states as palette-indexed data, drawn on a canvas with integer scaling and hard edges, plus a neutral memorial frame.

## You own (write only here)

- `src/content/lessons.ts`, `characters.ts`, `upgrades.ts`, `memories.ts`, `learningPoints.ts`, `de.ts`, `index.ts` (delete the stub content from index.ts, keep `export const content: ContentCatalog`)
- `src/ui/pixel/sprites.ts` (data), `src/ui/pixel/palette.ts`, `src/ui/pixel/PixelDog.ts` (canvas drawer), `src/ui/pixel/index.ts`
- `scripts/export-pixel.mjs` (writes PNGs to `public/assets/pixel/` using the same data; Node only, zlib PNG encoder, no dependencies)
- `tests/content/**/*.test.ts`

Read-only: `src/content/types.ts`, `src/simulation/types.ts` (PoseId, PropId, EnvironmentId, PixelState, GrowthStage). Need a new prop/environment/pose id? Message ines-c3 with the proposal.

## Content rules

- Shapes: `ContentCatalog` in `src/content/types.ts`. All text German, "du", calm adult register. Mira: short, concrete, warm, never blaming. No "Falsch". Feedback names the behaviour and the connection (02: "Feedback nennt Verhalten und Zusammenhang").
- Lesson scripts from 03 are the source. Use the quoted texts verbatim where given ("Du gibst Nala Zeit, die Situation selbst zu erkunden." etc.) and write the rest in the same voice. Each round: `observationText` (what you see), `observationDescription` (body-language description for "Beobachtung beschreiben": posture, ears, tail, gaze, environment, context — several signs together, never a diagnosis), `supportHint` (shown in the supported replay: a concrete hint why the helpful option fits, still a choice), 2–3 options.
- Option semantics (see D-004, D-005, D-006):
  - L01 (criterion_context): A "Ruhig beobachten" helpful (counts: false — observing is helpful but the criterion is distance + pause) vs "Sofort näher herangehen" (supportedRetry). B Bruno: "Mehr Abstand" helpful counts:true vs "Zum Kontakt locken" (supportedRetry). C Nala: "Pause anbieten" helpful counts:true `next:'careClosure'` vs "Noch eine Runde" (supportedRetry, feedback explains tiredness, offers pause again).
  - L02 (criterion_orientation): A "Warten und beobachten" (helpful, counts:true, poseAfter look_at_handler) vs "Mehrmals rufen" (supportedRetry, sniff continues). B "Diesen Blick belohnen" (helpful counts:true, humanGesture offer_reward, poseAfter look_at_handler) vs "Weiter warten" (not helpful, feedback "Du kannst den kurzen Blick bereits belohnen.", `next:'supportedRetry'`). C toy, arousal 75 in contextBefore: "Abstand zum Spielzeug vergrößern" (helpful counts:true, contextAfter {arousal:35, difficulty:'easy'}) vs "Signal wiederholen" (supportedRetry, same simplification as follow-up explanation).
  - L03 (criterion_support): A contextBefore `{energyShown: 34}`: "Ruheplatz anbieten" (helpful counts:true, `careEffect:'rest'`, poseAfter rest_loop) vs "Neue Aufgabe beginnen" (supportedRetry; no training load, short observation + rest offered again). B Bruno stress 65: "Reiz entfernen und Abstand geben" (helpful counts:true, contextAfter {stress:30}, poseAfter recover) vs "Zum Reiz locken" (supportedRetry; "Heute ist der Schritt zu groß. Mehr Abstand hilft."). C Nala lying calm: "Heute abschließen" (helpful counts:true, `next:'careClosure'`) vs "Für noch eine Übung aufwecken" (not helpful, supportedRetry; discussed, not animated as forced).
  - Every option needs `poseAfter` from `PoseId` and a `feedback`. Add `everyday` to at least one option per lesson.
- `scenarioId` distinct per round within a lesson (e.g. `L01_calm_explore`, `L01_bruno_loud`, `L01_nala_tired`).
- `environment`/`props`: L01 B and L03 B are `courtyard_loud` with `toy_rolling`/`leaf`; L02 C uses `ball`; L03 A uses `rest_place` + `blanket`; L03 C `rest_place`.
- `variants`: give at least rounds L01 A, L02 A and L03 C two seeded cosmetic variants (e.g. Nala finds a leaf vs a new sniffing spot). Same meaning, different flavour.
- `sourceIds` and `sourceStatus:'provisional'` per 03. Lesson `intro`, `transferText` (verbatim from 03), `everydayText`, `practiceText` (shown when the point is not yet learned: encouraging, points to repeating the visit).
- `memories`: per lesson a `completed` and a `careClosure` memory (title + one-sentence text in the past tense, e.g. "Ihr habt heute gut aufeinander geachtet.").
- `learningPoints`: label, summary (one sentence a player could repeat in their own words), everyday.
- `de.ts`: `export const de = {...} as const` with every UI string: app shell, home (visit hint, "Zur Übung", "Profil"), profile tabs ("Pflege", "Erinnerungen", "Gelernt"), care actions ("Futter geben", "Ruhe anbieten", "Ruhiges Spiel", "Abstand geben"), need labels in plain words (three care displays: "Hunger", "Energie", "Wohlgefühl"), readiness lines ("Nala braucht gerade Ruhe."), lesson UI ("Genauer ansehen", "Beobachtung beschreiben", "Weiter", "Pause anbieten", "Heute beenden"), reflection ("Fertig für heute", "Zur Schule", "Im Alltag"), school ("Schulmarken", costs, "Ausbauen"), settings (audio, Bewegung reduzieren, Beobachtungstext, Qualität, Spielmodus, Export/Import, Hund umbenennen), challenge onboarding text verbatim from 05 plus the game-rule disclaimer from 03 ("Diese Pflegewerte sind Spielregeln. Sie bilden keine reale Hundegesundheit ab."), vitality band messages (stable/angeschlagen/kritisch), memorial text verbatim from 04, interruption summary, other-tab message, storage error, WebGL fallback, offline hint, growth prompt and scene text. Use functions for strings with names: `greeting: (name: string) => \`${name} begrüßt dich.\``.
- Characters: `DogCharacter` and `HumanCharacter` records with hex colours taken from the reference sheets (Nala honey body ~#C9955A, cream chest, sage harness #8FA98A-ish; Bruno chestnut with white muzzle/chest, apricot harness; Mira forest green over cream; Alex terracotta over charcoal). Shoulder heights per 07.

## Pixel sprites

- Internal canvas 128 × 128, dog within 64 × 64, 12–16 colours, no anti-aliasing. Data format: `string[]` rows of palette characters per sprite (`.` = transparent). Palette in `palette.ts` with named entries (honey, honeyShade, cream, sage, sageShade, nose, eye, blush, ...).
- Sprites: `nala_arriving_{awake,hungry,tired,playful,resting,exhausted}` and `nala_growing_{...}` (growing: longer legs, relatively smaller head, same markings incl. the cream forehead stripe), each at least one frame; optional 2-frame idle for awake/playful (ear or tail). `memorial` is a neutral frame (a sage frame with a paw print and a blanket, no dog body, no injury).
- `PixelDog.ts`: `createPixelDog(canvas: HTMLCanvasElement)` returning `{ render(state: PixelState, growth: GrowthStage, frame?: number): void; dispose(): void }`. Integer scaling to fit the canvas CSS size, `image-rendering: pixelated` set by the UI, transparent background.
- `scripts/export-pixel.mjs`: `node scripts/export-pixel.mjs` writes `public/assets/pixel/<name>.png` (128×128, alpha) and `public/assets/pixel/index.json` listing names, sizes and `source: "authored in src/ui/pixel/sprites.ts"`. Keep PNG encoding dependency-free.

## Tests (tests/content/)
- Every lesson has 3 rounds, distinct scenarioIds, each round 2–3 options, exactly one or more `helpful` option, at least one `countsForLearning` per lesson in ≥ 2 distinct scenarios, all `poseAfter` ∈ POSE_IDS, all props/environments valid, every option has non-empty feedback, L01 C and L03 C have a `careClosure` option, L03 A has `careEffect:'rest'`, no option label longer than 32 characters, no text contains "falsch" or "Fehler".
- Pixel data: every sprite is 64×64 or smaller within 128×128, uses only palette chars, both growth stages exist for all six states, memorial exists.

## Done means
`npm run typecheck`, `npm test`, `node scripts/export-pixel.mjs` all run clean. Message ines-c3 with: what exists, text decisions you made beyond 03, exported sprite list, commands run with results.
