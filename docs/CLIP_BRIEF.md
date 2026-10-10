# Clip brief — vendor evaluation and Blender clip authoring (WP-O)

Status: documentation, 2026-10-10 (ines-24, reassigned from ines-96). No code or content was changed for this brief.

Purpose: one page per semantic clip so that (a) a reviewer can judge whether a vendor clip may be mapped to a Pfotenzeit semantic in `clipmap.json`, and (b) an animator can author a missing clip in Blender. The German lines are the texts the game shows under the scene strip when the picture alone cannot carry the body language (reduced motion, WebGL fallback). They are quoted verbatim from `src/content/de.ts` (`POSE_DESCRIPTION`, lines 36–64; `GESTURE_DESCRIPTION`, lines 66–72) and are therefore the binding meaning of each clip: **a clip that does not show what the sentence says is wrong, even if it looks good.**

Sources: `docs/pfotenzeit/03_LERNPLAN_QUELLEN.md` (D1 principle, lesson scripts L01–L03), `07_CHARAKTERE.md` (identity, "Verhalten und Animation"), `08_3D_ASSET_HANDOFF.md` ("Clipvertrag", human clips), `public/assets/manifest.json` (`clipMeta`, live baseline), `src/render/anim/dogPoses.ts` (`DOG_CLIP_EVENTS`), `docs/HANDOFF_PREMIUM_ASSET_SOURCING.md` (execution step 6), `docs/VENDOR_INGEST.md` (`--clipmap`, validation rules).

## 0. Baseline and conventions

**Live `clipMeta` baseline.** The durations and loop flags below are taken from the live manifest for `dog.nala.puppy`, `dog.nala.growing`, `dog.bruno.puppy`, `human.mira`, `human.alex` (all five entries carry identical `clipMeta`; all are `code-authored`, version 1). The "range" column is the authoring tolerance from `08_3D_ASSET_HANDOFF.md`; the "live" value is what ships today and what `validate-assets.mjs` compares against (`durations equal clipMeta`). If a vendor clip is longer or shorter than the live value, either retime it in Blender or change `clipMeta` deliberately in the manifest entry of that asset — never silently.

| Convention | Rule |
|---|---|
| Units / axes | metres, +Y up, +Z local forward, floor pivot, normalized root (08, HANDOFF_PREMIUM step "Shipping") |
| `walk` | legs cycle in place; no translation on skeleton root or scene roots (> 1 mm range fails validation). The runtime moves the dog (`walkCycleLength`, `walkSpeed` in `dogPoses.ts`). |
| Loop clips | first ≈ last keyframe so the loop closes; otherwise mark `loop: false` on purpose |
| Events | external clip metadata, not animation callbacks (08). Today only `eat.treat_received = 2.0 s` (`DOG_CLIP_EVENTS`). |
| Forbidden anywhere | growl, bared teeth, snapping, bite, attack, hurt/hit reactions, death/collapse, fear-freeze played as comedy, "constant grin" muzzle (07: "Keine ständig grinsende Schnauze"). Validation already rejects clip names like attack/death/bite/hurt for `tense_idle`, `tired_idle`, `recover`, `turn_away` (VENDOR_INGEST), but the name check is only a first filter — watch the motion. |
| Phone size | every clip is judged at 360×640 and 390×844 with the real HUD, where the dog is roughly 120–220 px tall. Signals that only read in a close-up (whisker twitch, nostril flare, eye dart) do not count. What counts: **ears, gaze/head direction, tail height and speed, weight distribution, back line, mouth open/closed**. |
| Phase | the scene strip is ≥ 50 % of the viewport in observe/decide, so clips are seen for 3–10 s. Loops must survive being watched for that long without a visible seam or a "tic". |

**How to read the tables.** "Must read" = signals that have to be unmistakable at phone size. "Disqualifies" = if the vendor clip shows any of these, do not map it, even partially. "Vendor names" = typical labels in dog/humanoid packs that *may* contain the right motion; they are hints for `clipmap.json`, not permissions.

