# Claude-Abschlusscheck und Fortsetzung

## Erwartete npm-Skripte

```text
npm run dev       # lokaler Entwicklungsserver
npm run typecheck # TypeScript ohne Emit
npm run test      # Regeltests einmalig, kein endloser Watchlauf
npm run build     # Produktionsbuild
npm run preview   # lokaler Produktionspreview
npm run test:e2e  # Browser-Smoke, falls eingerichtet
npm run assets:check # Manifest/GLB-Prüfungen, fehlende Finals melden
```

Dies sind Skriptanforderungen, keine Befehle, die im Designpaket schon funktionieren. Testserver nur lokal/LAN für Prüfung; keine Veröffentlichung dadurch autorisiert. Installation in README nach gewähltem Lockfile und Paketmanager dokumentieren.

## Erstes lauffähiges Ergebnis

Standard öffnen → Nala-Profil → Pflege → L01 → Reflexion → Marke → Reload. Muss ohne externe API-Verbindung und ohne fertige 3D-Modelle funktionieren. Textsprache Deutsch, Header und Aktionen auf 360 px erreichbar. Ein Fehler beim optionalen Audio darf die Sitzung nicht blockieren.

## Automatisierte Regelprüfungen

Die Fälle aus 11 plus: before=10 bleibt bei Offlineabgleich 10; ungültiger Import wird abgewiesen; drei L01-Wiederholungen erfüllen nicht die drei unterschiedlichen Lektionen für Wachstum; animierter Retry kostet nicht erneut Energie; Profil erzeugt keinen Offlineverlust; abgeschnittene Animation führt nicht zu doppelter Pflege; mode-switch verändert nur ausgewählten Save; Kauf ohne Marken ist ein erklärter No-op.

Time-, ID- und Seed-Provider injizieren, damit Tests ohne echte Wartezeit reproduzierbar bleiben. Tests sollen tatsächliche Produktinvarianten prüfen, nicht internen Funktionsnamen spiegeln.

## Browser-Smoke

1. Standardstart und Profilansichten.
2. Jede der drei Lektionen einmal, gestützte Wiederholung, sinnvoller Pausenabschluss.
3. Zwei Ausbauten, Wachstum und erhaltene Lernpunkte.
4. Reload während Pflege, Feedback, Kauf und Reflexion.
5. Challenge-Einstieg, getrennte Saves, Warnungen, kostenlose Erholung, Verlust und neuer Lauf.
6. Sichtbarkeit/Fokus, zweite Tabs, Speicherfehler, offline gecachte Sitzung.
7. Portrait/Querformat/200 %-Text, Keyboard-Fokus, Audio aus, reduzierte Bewegung.
8. WebGL-Ausfall und fehlender Clip: Profil und Lerntexte weiterhin nutzbar.

Playwright o. Ä. kann Smoke automatisieren. Tatsächliches Smartphone ist gesonderte Abnahme. Netzwerkprofil und FPS-Messdauer ausdrücklich angeben. Kein Device-Zugang: als offen dokumentieren, Emulatorbefund nicht umbenennen.

## PROGRESS.md-Vorlage

```markdown
# Pfotenzeit implementation progress
Last milestone:
Completed:
Currently building:
Verified (command + result):
Device/browser measurements:
Asset statuses (placeholder/pending/final):
Known issues:
Next concrete task:
Blocking external needs:
```

## Abschlussbericht an Nutzer

Startanleitung und Previewadresse; fertige Features; Tests mit tatsächlich ausgeführten Befehlen; Geräte-/Performancebefund; finale Assets versus Platzhalter; offene Buchprüfung; bekannte Bugs und nächste konkrete Schritte. Bei unvollständiger Art kein „fertiges Spiel“ behaupten, aber funktionsfähigen Prototyp übergeben. Das endgültige Spiel muss nicht das gesamte visuelle/technische Roadmapziel erfüllen, um als prüfbarer MVP ausgeliefert zu werden.

## Vor öffentlicher Freigabe

Separater späterer Auftrag: echte Trainingsprüfung und Buchabgleich, finale Modellqualität/Lizenzen, breitere Gerätetests, gewünschtes Hosting/Datenschutz. Diese Punkte blockieren nicht die lokale Prototypimplementierung.
