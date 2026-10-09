# Ergänzter Daten- und Regelvertrag

Diese Datei präzisiert das frühe Schema aus 09. Sie ist die Ausführungsgrundlage, kein bereits getesteter Quellcode.

## Zustände und Aktionen

App-Route separat: home | profile | lesson | school | settings | reflection | memorial. Lessonphase separat: prepare | observe | decide | react | feedback | reflect | completed. Careaktionen können innerhalb des Profils laufen, obwohl passive Profilbetrachtung die Uhr stoppt.

Vollständige Action-Union im Code ergänzen: CREATE_SAVE, SELECT_MODE, START_VISIT, SELECT_OPTION, NEXT_ROUND, COMPLETE_VISIT, CARE, BUY_UPGRADE, CONFIRM_GROWTH, RENAME_DOG, PAUSE_CHALLENGE, RESUME_CHALLENGE, CLOSE_APP, APPLY_OFFLINE, TICK_ACTIVE, ACKNOWLEDGE_EFFECT. Alle zustandsverändernden Aktionen mit einmaliger transactionId. UI-Routen ohne Domain-Effekt benötigen keine Transaktion. mode/saveId für jede persistierende Aktion prüfen.

Save zusätzlich zur Skizze: saveId, createdUTC, lastSeenUTC, seeded visit data, completedLessonIds, helpfulVisitIds, careClosureVisitIds, firstHelpfulByLearningPoint, growthConfirmed, settings. Eigene Archive für verlorene Challenge-Läufe. Settings: audioEnabled, reducedMotionOverride, observationTextEnabled, qualityTier. Pausegrund in transientem Appzustand; challengePaused persistent.

## Besuch und Lernpunkt

visitId wird einmal bei START_VISIT erzeugt; Reload erhält ID, seed, round und phase. completedLessonIds speichert unterschiedliche Lektionen, nicht drei Wiederholungen derselben Lektion. Wiederholbare Besuche mit neuen IDs bleiben erlaubt und geben einmal eine Besuchsmarke; Lernbonus nur beim ersten verstandenen Lernpunkt. Keine Belohnung durch Schließen/Öffnen derselben Reflexion.

Gelernt benötigt zwei selbstständige passende Entscheidungen in unterschiedlichen scenarioIds je learningPointId. Gestützte Wiederholung ist Übung, zählt erst, wenn anschließend eine ungestützte Variante passt. Diese Variante bei Bedarf einschieben, ohne Pflichtcountdown. Bezugswerte in lessonContext müssen von echter Pflege und Challenge-vitality getrennt bleiben.

Eine Bindungserinnerung pro hilfreichem Besuch, stabile ID memory_<visitId>. Für Wachstum: L01/L02/L03 in completedLessonIds, mindestens drei hilfreiche Besuche und mindestens ein careClosureVisitId. Bei erfüllten Voraussetzungen erscheint Wachstum als einmalige bestätigbare Aktion; kein automatischer neuer Meshzustand mitten in Lektion.

## Lesson-Datenbeispiel

```ts
interface LessonOption {
  id: string;
  label: string;
  helpful: boolean;
  poseAfter: string;
  feedback: string;
  next: 'advance' | 'supportedRetry' | 'careClosure';
}
interface LessonRound {
  id: string;
  scenarioId: string;
  dogId: string;
  observationText: string;
  observationPose: string;
  supported: boolean;
  options: LessonOption[];
}
interface LessonDefinition {
  id: 'L01' | 'L02' | 'L03';
  title: string;
  learningPointId: string;
  sourceIds: string[];
  transferText: string;
  rounds: LessonRound[];
}
```

L01 ist Hinschauen, L02 Orientierung, L03 Unterstützung/Ruhe. Texte aus 03 übernehmen. Runde bleibt stabil bis Entscheidung; idle-Bewegung darf das Beobachtungsbild nicht unbemerkt verändern. Szenario-readiness darf die Lektion nicht sofort abschalten: Sie ist der Lerngegenstand. Echte niedrige Pflegewerte vor Besuch leiten dagegen zu Care. Bei echter Erschöpfung während der Sitzung: Pauseabschluss anbieten.

## Tickreihenfolge und Zeit

