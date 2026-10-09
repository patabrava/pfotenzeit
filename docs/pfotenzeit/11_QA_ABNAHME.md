# QA und Abnahmekriterien

Planung enthält Testfälle, keine Behauptung bereits bestandener Produkttests.

## Regeltests

| Fall | Erwartung |
|---|---|
| Standard nach 30 Tagen zurück | Bedürfnisse und Hundstatus unverändert |
| Challenge nach 30 Tagen zurück | Offline nur max. 8 h; satiety ≥25, vitality unverändert |
| Challenge zwei Rückkehrereignisse gleicher Sitzung | Offlineverlust einmal |
| Geräteuhr rückwärts | Kein negativer Verlust, kein Bonus |
| App versteckt oder Lerntext geöffnet | Kein aktiver Pflegeverfall |
| Challenge pausiert | Kein aktiver/offline Verfall |
| satiety = 0, vitality = 100, 19 aktive Minuten | vitality = 5; kritisch, lebend |
| weitere aktive Minute ohne Pflege | verloren; ausschließlich Challenge-Lauf |
| Mahlzeit im kritischen Zustand | satiety >0; vitalityverlust stoppt, kostenlos |
| Zweiter Tab | Keine zweite Simulationsuhr, keine konkurrierenden Writes |
| Kauf mehrfach berührt | Kosten und Upgrade genau einmal |
| Belohnung nach Reload erneut angefordert | Kein doppelter Besuchs- oder Lernbonus |
| Profil und 3D nach Pflege | Gleiche Bedürfnisse, Lebensphase und Status |
| Wachstum | Voraussetzungen nötig, Gelernt bleibt erhalten |
| Challenge-Verlust | Standardspielstand unverändert |

## Touch und Responsivität

360×640, 390×844, 430×932 Hochformat; 844×390 Querformat; Tablet 768×1024; Desktop 1440×900. Tatsächliches iOS Safari und Android Chrome testen, Geräte/OS/Browser dokumentieren. Browseremulation allein reicht nicht für thermisches Verhalten, Audio und Hintergrundwechsel.

Buttons mindestens 48 px, keine Hoverpflicht, keine verdeckten Aktionsleisten durch Safe Area. Text 200 %, lange deutsche Labels, Bildschirmtastatur beim Umbenennen. pointercancel, schnelle Mehrfachberührung, scrollender Sheet, Modal schließen: keine unbeabsichtigte Weltaktion.

## 3D

Nalas vier Pfoten separat; normale Augen; Hals, Ohren, Schwanz und Geschirr deformieren ohne sichtbare Durchdringung. L01-Haltungen aus Smartphoneabstand lesbar. Kein Fußgleiten bei walk; Größen konsistent. Referenzbilder können konzeptionelle Fehler enthalten; Modellprüfung ist eigene Abnahme.

Dateigröße, Dreiecke, Texturen, draw calls und FPS auf Referenzgerät messen. Fünf Minuten Dauerbetrieb und Profilwechsel: kein zunehmender Speicherverbrauch, kein dauerhaft aktives Rendering hinter Profil. Langsame Verbindung, fehlerhaftes GLB und WebGL-Ausfall ergeben verständliche Alternativen.

## Lernen und Ton

Jede Option besitzt verständliches Feedback. Pausenabschluss wird belohnt. Keine implizite Behauptung, Erfolg im Spiel garantiere Trainingserfolg draußen. Quellenstatus für jeden Lernpunkt nachvollziehbar. Challenge-Tod ist als Spielmechanik erklärt. Finale Lerntexte und Körpersprache fachlich prüfen, bevor aus dem Prototyp ein öffentliches Lernangebot wird.

## Speichern und Installation

Neu laden in allen Zuständen; App schließen mitten in Pflege/Kauf; Speicherkontingent-Fehler; Export/Import gültiger/ungültiger Version; Service-Worker-Update ohne gemischte Assetversion. Nicht migrierbarer Spielstand wird gesichert und erklärt, nicht still zurückgesetzt.

## Definition of Done MVP

Alle regulären Kernfälle bestanden, ein dokumentiertes Smartphone erreicht Performanceziele oder Abweichung ist mit reduziertem Profil gelöst. Drei Lektionen in 3–5 Minuten, zwei Ausbauten und Wachstum erreichbar. Standard ist Startmodus. Challenge als separate bewusste Option. Offene Buchrecherche bleibt als offene Recherche ausgewiesen.
