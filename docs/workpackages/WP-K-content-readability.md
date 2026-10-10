# WP-K — Pose descriptions, string consolidation, pixel sync (session: ines-96)

Read first: `docs/CREATIVE_PLAN.md` (F10; direction §2 "Posture tells the story"), `docs/HANDOFF_CREATIVE_FABLE_5_1.md` §4B (reduced motion keeps readable poses and German descriptions), §4D (pixel sync), §7, `docs/pfotenzeit/03_LERNPLAN_QUELLEN.md` (D1 body language principle: several signs together, never a diagnosis), `06_ART_DIRECTION.md` (Pixelprofil). View `docs/pfotenzeit/characters/01_nala.png`.

## Mission
1. German pose descriptions for every `PoseId` and `GestureId`, used by the UI under reduced motion, in the WebGL fallback and as `aria` text for the scene.
2. Absorb the UI-only strings that WP-E kept in `src/ui/strings.ts` into `src/content/de.ts` (same keys, so the UI switch is mechanical).
3. Sync the pixel Nala to the v2 3D proportions once WP-G's contact sheets exist (ines-bc will message you the sheet paths): slightly smaller head, longer floppy ears, softer body, harness plate; keep the 13 states, both growth stages, hard pixels, ≤ 16 colours.

## You own
`src/content/**` (except `types.ts`), `src/ui/pixel/**`, `tests/content/**`, `public/assets/pixel/**` via `node scripts/export-pixel.mjs`. If you need a new field on `ContentCatalog` (e.g. `poses`), message ines-c3 with the exact type addition; until then export `de.poses` and `de.gestures` from `de.ts` and keep the catalog unchanged.

## Pose descriptions (`de.poses`, `de.gestures`)
One or two calm sentences per pose, present tense, naming several body signals together and the context, never a verdict about feelings ("Der Körper ist locker, die Rute hängt entspannt, der Blick wandert über den Boden." not "Nala ist glücklich."). Cover: idle_relaxed, look_at_handler, sniff, walk, sit, lie_down, rest_loop, eat, play_bow, turn_away, tense_idle, tired_idle, recover; gestures idle, greet, gesture_explain, offer_reward, kneel (Mira/Alex: short, e.g. "Mira geht in die Hocke und hält die Hand tief."). Add a `de.scene.poseLine(name, poseId)` helper if names are needed. Tests: every id covered, no "falsch"/"Fehler", ≤ 180 characters.

## String consolidation
Move every literal in `src/ui/strings.ts` that is not already derived from `de` into `de.ts` under sensible groups (home, lesson, reflection, settings, data, recovery). Do not change wording that WP-E already shipped unless it violates the tone rules. After moving, message ines-24 the list of new `de` keys so they can switch `t` to them (they own `strings.ts`).

## Pixel sync (after WP-G)
Adjust `src/ui/pixel/sprites.ts` so pixel Nala matches v2: head ~30 % of body length, ears reaching below the jaw, cream chest plate and forehead stripe, sage harness plate on the chest, dark-brown eyes with a one-pixel highlight, tail with a slight downward curve at rest, tense/tired states with ears back/low lids. Re-export PNGs, keep tests green, view two exported sprites with Read.

## Deliverable and report
`npm run typecheck`, `npm test` (content tests), `node scripts/export-pixel.mjs` green with real output. Message ines-c3: keys added, descriptions count, sprite changes, and the key list you sent to ines-24.
