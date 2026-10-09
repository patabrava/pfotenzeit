# Pflege und optionaler Tamagotchi-Modus

## Zwei getrennte Spielstände

Standard ist voreingestellt. Challenge muss bewusst in Einstellungen gewählt und mit einer kurzen Erklärung gestartet werden. Eigener dogInstanceId und modeId pro Spielstand; ein Challenge-Verlust verändert weder Standardhund noch Schulfortschritt. Wechsel jederzeit über „Spielmodus“. Challenge kann als Challenge → archiviert beendet werden; Standard bleibt verfügbar.

## Werte und Aktionen

Alle Werte 0–100, Startwert 80 außer vitality = 100 und stress/arousal = 20. Bedürfnisse gelten für den eigenen Hund. Gastwelpen unterliegen keinem langfristigen Pflegeverfall.

| Wert | Aktive Abnahme pro Minute | Offline in Challenge | Fürsorge |
|---|---:|---:|---|
| satiety | 2 | 2 pro angerechneter Stunde | Mahlzeit +35, maximal 100 |
| energy | 1; pro Übungsrunde zusätzlich 4 | 0 | Ruheaktion +30, stress −20 |
| comfort | 1 | 1 pro angerechneter Stunde | Passendes ruhiges Spiel +20; bei Stress stattdessen Abstand |
| vitality | siehe unten | niemals | Bei versorgtem Hund +2 pro aktiver Minute |

Standard hat dieselben aktiven Bedürfniswerte, aber alle bei mindestens 25 geklemmt, kein vitality-Verlust, keine Krankheit und kein Tod. Niedrige Werte leiten in Fürsorge um; keine kostenpflichtige Sperre. Wasser ist immer verfügbar; keine Wasserentzugmechanik.

Pflegeaktion wird einmal atomar reserviert/committet und visuell nach Abschluss der Animation dargestellt; Reload übernimmt den committeten Endzustand. Technische Präzisierung in 15_DATEN_REGELN.md. Dauert 3–5 Sekunden, überspringbar über Bewegungsreduktion. Zwei sofort wiederholte identische Aktionen liefern keinen weiteren Bindungsfortschritt. Futter ist unbegrenzt und kostenlos, aber keine Belohnung für Überfüttern.

## Zeitmodell

Aktiv ist nur sichtbare, fokussierte App im Zustand HOME/CARE/TRAINING. PAUSED, Einstellungen, Lerntexte, Profilbetrachtung ohne Pflegeanimation und versteckte Tabs stoppen aktive Zeit. Pro simulierter Minute logischen Tick ausführen; keine FPS-Abhängigkeit. Tod wird in Trainingszuständen nur nach Abschluss der aktuell gestarteten Aktion geprüft, dann in CARE umgeleitet.

Challenge: elapsed = max(0, nowUTC − lastSeenUTC). Angerechnet höchstens min(elapsed, 8 Stunden). Offlineverlust pro Rückkehr: satiety maximal −16, comfort maximal −8. Werte über 25 werden offline nie unter 25 reduziert. Bereits niedrigere Werte bleiben unverändert; Offlinezeit darf keine Erholung erzeugen. Formal: after = max(min(before, 25), before - loss). vitality und energy bleiben unverändert. Es gibt keine nachträgliche Offline-Todesprüfung. Offlineverlust einmal anwenden und den Zeitanker im selben Speichercommit aktualisieren. Fehlerhafte rückwärts laufende Uhr bringt keinen Bonus. Kein Server, deshalb ist Manipulation der Gerätezeit im Prototyp akzeptiertes Limit.

Im Standard alle Offlinewerte unverändert. Keine Pushnachrichten, keine Streak-Strafe, keine Termine. Während Challenge-Pause ebenfalls kein Offlineverlust; Zeitpunkt beim Wiederaufnehmen neu setzen.

## Folgen im Challenge-Modus

Bei satiety = 0 oder energy = 0: vitality −5 je aktive Minute. Bei beiden = 0 weiterhin −5, nicht doppelt. Sobald beide wieder >0, kein Verlust; bei beiden ≥35 beginnt Regeneration. comfort beeinflusst Lernbereitschaft, nicht Tod.

| vitality | Zustand | Sichtbares Feedback |
|---:|---|---|
| 61–100 | stabil | Normale Pflegehinweise |
| 31–60 | angeschlagen | Gelber Hinweis + direkte passende Fürsorgeaktion |
| 1–30 | kritisch | Training gesperrt, „Versorgen“ und „Pause“ bleiben groß erreichbar |
| 0 | verloren | Neutraler Abschiedsbildschirm, keine grafische Darstellung |

Ab vitality 100 benötigt ununterbrochene aktive Vernachlässigung nach einem auf null gesunkenen Bedürfnis 20 Minuten bis zum Verlust. Offlinezeit allein kann nie töten. Balancewerte sind Ausgangswerte und müssen getestet werden.

Kritisch ist kein Zwang, lange online zu bleiben: Eine kostenlose Pflegeaktion hebt das ursächliche Bedürfnis; danach ist App schließen sicher. „Challenge pausieren“ ist jederzeit verfügbar.

## Abschied und Neustart

Text: „Dein Challenge-Welpe ist gestorben. Dieser Spielstand endet hier.“ Danach Erinnerung ansehen, neuen Challenge-Spielstand anlegen oder in Standard wechseln. Erinnerung zeigt Name und positive Meilensteine. Keine Schuldzuweisung oder monetarisierte Wiederbelebung. Tod verändert den Hundestatus permanent in diesem Lauf; ein neuer Lauf ist ein neuer Hund. Schuldekoration im Standard bleibt erhalten.

## Pixelprofil

Pixelbild stellt Alter und aktuellen Zustand dar; Zahlen sind optional im Detailbereich. Normale Ansichten: wach, hungrig, müde, spielbereit, ruhend. Kritisch: ruhig und erschöpft, keine Verletzung. Bei Tod ein neutraler Erinnerungsrahmen. Beide Darstellungen nutzen exakt dieselben Zustandsdaten.
