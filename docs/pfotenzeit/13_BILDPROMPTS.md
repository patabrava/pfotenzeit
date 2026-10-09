# Bildgenerierung und Referenzblätter

Generiert am 09.10.2026 mit dem eingebauten image_gen-Werkzeug. GPT Image 2 war der Modellwunsch des Nutzers; das Werkzeug bietet keinen Modellparameter und bestätigt keinen Modellnamen. Deshalb ist die exakte Modellidentität nicht verifiziert. Kein API-Fallback verwendet, da kein OPENAI_API_KEY konfiguriert ist.

## Dateien

| Referenz | Inhalt | Status |
|---|---|---|
| [Nala](characters/01_nala.png) | Vier Ansichten, Wachstum, Posen und Pixelidee | Visuell geprüft; Konzept, kein fertiges Modell |
| [Gastwelpen](characters/02_gastwelpen.png) | Bruno, Keks, Lotti mit vier Ansichten | Visuell geprüft; Bruno MVP, andere Roadmap |
| [Menschen](characters/03_menschen.png) | Mira, Alex, Sam, Jo; Front, Seite, Rücken | Visuell geprüft; Mira/Alex MVP |

Alle Bilder wurden aus dem generierten Bilderverzeichnis in dieses Paket kopiert. Originale bleiben erhalten.

## Prüfergebnis und Hinweise für Modellierung

Nala besitzt auf dem Blatt zusätzlich einen kleinen cremefarbenen Stirnstrich; dieser wird als Identitätsmerkmal übernommen. Bruno hat einen weißen Stirnstreifen und eine weiße Schwanzspitze; diese Merkmale ebenfalls konsistent halten. Gesichter, Geschirre und Farbzuordnung sind über die Ansichten gut erkennbar. Alle geplanten acht Figuren sind abgedeckt.

Die Hunde haben auf den Bildern relativ detailliertes Fell. Für mobile Modelle Oberfläche und Büschel vereinfachen; keine Haare einzeln modellieren. Die Bilder sind keine exakten orthografischen Konstruktionszeichnungen. Rückansichten verstecken teils Pfotenmarkierungen; nach dem schriftlichen Brief vervollständigen. Neutralposes benötigen spätere technische Rig-Posen. Der Pixelausschnitt ist Stilreferenz, kein exakt 64×64 exportiertes Laufzeitasset.

## Vollständige verwendete Prompts

### 01 — Nala

```text
Use case: stylized-concept
Asset type: professional character reference sheet for a mobile-first 3D puppy-training game titled Pfotenzeit.
Primary request: create a polished landscape character modeling sheet of NALA, one single original honey-gold mixed-breed puppy with cream chest and cream paws, dark brown eyes, natural floppy ears, a long natural tail and a simple sage-green body harness. All views must depict the identical character and markings.
Style/medium: premium contemporary stylized 3D game render, warm refined materials, softly rounded but anatomically plausible canine body, readable eyes, no photoreal hair, no toy plastic, no exaggerated grin.
Composition: editorial off-white reference sheet with generous whitespace. Top row: four clearly separated full-body neutral standing views, front, true left profile, back, and three-quarter, matching scale and ground baseline. Four paws, natural muzzle, tail visible. Bottom left: two growth silhouettes as rendered full-body characters, first the same puppy and then a slightly larger juvenile, longer legs and relatively smaller head, identical markings. Bottom center: relaxed pose, sniffing pose and resting pose, expressions subtle. Bottom right: a small square 64-pixel style portrait of this same honey puppy with cream chest and sage harness, sharp pixel edges, limited palette, clearly a small pixel companion view.
Lighting: neutral soft studio lighting with mild contact shadows only.
Text: only large clean heading "NALA", and small simple labels "Welpe", "Wachsen", "Pixelprofil". No dense text.
Constraints: all figures fully in frame, no extra dogs, no leashes covering anatomy, no accessories beyond harness, no humans, no backdrop scenery, no watermark. This is a modeling concept sheet, never imply finished rigged models. Make the repeated identity exceptionally consistent.
```

### 02 — Gastwelpen

