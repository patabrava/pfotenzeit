# Art Direction

## Moderne 3D-Hundeschule

Hochwertig stilisierte, anatomisch nachvollziehbare Figuren. Weiche Silhouetten, zurückhaltend vergrößerte Köpfe und Pfoten, lesbare Augen. Kein Fotorealismus, kein Fell aus Millionen Haaren, kein kindliches Spielzeuggesicht. Reife, freundliche Bildsprache für Erwachsene.

Palette: Kreide #F4F0E8, Tinte #243631, Salbei #AFC6AE, Wald #326B58, Aprikose #E4A67B. Akzentgold #D1AE62 sparsam für Fortschritt. Warnungen besitzen Text und Symbol; Farbe ist nicht alleiniger Träger.

Materialien: matte Stoffe, helles Holz, leicht raue Keramik, vereinfachte Fellflächen mit großen Farbblöcken. Fell als Oberfläche und wenige geometrische Büschel. Licht: warme breite Hauptquelle, sanfte Umgebungsfüllung, gebackene Kontaktverschattung. Kein notwendiger Bloom, keine teuren Echtzeitreflexionen.

## Schule

Ein ruhiger, eingezäunter Innenhof mit Holzunterstand. Drei Bereiche im selben kompakten Raum: Trainingsfläche, bereits nutzbarer Ruheplatz, Schnüffelecke als Ausbau. Sichtbarer Wasserplatz. Vegetation und wenige vertraute Requisiten geben Maßstab. Keine bewegten Verkehrsreize im MVP.

## Kamera

Festes erhöhtes Dreiviertelbild, orthografisch oder sehr schwache Perspektive, Kamera ca. 35° nach unten. Fokus auf spielenden Hund statt gesamten Hof. Bei Körpersprache kurz in vorbereiteten Nahblick wechseln; Hochformat muss Augen, Ohren, Schwanz und Körperhaltung gleichzeitig lesbar zeigen. Kamerawechsel nur zwischen Entscheidungen, 250–400 ms, bei Bewegungsreduktion direkt. Referenzansichten für Modelle dagegen orthografisch, neutral beleuchtet.

## UI

Runde, aber klare Buttons; natürliche Farben; begrenzte Kartenflächen, kein Glassmorphism-Dashboard. Selbst gehostete gut lesbare Schrift, z. B. Atkinson Hyperlegible nach Lizenzprüfung. Pixeltypografie ausschließlich dekorativ für Profilüberschriften; Fließtext bleibt normal lesbar.

## Pixelprofil

Nala behält cremefarbene Brust, honigfarbenes Fell, Schlappohren und salbeigrünes Geschirr. Bruno behält kastanienfarbene Flächen und weiße Schnauze. Profilauflösung intern 128 × 128, Hund innerhalb von 64 × 64; Ausgabe mit ganzzahliger Skalierung und nearest-neighbor. 12–16 Farben, keine weichen Kanten. Größere Layoutflächen sind DOM; Bildgenerierung ist zunächst Stilreferenz, nicht fertige Spritestrip-Produktion.

## Bildreferenzen

Die Bildblätter werden in characters/ gespeichert und in 13_BILDPROMPTS.md erfasst. Sie bestimmen Identität und Stil, nicht technische Topologie, perfekte Ansichten oder Knochen. Bei Bildfehlern gelten die Figurendefinitionen und Exportregeln.

## Audio und Feedback

MVP ohne gesprochene Trainertexte: Untertitel/DOM-Text sind die Hauptinformation. Kleine weiche Sounds für passende Entscheidung und Ausbau; keine Fehlersirene. Hundesounds sparsam, nicht als Ersatz für Körpersprache. Optional ruhige Hintergrundschleife, standardmäßig erst nach aktivierter Audiofreigabe. Gesamtes Audiobudget Ziel ≤2 MB, kurze komprimierte Clips mit Browserfallback. Alle externen Sounds mit Herkunft und Lizenz dokumentieren. Haptik optional, nie einzige Rückmeldung, nicht voraussetzen, dass jeder Browser sie unterstützt.