## 1. Dog clips (13)

The same 13 semantics are required for Nala (puppy and growing variant) and Bruno. Bruno is broader, has a slightly shorter muzzle and reacts faster to movement (07); his clips may be a little quicker in `look_at_handler`/`sniff` but must stay within the same meaning.

### 1.1 `idle_relaxed`

> „Der Körper ist locker, das Gewicht liegt gleichmäßig auf allen vier Pfoten. Die Ohren hängen weich, die Rute pendelt auf mittlerer Höhe, der Blick wandert ruhig umher.“

| | |
|---|---|
| Used for | observe rounds, home scene (L01 round A: "lockerer Körper, weicher Blick, erkundet") |
| Must read | weight even on all four paws (no lean), soft back line, ears hanging, **tail at mid height moving slowly and with small amplitude**, head turning slowly to look around, mouth may be slightly open and relaxed |
| Live / range | 4.0 s, loop · range 3–5 s loop |
| Events | none |
| Disqualifies | constant or fast tail wag ("happy" loop — 07: "Happy ist keine pauschale Schwanzschleife"), fixed stare at the camera, panting with wide grin, head fixed for the whole loop, weight shifted back, tail tucked or held high and stiff |
| Vendor names | `Idle`, `Idle_A/B`, `Breathing`, `IdleLookAround`, `Stand`, `Relaxed` |
| Meaning check | the viewer should be able to name three calm signs together (even weight, soft ears, slow mid tail). If the clip's only "relaxed" message is the tail, reject. |

### 1.2 `look_at_handler`

> „Der Kopf dreht sich zum Menschen, die Ohren heben sich leicht. Der Körper bleibt locker, die Rute auf mittlerer Höhe. Der Blick ruht kurz auf dem Gesicht.“

| | |
|---|---|
| Used for | L02 (voluntary orientation that the player can reward) |
| Must read | head turn towards the human position (left of the dog in the lesson directive), ears lifting a little, body stays as in `idle_relaxed`, tail mid, a short hold on the face at the end |
| Live / range | 1.5 s, no loop · range 1–2 s |
| Events | none |
| Disqualifies | whole-body jump or spin, barking, sitting down as part of the turn, ears pinned back, tail high and stiff, tail tucked |
| Vendor names | `LookAt`, `Look_Left/Right`, `HeadTurn`, `Attention`, `Alert` (only if calm — see tense_idle) |
| Meaning check | L02 teaches "reward the voluntary glance". The clip must look voluntary: soft body, no startle. If it looks like an alert to a threat, it is a `tense_idle` candidate, not this. |

### 1.3 `sniff`

> „Die Nase ist tief am Boden, der Rücken bleibt weich. Die Rute hängt auf mittlerer Höhe und schwingt langsam. Die Ohren fallen nach vorn, der Blick folgt der Spur.“

| | |
|---|---|
| Used for | L02 round A (busy with the ground), home exploration |
| Must read | nose at floor level, back soft (no hunch), ears falling forward, tail mid and slow, small side-to-side head path as if following a track |
| Live / range | 2.5 s, loop · range 2–3 s loop |
| Events | none |
| Disqualifies | digging, eating from the floor, tail tucked, stiff legs, pawing, head jerks |
| Vendor names | `Sniff`, `Sniffing`, `Smell`, `Search`, `Track` |
| Meaning check | "busy, not worried". Together: low nose + soft back + mid tail. A low nose with a tucked tail is a different message. |

### 1.4 `walk`

> „Ein ruhiger Schritt, der Kopf etwa auf Rückenhöhe. Die Ohren hängen locker, die Rute schwingt leicht mit. Die Pfoten setzen gleichmäßig auf.“

