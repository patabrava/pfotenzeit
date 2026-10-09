# Technik und Datenarchitektur

## Vorgeschlagener Stack

Plain Three.js + TypeScript + Vite als verbindlicher Ausführungsstandard für diese Übergabe. GLTFLoader aus der zur installierten Three-Version gehörenden Addon-Bibliothek. HTML/CSS/DOM für gesamte UI, kleiner typisierter Store mit reducer + subscriptions. Keine React-/R3F-/Drei-Abhängigkeit im MVP. Vitest für reine Regeln; Browser- und Gerätetests für Integration. Keine Rapier-Physik, keine verpflichtenden Postprocessing-Pakete, kein Backend im MVP.

Dies ist eine Architekturentscheidung, keine geprüfte aktuelle Versionsmatrix. Ausführendes LLM muss kompatible stabile Versionen zum Implementierungszeitpunkt anhand offizieller Dokumentation wählen und im Lockfile fixieren. Keine ungeprüften Versionsnummern aus diesem Plan übernehmen.

Warum plain Three.js: Der ausführende Agent soll direkt Szene, Kamera und Animationen kontrollieren. DOM-Profil und Menüs abonnieren denselben serialisierbaren Zustand. Das Regelmodell bleibt vollständig außerhalb von Three-Objekten. Diese Entscheidung ersetzt den früheren R3F-Vorschlag. Siehe 14_CLAUDE_EXECUTION.md für genaue Modulgrenzen und Arbeitsaufträge.

## Grenzen

simulation/: rules, careClock, lessonMachine, progression, rewards, transactions. Keine DOM- oder Three-Imports.

content/: Deutsche Lektionen, Figurenprofile und SourceIds als typisierte Daten.

render3d/: Kamera, AnimationMixer, GLB-Instanzen, Licht, SceneEvents. Animationsende ist Darstellung eines bereits reservierten Ereignisses, kein eigener Regelzustand.

ui/: HUD, Pixelprofil, Einstellungen, Erklärungen. Führt typed actions aus.

storage/: IndexedDB, Versionierung, Migration, atomare Speichervorgänge, Export/Import.

input/: Touch/Maus/Keyboard → domain action. Keine direkten Mutationen im onPointerDown.

## Datenvertrag

Die folgende Skizze beschreibt den Kern, nicht alle Aktionen. Der vollständige Implementierungsvertrag und Ergänzungen stehen in 15_DATEN_REGELN.md.

```ts
type Mode = 'standard' | 'challenge';
type Action =
  | { type: 'CARE'; kind: 'meal' | 'rest' | 'play'; transactionId: string }
  | { type: 'LESSON_DECISION'; optionId: string; transactionId: string }
  | { type: 'BUY_UPGRADE'; upgradeId: string; transactionId: string }
  | { type: 'PAUSE' };
interface DogState {
  instanceId: string;
  characterId: 'dog_nala';
  name: string;
  growthStage: 'arriving' | 'growing' | 'adult';
  satiety: number; energy: number; comfort: number;
  arousal: number; stress: number; vitality: number;
  status: 'alive' | 'lost';
  bondMemories: string[];
  learnedPoints: string[];
}
interface Save {
  schemaVersion: number;
  revision: number;
  mode: Mode;
  dog: DogState;
  school: { marks: number; upgrades: string[] };
  currentVisit: { id: string; lessonId: string; round: number; phase: string; seed: number } | null;
  rewardedVisitIds: string[];
  rewardedLearningIds: string[];
  appliedTransactionIds: string[];
  challengePaused: boolean;
  lastSeenUTC: number;
  careActiveMsRemainder: number;
  completedLessonIds: string[];
  helpfulVisitIds: string[];
  careClosureVisitIds: string[];
  activeTransaction: { id: string; action: Action; committed: boolean } | null;
}
```

Adult existiert im Schema für spätere Migration, wird im MVP nicht freigeschaltet. bounded transaction history oder kompakte Visit-Ledger vor längerer Nutzung vorsehen.

lesson data enthält id, sourceIds, learningPointIds, variants, observations, options, effects, feedback, transferText, readinessConstraints. Effekte sind geprüfte Daten, kein dynamisch ausgewerteter Code. Seed bei Besuchserstellung speichern, damit Reload keine leichtere Variante erschleicht.

## Speichern und Zeit

Alle Pflege-, Kauf- und Belohnungstransaktionen atomar in IndexedDB. Bei visibilitychange save + Pause; lastSeenUTC nur entsprechend Pflegevertrag verändern. Browserabsturz: letzter vollständiger Commit, kein halber Kauf. transactionId idempotent; unterbrochene Darstellung darf Wirkung nicht verdoppeln.

Ein aktiver Tab besitzt die Schreibrolle via Web Locks, bei fehlender Unterstützung koordinierter BroadcastChannel + Lease. Zweiter Tab zeigt „Spiel ist in einem anderen Tab geöffnet“ und pausiert. Save revision verhindert überschreibende ältere Zustände. Bei Speicherfehler Spiel pausieren, verständlich informieren und Export anbieten; nicht still Fortschritt verwerfen.

Offline nutzbare App nach erstem erfolgreichen Download: Service Worker als später MVP-Abschluss, versionierte Assets atomar cachen. Kein Zwang zur Installation. iOS/Android Browserbetrieb zuerst; Add-to-home-screen ergänzend. PWA ist keine native App und kein zugesicherter App-Store-Build.

## Rendering und Laden

Scene lazy-load nach App-Shell; Fortschritt und Fehlerzustand. Profil nutzt kleine Pixelassets, keine zweite 3D-Szene. Demand rendering bei Pause, Profil und Hintergrund; Animationen aktivieren frames gezielt. GPU-Ressourcen bei Szenenwechsel entsorgen, GLBs cachen, Texturebudgets beachten.

Ziele: ≥30 FPS auf einem dokumentierten Mittelklasse-Testtelefon; ≤100 draw calls in typischer Trainingsszene; Peak GPU-Texturen Ziel ≤64 MB. Initiale Darstellung Shell <2 s, spielbar Ziel <8 s bei definiertem 10 Mbit/s Testnetz inklusive Decoder. Ergebnisse messen, nicht behaupten. Low-Tier Fallback ohne Schatten; bei WebGL-Ausfall textbasierte Lern-/Profilansicht statt leerem Canvas.

## Audio und Datenschutz

Audio erst nach erster Nutzeraktion, kurze kleine SFX, global abschaltbar. Keine Mikrofon-/Kamera-/Standortrechte. Keine externen Analytikdienste im Prototyp. Testmessungen lokal oder anonym auf ausdrücklichen Studienauftrag. Spielstand lebt auf Gerät; Löschung des Browsers löscht ihn, deshalb Export/Import anbieten.
