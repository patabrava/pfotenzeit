# Pfotenzeit — Design- und Produktionspaket

Stand: 09.10.2026. Arbeitstitel, noch nicht auf Verfügbarkeit geprüft.

Ein erwachsenes, entspanntes Hundeschulspiel für das Smartphone: Du begleitest deinen eigenen Welpen, lernst ihn zu verstehen und übst in kurzen Einheiten. Die moderne 3D-Welt wird durch ein separat aufrufbares Pixelprofil ergänzt.

## Status und verbindliche Entscheidungen

- Zielgruppe: Erwachsene mit ihrem ersten Hund. Spieltexte und Dokumentation: Deutsch; Gespräch mit Auftraggeber: Englisch.
- Mobile-first Web-App; Touch und Hochformat zuerst, Desktop ergänzend.
- 3–5 Minuten pro Sitzung. Eigener Welpe plus Hundeschule mit Gästen.
- Bindung und Ausbau der Schule als Fortschritt; Welpen wachsen über Kapitel.
- Standardmodus ohne Abwesenheitsstrafe. Optionaler Tamagotchi-Challenge-Modus mit begrenztem Offline-Verfall und möglichem Tod durch fortgesetzte Vernachlässigung während aktiver Spielzeit.
- Prototyp, keine Monetarisierung, kein Multiplayer, kein Konto erforderlich.
- Moderne stilisierte 3D-Grafik. Pixelprofil zeigt denselben Hund und dieselben Werte.
- Dieses Paket plant das Spiel. Es enthält keine ausführbare App und keine fertigen 3D-Modelle.

## Claude-Ausführung

Die Übergabe wurde für Claude mit plain Three.js, TypeScript und Vite ergänzt. [00_START_HERE_CLAUDE.md](00_START_HERE_CLAUDE.md) enthält den direkt verwendbaren Startprompt. [CLAUDE.md](CLAUDE.md) enthält Projektanweisungen. Der frühere R3F-Vorschlag ist ersetzt.

## Lesereihenfolge

| Datei | Zweck |
|---|---|
| [01_SPIELVISION.md](01_SPIELVISION.md) | Spielerfantasie, Umfang, Designprinzipien |
| [02_SPIELSCHLEIFE.md](02_SPIELSCHLEIFE.md) | Konkreter Ablauf, Regeln, Fortschritt |
| [03_LERNPLAN_QUELLEN.md](03_LERNPLAN_QUELLEN.md) | Lektionen, Quellen und Buchabgleich |
| [04_PFLEGE_CHALLENGE.md](04_PFLEGE_CHALLENGE.md) | Pflege, Zeitregeln, Tod und Wiederbeginn |
| [05_MOBILE_UX.md](05_MOBILE_UX.md) | Bildschirme, Touch, Responsivität, Texte |
| [06_ART_DIRECTION.md](06_ART_DIRECTION.md) | 3D- und Pixelstil, Kamera, Materialien |
| [07_CHARAKTERE.md](07_CHARAKTERE.md) | Gesamter geplanter Figurenbestand |
| [08_3D_ASSET_HANDOFF.md](08_3D_ASSET_HANDOFF.md) | Assetliste, Modellierung, Rigging, Export |
| [09_TECHNIK.md](09_TECHNIK.md) | Stack, Zustand, Daten, Speichern, Performance |
| [10_MVP_ROADMAP.md](10_MVP_ROADMAP.md) | Spielbarer Umfang und Erweiterungen |
| [11_QA_ABNAHME.md](11_QA_ABNAHME.md) | Verhaltens-, Geräte- und Lernprüfungen |
| [12_LLM_AUFTRAG.md](12_LLM_AUFTRAG.md) | Arbeitsauftrag für ausführendes LLM |
| [13_BILDPROMPTS.md](13_BILDPROMPTS.md) | Bildgenerierung und Referenzen |
| [14_CLAUDE_EXECUTION.md](14_CLAUDE_EXECUTION.md) | Three.js-Buildfolge und Dateistruktur |
| [15_DATEN_REGELN.md](15_DATEN_REGELN.md) | präzisierter Daten-/Transaktionsvertrag |
| [16_ASSET_PRODUCTION.md](16_ASSET_PRODUCTION.md) | Assettickets und funktionale Fallbacks |
| [17_EXECUTION_CHECKLIST.md](17_EXECUTION_CHECKLIST.md) | Befehle, Nachweise und Fortsetzung |

## Offene Recherche, keine versteckten Annahmen

Der vollständige Inhalt der vom Nutzer verlinkten Buchausgabe liegt nicht vor. Der Lernplan ist ein vorläufiger, eigenständig formulierter Entwurf; er ist keine vollständige Adaption des Buches. Ein Buchabgleich ist vor endgültiger Freigabe der Lerntexte erforderlich. Die öffentlich gefundene KOSMOS-Ausgabe hat eine andere ISBN als der Amazon-Link. Keine Seitenzahlen oder Kapitelzuordnungen erfinden.

Die exakte Bildmodellwahl GPT Image 2 kann im verfügbaren eingebauten Bildwerkzeug nicht verifiziert werden. Generierte Referenzen werden entsprechend ausgewiesen. Charakterbilder sind Konzeptvorlagen; die textlichen Modellierungsregeln bleiben bei Widersprüchen maßgeblich.

## Übergabe

Das ausführende LLM beginnt bei 00_START_HERE_CLAUDE.md und implementiert nur den MVP. Die Roadmap ist kein Auftrag, sofort alle Erweiterungen zu bauen. Keine native App oder Store-Veröffentlichung im Prototyp. Buchmaterial, reale Trainingsprüfung und Testgerät bleiben explizite Prüfpunkte.