| | |
|---|---|
| Used for | short scripted moves between positions |
| Must read | four-beat walk (not trot/run), head at back height, loose ears, tail swinging with the gait, even paw placement, in place |
| Live / range | 1.0 s, loop · range 1 s loop |
| Events | none |
| Disqualifies | any root translation, trot or gallop, head held high and stiff, limping, paws sliding (cycle length must match `walkCycleLength`) |
| Vendor names | `Walk`, `Walk_InPlace`, `WalkForward` (check root motion!), `Trot` (reject) |
| Meaning check | neutral transport. It must not add a mood. |

### 1.5 `sit`

> „Das Hinterteil berührt den Boden, die Vorderbeine stehen gerade. Der Kopf ist gehoben, die Ohren hängen weich, die Rute liegt still auf dem Boden.“

| | |
|---|---|
| Used for | transitions, calm attention |
| Must read | the transition from standing into sit (08: "Übergänge, kein Sprung in Pose"), front legs straight at the end, head up, soft ears, tail resting on the floor |
| Live / range | 1.5 s, no loop · range 1–2 s |
| Events | none |
| Disqualifies | pose pop (no transition), begging/front paws up, tail wagging on the floor as a "happy" tell, head lowered, harness intersecting the thighs |
| Vendor names | `Sit`, `StandToSit`, `Sit_Down`, `SitIdle` (end pose only — needs the transition) |
| Meaning check | a sit is not obedience theatre here; it must look settled, not snapped to. |

### 1.6 `lie_down`

> „Der Bauch liegt auf dem Boden, die Vorderbeine sind nach vorn gestreckt. Der Kopf ist noch gehoben, die Ohren hängen locker, die Rute liegt ruhig.“

| | |
|---|---|
| Used for | L01 round C (Nala stays back and lies down), transition into rest |
| Must read | transition into a sphinx lie, front legs stretched forward, head still up, loose ears, tail quiet |
| Live / range | 1.5 s, no loop · range 1–2 s |
| Events | none |
| Disqualifies | rolling on the side/back (belly-up), collapsing, "play dead", head down at the end (that is `rest_loop`), pose pop |
| Vendor names | `LieDown`, `Lay`, `SitToLie`, `Down`, `Lay_Down` |
| Meaning check | L01 C reads "has done several exercises, lies down" → a quiet choice to stop, not exhaustion. Keep the head up and the eyes open. |

### 1.7 `rest_loop`

> „Der Körper liegt eingerollt, der Kopf ruht auf den Pfoten. Die Augen sind geschlossen oder fast geschlossen, die Atmung ist langsam und gleichmäßig.“

| | |
|---|---|
| Used for | care "Ruhe", L03 round C ("Nala liegt ruhig") |
| Must read | curled body, head on the paws, lids closed or nearly closed, **slow visible breathing** (ribcage/belly), nothing else moving |
| Live / range | 5.0 s, loop · range 4–6 s |
| Events | none |
| Disqualifies | twitching "dream" legs played for laughs, belly-up, head lifting during the loop, tail movement, breathing faster than ~20 breaths/min, anything that reads as sick or dead (flat on the side with open mouth) |
| Vendor names | `Sleep`, `Sleeping`, `Rest`, `Lay_Sleep`, `Curl` |
| Meaning check | rest is a *good* outcome in L03 ("Ende mit Pause zählt als regulärer Besuch"). The loop must look safe and comfortable; no viewer should wonder whether the dog is ill. |

### 1.8 `eat`

> „Der Kopf ist tief über dem Napf, der Rücken bleibt weich. Die Ohren fallen nach vorn, die Rute hängt entspannt. Die Pfoten stehen ruhig.“