Eine aktive Minute: (1) Abnahme satiety/energy/comfort, Modus-Floor anwenden; (2) bei Challenge: wenn satiety oder energy =0, vitality −5; sonst bei beiden ≥35 vitality +2; sonst unverändert; (3) Werte 0–100 klemmen; (4) Statusverlust bei 0 und passende Route auslösen. Ein leerer Wert wird nicht doppelt bestraft. Im Standard vitality unverändert. Rundeneffekte energy −4 einmal pro abgeschlossener Runde, niemals pro Retry; im Standard Floor 25. Tatsächliche CARE_Rest/Mahlzeit gelten nach gemeinsamen Konstanten.

Aktive Zeit monoton messen (performance-basierte Uhr), Offlinezeit UTC; nie miteinander vermischen. Minute-Rest akkumulieren, nur vollständige Minuten auswerten. Hintergrund/Fokusverlust setzt aktive Referenz zurück, gespeicherter aktiver Rest bleibt erhalten. Browserrückkehr kein dt-Catch-up. In react eine gestartete atomare Wirkung abschließen, dann Verlustzustand/Unterstützung anzeigen; keine neue Trainingsaktion bei kritisch.

Offlineformel pro Bedürfnis: creditedHours = min(max(0, elapsedMs), 8h) / 1h. Verlust fraktional berechnen, intern als Zahl halten, Anzeige runden. after = max(min(before,25),before-loss). Bei before=10 bleibt 10, niemals automatische Heilung auf 25. Save lastSeenUTC und Offlinewirkung atomar schreiben. Bei aktiver Sitzung lastSeenUTC in jedem Domain-Commit und regelmäßigen Checkpoints aktualisieren; CLOSE_APP aktualisiert ebenfalls. Profil ist keine Abwesenheit: kontinuierlich sichtbare App erzeugt keinen Offlineverlust. Modewechsel beendet/öffnet die jeweiligen eigenen Zeitanker korrekt.

## Transaktionen und Wiederaufnahme

1. Aktion validieren: Phase, Modus, Kosten, Hundstatus, bekannte ID.
2. Bereits angewandt? Unverändert zurückgeben.
3. Wirkung einmal berechnen und mit transactionId atomar committen. Renderer zeigt danach die Animation.
4. Animation abgeschlossen? Nur Darstellungsstatus bestätigen, Domainwirkung nicht erneut ausführen.

Dies präzisiert „nach Abschluss der Animation“ aus 04: visuell erscheinen Werte am Ende; rechnerisch wird die Wirkung vorab dauerhaft reserviert/committet. UI hält eine presentationSnapshot, bis Effekt bestätigt ist. Reload stellt den bereits committeten Endzustand her, zeigt niemals eine zweite Gabe/Marke. Wenn eine Pflegeanimation nur 3 Sekunden läuft, darf dennoch beim Abbruch keine Wirkung verloren gehen. Animationsfehler/fehlender Clip verwendet zeitlich begrenzten Fallback und gibt UI wieder frei.

IndexedDB-Transaktion: Save + Ledger/Revision gemeinsam schreiben, Erfolg erst bei transaction complete melden. Keine langen awaits oder GLB-Ladevorgänge in offener Datenbanktransaktion. Importdaten streng validieren, Zahlenbereiche und Enumwerte prüfen, ungültige Daten nicht ausführen. Vor überschreibendem Import vorhandenen Save als Backup sichern.

## Standard/Challenge und Tod

Standard besitzt seine eigene Schule; Challenge einen eigenen Fortschritt. Kein Transfer von Challenge-Geld oder Wachstum. Challenge-Neustart setzt eigenes Tier und eigene Schule zurück, Standard bleibt unberührt. Verlorener Hund ist immutable bezüglich Pflege und Training. Archiv zeigt Erinnerungen, aber keine Wiederbelebung. Neue dogInstanceId bei neuem Lauf.

## Offene Balancepunkte

Werte aus 04 sind initiale Defaults. Änderungen erst nach dokumentiertem Spieltest; Produktregeln offline-sicher, kostenlos versorgbar, keine Reaktionsprüfung bleiben erhalten. Keine medizinischen oder realen Fütterungswerte aus dem Modell ableiten.