```text
Use case: stylized-concept
Asset type: professional 3D character reference sheet, same refined contemporary stylized game-art direction as a honey puppy with a sage harness; mobile dog-school game Pfotenzeit.
Primary request: landscape character sheet showing THREE distinct original puppy designs, arranged in three horizontal rows on a warm off-white clean background. Each row includes front standing, true side standing, rear standing, and one expressive three-quarter pose of the same dog, consistent proportions and markings.
Row 1 "BRUNO": chestnut-brown medium-stocky mixed-breed puppy, white muzzle, white chest and toes, soft folded ears, long natural tail, apricot-colored simple body harness. Relaxed curious expression, normal-length muzzle, no brachycephaly.
Row 2 "KEKS": compact gray-brown wiry-coated mixed-breed puppy, cream eyebrows and muzzle, natural folded ears, long natural tail, ochre body harness. Stylized geometric fur tufts, no dense hair particles. Alert sniffing personality.
Row 3 "LOTTI": slender black mixed-breed puppy, white chest and toe tips, ears softly tipped, long natural tail, muted lavender body harness. Tentative but comfortable three-quarter pose, not frightened or injured.
Style: premium modern stylized 3D, smooth readable anatomy, softly rounded forms, warm matte surfaces, emotionally readable natural eyes, subtly enlarged puppy heads, minimal fur clumps, not photoreal, not toy plastic.
Composition: exact three-row grid, generous whitespace, all paws and tails in frame, same scale within each row, alignment like a professional model-sheet. Text only the three names as small bold row headings, no descriptions.
Lighting: neutral broad studio illumination, soft contact shadows.
Avoid: scenery, humans, extra dogs, extra limbs, cropped bodies, watermark, leashes across anatomy, clothing beyond harness. Maintain identical markings across turnaround views. These are modeling concepts.
```

### 03 — Menschen

```text
Use case: stylized-concept
Asset type: premium modern 3D game character model sheet for a mobile puppy school, Pfotenzeit.
Primary request: professional landscape editorial reference sheet showing FOUR original adult human characters, arranged in a clear 2 by 2 panel layout. Each character panel contains a complete front view in relaxed slight A-pose, a true full-body side view, and a back view. Neutral facial expression, approachable adults, consistent identity across views.
Top left heading "MIRA": female dog trainer about 35, medium brown skin, dark curly hair in a short bun, forest-green casual overshirt over cream t-shirt, cream practical trousers, flat shoes, small reward pouch at hip. Height 1.70m.
Top right "ALEX": androgynous adult about 30, light olive skin, short dark hair, terracotta casual sweatshirt, charcoal trousers, sneakers. Height 1.76m.
Bottom left "SAM": adult about 40, dark skin, very short hair, sage-green short sleeve shirt, beige trousers, casual flat shoes. Height 1.80m.
Bottom right "JO": woman about 60, light skin, silver-gray bob, navy casual top, cream trousers, comfortable flat shoes. Height 1.65m.
Style/medium: premium contemporary stylized 3D game render, softly shaped faces with adult proportions, readable expressive eyes, restrained matte fabrics, subtle surface detail, natural body variation, anatomically plausible hands. Match a warm refined puppy game, no realistic photographic skin, no hyper-exaggerated cartoon heads.
Composition: warm off-white background, fine panel divisions, generous spacing, all characters feet and heads fully visible. Same scale within a panel. Names only as headings, no other text, no scenery, no dogs, no props besides Mira's pouch, no watermark.
Lighting: consistent soft neutral studio light, subtle ground shadow.
Constraints: all four are fictional distinct individuals, neutral practical outfits, full front-side-back reference views, no incomplete figures, no costume or logos.
```

## Gezielte spätere GPT-Image-2-Neugenerierung

Wenn expliziter GPT-Image-2-Zugang bereitsteht, dieselben Prompts und diese Bilder als Identitätsreferenzen verwenden. Gewünschtes Modell ausdrücklich im API-/CLI-Aufruf angeben und Ergebnisprovenienz dokumentieren. Keine ungeprüfte Modellbezeichnung nachträglich auf diese Blätter schreiben.