| | |
|---|---|
| Used for | care "Futter", L02 reward moment ("kleine Futtergabe") |
| Must read | head down into the bowl position, chewing/lapping motion visible at phone size (jaw or head bob), ears forward, relaxed tail, still paws |
| Live / range | 4.0 s, no loop · range 3–5 s |
| Events | **`treat_received` at 2.0 s** (`DOG_CLIP_EVENTS`): the moment the mouth first closes on the food. Author the clip so that the first clear "take" happens at 2.0 s; the UI/renderer use the event to acknowledge the committed care effect. |
| Disqualifies | gulping/snapping at a hand, guarding posture (stiff, tail low, eyes to the side), begging, eating from the player's camera direction, bowl clipping through the muzzle |
| Vendor names | `Eat`, `Eating`, `Drink` (lapping — acceptable for water if a separate clip is ever added), `Feed` |
| Meaning check | plain care, no excitement spike. If the clip adds a frantic tail wag, slow it or reject. |

### 1.9 `play_bow`

> „Die Vorderbeine liegen flach, das Hinterteil bleibt oben. Die Rute ist hoch und bewegt sich, der Mund ist leicht geöffnet, der Blick geht zum Gegenüber.“

| | |
|---|---|
| Used for | play offer (readiness "spielbereit"), friendly contact scenes |
| Must read | front elbows down, rear up, tail high and moving (this is the one clip where a lively tail is right), mouth slightly open, gaze to the partner |
| Live / range | 1.5 s, no loop · range 1–2 s |
| Events | none |
| Disqualifies | bark, lunge, pounce forward (root translation), teeth, stiff raised hackles, bow held with a fixed stare (that reads as a stalk) |
| Vendor names | `PlayBow`, `Bow`, `Play`, `Stretch` (a stretch is NOT a bow: rear stays level, gaze is away — reject for this semantic) |
| Meaning check | several signs together: bow + loose tail + soft open mouth + gaze. Any single one alone (e.g. a stretch) does not qualify. |

### 1.10 `turn_away`

> „Der Körper dreht sich vom Auslöser weg, der Kopf ist tief. Die Ohren sind nach hinten gelegt, die Rute hängt tief. Der Blick geht zur Seite.“

| | |
|---|---|
| Used for | L01 round B and L03 round B (Bruno "wendet sich ab", "abgewandter Blick und gespannte Haltung"), reaction to an unhelpful option |
| Must read | a deliberate turn of head and shoulders away from the trigger side (left/handler side in the lesson), head low, ears back, tail low, gaze to the side — **not** a flee |
| Live / range | 1.5 s, no loop · range 1–2 s |
| Events | none |
| Disqualifies | running away, cowering flat to the floor, trembling loop, snapping/growling, tail tucked between the legs tightly with a crouch (that is fear played as spectacle — 07: "Keine Schreckanimation als lustige Dauerschleife") |
| Vendor names | `TurnLeft/Right` (needs added head/ear/tail), `LookAway`, `Avoid`, `Retreat` (check for root motion), `Scared` (usually too strong) |
| Meaning check | L01 teaches "mehrere Hinweise sprechen dafür, die Situation leichter zu machen". The clip must offer several hints (turn + low head + ears back + low tail) and still look like a dog that can be helped by more distance, not a dog in panic. |

### 1.11 `tense_idle`

> „Das Gewicht ist nach hinten verlagert, die Beine sind steif. Die Rute hängt tief und bewegt sich kaum, die Ohren liegen an, die Augen sind verengt, der Mund ist geschlossen.“

| | |
|---|---|
| Used for | context tension (L01 B, L03 B, high scenario stress) |
| Must read | weight shifted to the rear, stiff straight legs, low and nearly still tail, ears flat, **closed mouth**, narrowed eyes (lid control if the rig has it), very little motion — the stillness is the signal |
| Live / range | 2.5 s, loop · range 2–3 s loop |
| Events | none |
| Disqualifies | alert stance with ears forward and tail up ("Alert"/"Guard"), barking, growling, hackles, lunging, attack/bite wind-ups, any teeth, pacing |
| Vendor names | `Tense`, `Nervous`, `Cautious`, `Fear_Idle` (check intensity), `Alert` (usually wrong — forward alert is a different message), `Guard`/`Attack`/`Bark` (reject) |
| Meaning check | 07: "Unsicherheit als kombinierte, kontextbezogene Pose: Distanz, Abwenden, Spannung." Reviewer names at least three: weight back, closed mouth, low still tail, flat ears. If the clip could be captioned "aggressive", reject. The game never labels a feeling; the clip must leave room for the observation text. |

