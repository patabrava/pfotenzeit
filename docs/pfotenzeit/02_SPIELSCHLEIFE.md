# Spielschleife und Regelmodell

## Sitzung: Ziel 240 Sekunden

| Abschnitt | Richtwert | Handlung und Ergebnis |
|---|---:|---|
| Ankommen | 20 s | Nala begrüßt dich, ein aktuelles Bedürfnis wird sichtbar |
| Pflege | 30 s | Profil öffnen; Futter, Ruhe oder Spiel passend wählen |
| Vorbereitung | 25 s | Lektion und ruhige Ausgangssituation auswählen |
| Drei kurze Übungsrunden | 120 s | Beobachten → entscheiden → Reaktion → erklären |
| Gemeinsamer Abschluss | 25 s | Ruhiges Spiel oder Pause, Erinnerung freischalten |
| Schulfortschritt | 20 s | Ausbau ansehen oder nächsten Besuch vormerken |

Zeiten sind Zielwerte, keine Countdownpflicht. Animationen und Erklärungen sind wiederholbar; der Hund wartet in einem Beobachtungszustand. Unterbrechung jederzeit möglich.

## Eine Übungsrunde

1. Das Spiel präsentiert eine lesbare Situation: Körperhaltung, Umgebung, bisheriger Schritt.
2. Optional „Genauer ansehen“ zeigt Hinweise, keine diagnostische Gewissheit.
3. Zwei oder drei sinnvolle Handlungen erscheinen im unteren Bereich.
4. Eine Berührung löst genau eine Aktion aus. Aktion läuft bis zum definierten Animationsereignis; weitere Berührungen sind bis dahin gesperrt.
5. Feedback nennt Verhalten und Zusammenhang. Kein bloßes „Falsch“.
6. Bei Überforderung: leichteren Schritt anbieten. Bei Ermüdung: Pause beendet die Übung erfolgreich als Fürsorgeentscheidung.

Keine Reaktionszeitwertung. Wenn Belohnungszeitpunkt Thema ist, pausiert die Szene an einer beobachtbaren Entscheidung und fragt, welches Verhalten belohnt werden soll. Das ist eine Lernvereinfachung, kein Taktspiel.

## Beispiel: Orientierung am Menschen

Nala schnüffelt in einem ruhigen, eingezäunten Bereich. Spieler wählt „Warten und beobachten“ statt wiederholtem Rufen. Nala blickt kurz zum Menschen. Die Szene hält den Blickkontakt als Beobachtungsbild fest; Spieler wählt „Diesen Blick belohnen“. Animation zeigt kleine Belohnung. Mira: „Du hast ihre freiwillige Orientierung bemerkt.“

Nächste Runde: Ball in der Nähe. „Abstand vergrößern“ vereinfacht die Situation; „Signal wiederholen“ führt zu Ablenkung und erklärender Rückmeldung. Nala wird nicht als ungehorsam beschimpft.

## Simulation für den MVP

Deterministische, datengetriebene Szenarien mit Varianten; keine lernende KI. Geskriptete Hundehandlungen hängen von readiness, scenarioId, difficulty und temperamentProfile ab. Das ist nachvollziehbar und testbar. Temperament gehört zur Figur, nicht zu einer pauschalen Rasseannahme.

readiness ist ein qualitativer Zustand: bereit / Unterstützung nötig / Pause nötig. Im MVP leiten niedrige Sättigung oder Energie (<35/100), hohes arousal (>70/100) oder Stress (>60/100) in eine passende Fürsorgeaktion. Werte sind Spielbalance, keine realen Messgrößen. Falls nicht bereit, bleiben Futter, Ruhe und Beenden immer erreichbar.

## Bewertung

Jede abgeschlossene Sitzung vergibt einmal 1 Schulmarke, auch wenn ein sinnvoller Pausenabschluss gewählt wird. Kein zusätzliches Einkommen durch Wiederholen derselben Aktion. lessonId + visitId sichern die Einmaligkeit.

Ein Lernpunkt gilt als verstanden, wenn zwei passende Entscheidungen in unterschiedlichen Situationen gelingen. Eine zusätzliche gestützte Wiederholung ist unbegrenzt möglich. Erstmaliges Verstehen jedes der drei MVP-Lernpunkte gibt einmal 1 weitere Schulmarke. Gesamt 6 Marken aus drei regulären Besuchen; kein Grind erforderlich.

Bindung steigt um 1 pro Sitzung mit mindestens einer hilfreichen Entscheidung, maximal 1 pro visitId. Bindung kann nicht durch endloses Streicheln gesteigert werden und sinkt im Standardmodus nicht offline. UI zeigt Erinnerungen und Beschreibungen statt einen Liebe-Prozentwert.

## Ausbau und Wachstum

Ausbau 1: Ruheplatz, Kosten 2 Marken. Ausbau 2: Schnüffelecke, Kosten 3 Marken. Ruhe und Grundversorgung sind schon vorher kostenlos vorhanden; der Ausbau fügt eine Situationsvariante und sichtbare Gestaltung hinzu, keinen Zugang zu nötiger Pflege.

Nach drei abgeschlossenen Lektionen, drei Bindungserinnerungen und einem Fürsorgeabschluss: Übergang von „Ankommen“ zu „Wachsen“. Bestätigung öffnet kurze Wachstumsszene. Körper wird etwas größer; Fähigkeiten bleiben separat gespeichert. Das ist erzählerische Zeit, kein realer Entwicklungsplan.

## Zustandsablauf

HOME → PROFILE oder PREPARE → OBSERVE → DECIDE → REACT → FEEDBACK → nächste Runde oder REFLECT → REWARD → HOME.

CARE_REQUIRED kann PREPARE ersetzen. PAUSED ist aus jedem aktiven Abschnitt erreichbar. LOST gehört nur zum separaten Challenge-Speicherstand. Kein Menü darf eine laufende Trainingstransaktion erneut ausführen.
