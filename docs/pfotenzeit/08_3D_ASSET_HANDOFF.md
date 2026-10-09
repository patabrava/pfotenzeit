# 3D-Modellierungsauftrag und Assetvertrag

## Reihenfolge

Nala neutral und rigged → Nala Kernanimationen → Schulhof → Bruno → Mira und Alex → Nalas Wachstumsschritt → Dekoration. Keks/Lotti/Sam/Jo erst Roadmap. Generierte 3D-Rohmodelle sind Eingangsmaterial und müssen gereinigt, retopologisiert, geriggt und exportiert werden.

## Manifest

| Key | Auslieferung | Geometrieziel LOD0 | Texturen | Kernanforderung |
|---|---|---:|---|---|
| dog.nala.puppy | dog_nala_puppy.glb | 12–18k Dreiecke | 1 × 1024 Atlas | rigged, Ohren und Schwanz beweglich |
| dog.nala.growing | dog_nala_growing.glb | 12–18k | gleicher Atlas möglich | veränderte Proportionen, Animationen geprüft |
| dog.bruno.puppy | dog_bruno_puppy.glb | 12–18k | 1 × 1024 | eigener Körper, kompatibler Clipvertrag |
| human.mira / human.alex | einzelne GLB | 10–16k je Figur | 1 × 1024 je Figur | neutraler A-Pose-Export, humanoides Rig |
| environment.school | school_courtyard.glb | ≤45k insgesamt | gemeinsame 1024/2048 Atlanten | modular, einfache Materialien |
| props.care | care_props.glb | ≤8k insgesamt | 1 × 512/1024 | Napf, Wassernapf, Decke, Spielzeug |
| props.upgrades | school_upgrades.glb | ≤10k insgesamt | gemeinsame Atlanten | Ruheplatzdeko, Schnüffelecke |

Ziel für Hundedatei inkl. Clips ≤3 MB, Mensch ≤2 MB, initiale komprimierte 3D-Ladung ≤8 MB; späteres Gesamtpaket MVP ≤15 MB ohne Dokumentbilder. Diese Budgets sind Ziele, keine bereits gemessenen Ergebnisse. Referenz-PNGs nicht in die App packen.

## Koordinaten

glTF-Auslieferung in Metern, +Y oben, lokale Vorwärtsrichtung +Z. Blender arbeitet intern anders; Exportkonversion genau einmal, nicht im Runtimecode mit zusätzlichen Korrekturen kompensieren. Ursprung Hund/Mensch am Boden zwischen Füßen/Pfoten. Unskalierter Root (1,1,1), keine negativen Skalierungen, keine doppelten Rotationskorrekturen.

Menschen ca. 1,65–1,80 m. Nalas genaue Größe siehe Charakterbibel. Unterstand und Zaun müssen glaubwürdigen Maßstab besitzen. Pivots beweglicher Props am Gelenk. Meshes, Rigs und Materialien benennen: dog_nala_body, rig_nala, mat_nala_fur. Keine automatisch nummerierten öffentlichen Assetnamen.

## Hundeskelett

Root, pelvis, spine_01/02, neck, head, jaw; vier Beine mit Oberschenkel/Oberarm, Unterschenkel/Unterarm, Pfote; tail_01–03; ear_l/r_01–02. Maximal 4 Gewichtseinflüsse pro Vertex. Lider als zwei Bone- oder Morph-Ziele, Augenblickrichtung separat. Keine in Fell verschwundenen Gelenke oder unverbundenen Pfoten.

## Clipvertrag

| Clip | Dauerziel | Verwendung |
|---|---:|---|
| idle_relaxed | 3–5 s loop | Beobachten |
| look_at_handler | 1–2 s | Orientierung, Kopf + weicher Körper |
| sniff | 2–3 s loop | Umgebung untersuchen |
| walk | 1 s loop | kurze scripted Bewegung |
| sit / lie_down | 1–2 s | Übergänge, kein Sprung in Pose |
| rest_loop | 4–6 s | ruhen |
| eat | 3–5 s | Pflege, Maul/Napfkontakt |
| play_bow | 1–2 s | Spielangebot |
| turn_away | 1–2 s | Distanz-/Abwendungssituation |
| tense_idle | 2–3 s loop | kontextbezogene Anspannung |
| tired_idle | 3–4 s loop | Ermüdung |
| recover | 2 s | Rückkehr in normale Haltung |

Tod besitzt keinen 3D-Clip. Walk bewegt Beine in place; Position übernimmt Runtime. Events wie treat_received stehen als externe Clipmetadaten, nicht als unprüfbare AnimationCallback-Logik. Blick, Schwanz und Ohren müssen zu jeweiligen Szenarien passen.

## Menschenskelett und Clips

Standardhumanoid mit Fingern vereinfacht. idle, greet, gesture_explain, offer_reward, kneel. Beutel an Hüfte, nicht schwebend. Geschirr sitzt am Hund und schneidet beim Sitzen/Liegen nicht ein. Belohnungsgeste darf Hund nicht von oben bedrängen.

## Exportpipeline

1. Modell aus Referenz und textlichem Brief erzeugen.
2. Blender: Topologie, UVs, Normals, Materialslots, Deformation bereinigen.
3. Neutralpose und alle Clips prüfen; Bodenkontakt, Maul, Ohren und Geschirr testen.
4. GLB exportieren mit eingebetteten Texturen; keine externen Pfade.
5. glTF Transform: prune/dedup, Meshopt nach Loaderkonfiguration. KTX2/Basis nur mit mitgeliefertem Decoder und getestetem Fallback.
6. glTF Validator: Fehler beheben; Warnungen erklären. Browseransicht auf tatsächlichem Smartphone prüfen.
7. asset-manifest mit key, URL, bytes, triangleCount, textureSizes, clips, license/source, bounds und version dokumentieren.

Im MVP keine Physikengine: Bewegung entlang kurzer definierter Pfade; unsichtbare Plane für platzierte Ziele. Environment enthält nur einfache Bounds. LOD1 bei später vielen Figuren; zunächst max. zwei Hunde und zwei Menschen sichtbar. Mobile Low: DPR 1–1,5, keine dynamischen Schatten; High optional kleine Schattenmap. Schatten-Kontaktfläche als vorberechnete Textur möglich.

## Wiederverwendbarer Modellprompt

„Erzeuge [Figuren-ID] nach Charakterbibel und Referenzblatt. Moderne stilisierte 3D-Figur, klare Anatomie und Silhouette, keine Haarpartikel. Identitätsmerkmale [aus 07]. Neutralpose, vier separate Pfoten bzw. vollständige Hände/Füße. Maßstab [Meter], Ursprung am Boden. Saubere quad-orientierte Topologie für Deformation, UV-Atlas und glTF-kompatible PBR-Materialien. Kein Hintergrund als Teil des Meshes. Liefere bereinigbares Quellmodell; Rig und Clips werden separat validiert.“

Ein Bild-zu-3D-System garantiert keine Rückansicht oder konsistente Topologie. Fehlende Seiten anhand des Briefs modellieren; keine Rückseitenartefakte einfach übernehmen.