### 1.12 `tired_idle`

> „Der Kopf hängt tiefer als der Rücken, die Bewegungen sind langsam. Die Lider sind schwer, die Ohren hängen locker, die Rute ist tief und ruhig.“

| | |
|---|---|
| Used for | L03 round A (energy ≤ 34), fatigue after several exercises |
| Must read | standing or sitting with the head below the back line, slow motion throughout (slow blink, slow weight shift), heavy lids, loose ears, low quiet tail |
| Live / range | 3.5 s, loop · range 3–4 s loop |
| Events | none |
| Disqualifies | collapse, lying flat on the side, staggering/limping ("Hurt"), death clips, yawning played as a cartoon, panting with a grin, trembling |
| Vendor names | `Tired`, `Exhausted` (check for collapse), `Sleepy`, `Idle_Slow`, `Hurt`/`Die`/`Death` (reject) |
| Meaning check | L03: "Ermüdung erkennen und eine belastende Situation vereinfachen". The dog must still be upright and able to accept the rest offer; a dog on the floor removes the player's choice. No medical reading ("Keine realen … Diagnosen", 03). |

### 1.13 `recover`

> „Die Spannung löst sich: Der Körper wird weicher, die Ohren kommen nach vorn, die Rute hebt sich auf mittlere Höhe. Ein Schütteln oder ein tiefer Atemzug gehört oft dazu.“

| | |
|---|---|
| Used for | after a helpful decision in a tense round (L03 B: "zeigt gelöste Körperhaltung"), return to normal posture |
| Must read | starts from the `tense_idle`/`turn_away` body, ends in the `idle_relaxed` body: weight returns to centre, ears come forward, tail rises to mid, plus a visible **body shake-off or one deep breath** |
| Live / range | 2.0 s, no loop · range 2 s |
| Events | none |
| Disqualifies | jumping up on the human, spinning, bark, immediate play bow (that is a separate clip), any "get up from the floor" (GetUp clips start lying — wrong start pose) |
| Vendor names | `Shake`, `ShakeOff`, `Breathe`, `Relax`, `Recover`, `GetUp` (wrong start pose unless the previous clip was lying) |
| Meaning check | this clip is the reward picture for "mehr Abstand hilft". It must be readable as *release*, not as excitement. First and last frames must blend into the neighbouring clips without a pop. |

## 2. Human clips (5)

Mira (trainer, ≈ 1.70 m, relaxed posture, small reward pouch at the hip) and Alex (Bruno's person, ≈ 1.76 m) share the clip set. 08: "Beutel an Hüfte, nicht schwebend. Belohnungsgeste darf Hund nicht von oben bedrängen." Humans stand to the left of the dog in the lesson directive, turned ≈ 35° — most gestures are seen **side-on**, so hand position must read in profile.

### 2.1 `idle`

> „{Name} steht ruhig mit lockeren Schultern, die Hände hängen locker, der Blick geht zum Hund.“

| | |
|---|---|
| Must read | upright but soft stance, shoulders down, arms hanging, weight even, head turned slightly down towards the dog, slow breathing |
| Live / range | 4.0 s, loop · (08 gives no human range; keep 3–5 s) |
| Disqualifies | arms crossed, hands on hips, phone gesture, weight shifting side to side like a game character, looking at the camera |
| Vendor names | `Idle`, `Breathing_Idle`, `Standing_Idle`, `Neutral` |
| Meaning check | the human must never be the focus; the clip is calm background that frames the dog. |

### 2.2 `greet`

> „{Name} hebt eine Hand kurz zum Gruß und bleibt dabei auf Abstand.“

| | |
|---|---|
| Must read | one hand raised to shoulder height briefly, body stays in place (no step forward), head stays oriented to the dog or the other human |
| Live / range | 1.5 s, no loop |
| Disqualifies | stepping or leaning towards the dog, bending over the dog, big waving loop, both arms up |
| Vendor names | `Wave`, `Greet`, `Hello`, `Wave_Short` |
| Meaning check | "auf Abstand bleiben" is the teaching — distance is part of the greeting. |

### 2.3 `gesture_explain`

> „{Name} zeigt mit offener Hand zur Seite und erklärt ruhig.“

| | |
|---|---|
| Must read | open palm (not pointing finger), arm moving to the side at waist-to-chest height, small calm head movement; readable in profile |
| Live / range | 2.0 s, no loop |
| Disqualifies | pointing finger at the dog or the player, large "talking" arm loops, shrugging, finger wagging |
| Vendor names | `Talking`, `Explain`, `Gesture_Open`, `Present` |
| Meaning check | Mira "spricht kurz und konkret" (07). One gesture per sentence; nothing that could read as scolding. |

### 2.4 `offer_reward`

> „{Name} hält eine kleine Belohnung tief vor dem Körper und wartet.“

| | |
|---|---|
| Must read | hand goes to the hip pouch, then comes **low and in front of the body** (below the knee for a puppy, at the dog's head height), palm up or lightly closed, then holds still — the wait is the point |
| Live / range | 2.0 s, no loop |
| Disqualifies | hand coming from above the dog's head (08: "darf Hund nicht von oben bedrängen"), luring with big arm sweeps, bending at the waist over the dog, throwing motion |
| Vendor names | `Give`, `Offer`, `Hand_Out`, `Feed`, `Pickup_Low` (needs the hold) |
| Meaning check | L02 B: "passende Belohnung zeigt eine kleine Futtergabe". The hold at the end must be long enough that the dog's `eat`/`look_at_handler` can follow without the human moving. |

### 2.5 `kneel`

> „{Name} geht in die Hocke und hält die Hand tief.“

| | |
|---|---|
| Must read | transition into a squat (not a one-knee hero kneel), back fairly upright, one hand low with the palm visible, gaze to the dog |
| Live / range | 1.5 s, no loop |
| Disqualifies | reaching over or grabbing the dog, both arms spread as if to catch, kneeling frontal to the camera with a stare at the player, sitting down fully |
| Vendor names | `Crouch`, `Squat`, `Kneel` (check for the knight pose), `Crouch_Idle` (end pose only) |
| Meaning check | lowering the body makes contact easier for the dog; the clip must show the human getting smaller and waiting, not approaching. |

## 3. Growing Nala — identity cues that every clip must keep

From `07_CHARAKTERE.md` ("Nala", "Figurenübersicht") and the live asset split `dog.nala.puppy` / `dog.nala.growing`:

- **Same face, always.** Dark brown eyes with normal pupils and clear lids, the small cream forehead stripe from the reference sheet, drop ears. "Keine ständig grinsende Schnauze" — the mouth is closed or slightly open in neutral clips; a fixed grin is not a style, it is a wrong signal.
- **Markings do not move.** Honey-coloured body, cream chest and paws, cream stripe. A vendor retarget must not stretch or shift these when proportions change (check the UV/texture, not only the mesh).
- **Harness colour: sage** (`--color-sage` in the UI palette; apricot is Bruno's). The harness sits on the body in every pose and must not cut in when sitting or lying (08). It scales with the chest, not with the whole mesh.
- **Proportions change, scale does not.** Shoulder height 0.28 m (start) → 0.36 m (MVP growth step) → 0.48 m (roadmap adult). Head becomes relatively smaller, legs longer, body more stable. "Nicht nur Gesamtmesh skalieren" — a clip authored on the puppy rig needs a retarget check on the growing rig: paw contact, stride length (`walkCycleLength` depends on leg length), head-to-bowl distance in `eat`, forehead stripe still centred.
- **Fictional sizes.** These are art values; the brief must not imply real age or breed charts (07, 03 "Spielregel versus Realität").
- **Temperament stays.** Curious, contact-seeking, occasionally careful with new things. The growing Nala is not "braver" or "better trained" by default — the lesson state decides the pose, not the model variant.

Bruno for contrast (so clips are not accidentally swapped): chestnut body, white muzzle/chest, white forehead streak and white tail tip, folded ears, apricot harness, 0.31 m, broader, slightly shorter muzzle with free breathing. His scenario demonstrates adaptation, never a "worse dog" comparison.

## 4. Educational meaning check (run per clip)

Principle D1 (`03_LERNPLAN_QUELLEN.md`, D1 and L01 transfer): *several signs together; no single movement proves an inner state; never a feeling verdict from one picture.* The reviewer fills this in for every clip before it is mapped or shipped:

1. **Three signs.** Name at least three body signals the clip shows at phone size (ears, gaze, tail height/speed, weight, back line, mouth). If you can only name one, the clip is under-specified → reject or author.
2. **Sentence match.** Read the German `de.poses`/`de.gestures` line aloud while the clip loops. Every noun in the sentence must be visible; nothing visible may contradict it (e.g. the sentence says "Mund geschlossen" and the clip pants).
3. **No verdict.** Could a viewer caption the clip with a single emotion word that the game never uses ("aggressive", "scared to death", "ecstatic", "dying")? If yes, the clip is too strong for its semantic. The scene must leave the interpretation to the observation text and the player's choice.
4. **Tail test.** Is the tail the only carrier of the message? Then the clip teaches the misconception L01 explicitly corrects ("Schwanzwedeln bedeutet immer Freude") → reject.
5. **Neighbours.** Check the start and end pose against the clips that precede/follow in the lesson flow (`idle_relaxed → look_at_handler → eat`, `tense_idle → recover → idle_relaxed`, `lie_down → rest_loop`). A pose pop at a boundary breaks the reading more than a weak clip.
6. **Help is possible.** For `turn_away`, `tense_idle`, `tired_idle`: does the dog still look like one that a calmer environment, more distance or a rest would help? If the clip shows a dog beyond help (collapse, panic, attack), it contradicts the lesson's helpful option and is rejected.
7. **Loop hygiene.** Loops run 3–10 s on screen: no seam, no repeated "tic" that becomes a joke, breathing rate plausible.
8. **Record.** Note the result (clip, vendor name, verdict, the three signs) in the asset's report section so the later review by a qualified force-free trainer (03: production criterion) has evidence.

## 5. Contradictions found while writing

None between `de.poses`/`de.gestures` and 03/07/08. One wording to watch, not a contradiction: `idle_relaxed` says "die Rute pendelt auf mittlerer Höhe"; vendors read "pendelt" as a wag. The brief above pins it to slow, small-amplitude movement so the clip stays in line with 07 ("Happy ist keine pauschale Schwanzschleife") and L01's misconception row.

## 6. Clipmap hints at a glance

```json
{
  "idle_relaxed": "Idle",          "look_at_handler": "LookAt",
  "sniff": "Sniff",                "walk": "Walk_InPlace",
  "sit": "StandToSit",             "lie_down": "LieDown",
  "rest_loop": "Sleep",            "eat": "Eat",
  "play_bow": "PlayBow",           "turn_away": "LookAway",
  "tense_idle": "Nervous",         "tired_idle": "Tired",
  "recover": "ShakeOff",
  "idle": "Standing_Idle",         "greet": "Wave_Short",
  "gesture_explain": "Explain",    "offer_reward": "Offer",
  "kneel": "Crouch"
}
```

These are the most common vendor labels only; `ingest-vendor.mjs --clipmap` resolves unlisted semantics by exact then loose name match and reports `autoMatched`, which the reviewer must still confirm against sections 1–2 and the check in section 4.
