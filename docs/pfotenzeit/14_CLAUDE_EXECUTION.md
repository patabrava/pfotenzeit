# Claude-Ausführung: Three.js und konkrete Arbeitspakete

## Arbeitsumgebung

Repository prüfen, vorhandene Anweisungen lesen und Änderungen erhalten. Bei leerem Repository Vite-Template vanilla-ts verwenden. Node-/Paketmanager-Anforderungen aus aktueller Vite-Dokumentation prüfen, kein ungeprüftes Versionspinning. Runtime-Abhängigkeit: three; kleine IndexedDB-Hilfe optional. Dev: typescript, vite, @types/three soweit für gewählte Version erforderlich, vitest, optional Playwright. Keine kostenpflichtigen Generatoren automatisch buchen.

Orientierung: [Vite-Einstieg](https://vite.dev/guide/), [Three.js-Dokumentation](https://threejs.org/docs/), [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB). Geprüft am 09.10.2026; konkrete APIs gegen installierte Version prüfen. Das ist eine eigene Projektarchitektur, kein aus diesen Quellen kopierter Starter.

## Sollstruktur im Implementierungsrepository

```text
index.html
package.json / package-lock.json
tsconfig.json / vite.config.ts
src/
  main.ts
  app/boot.ts, lifecycle.ts, routes.ts
  simulation/types.ts, reducer.ts, careClock.ts, lessons.ts, progression.ts
  simulation/transactions.ts, selectors.ts, defaults.ts
  content/lessons.ts, characters.ts, upgrades.ts, de.ts
  state/store.ts
  storage/database.ts, migrations.ts, importExport.ts, tabOwnership.ts
  render/app/GameRenderer.ts, CameraRig.ts, resize.ts
  render/loaders/AssetManager.ts
  render/objects/DogActor.ts, HumanActor.ts, SchoolScene.ts
  render/materials/palette.ts
  ui/HomeView.ts, LessonView.ts, ProfileView.ts, SchoolView.ts
  ui/SettingsView.ts, ReflectionView.ts, components.ts, styles.css
  input/actions.ts
  audio/AudioManager.ts
  diagnostics/debug.ts, metrics.ts
public/
  assets/models/ / assets/pixel/ / assets/audio/
  assets/manifest.json
  manifest.webmanifest
scripts/validate-assets.mjs
tests/
docs/pfotenzeit/ (Designpaket)
PROGRESS.md
README.md (Implementierung, nicht Designindex)
```

## A — Startbare Grundstruktur

Erzeuge App-Shell mit 100dvh, Safe Areas, Start/Profil/Einstellungen. Initialisierung: Speicher öffnen → Schreibrolle erwerben → Save laden/validieren → einmal Offlineabgleich → UI mounten → Three-Szene lazy-loaden. Neues Standardspiel nur wenn noch keines existiert. Keine Spielsimulation vor Eigentümerschaft des Tabs. Ergebnis: npm run dev startet ohne Konsolenfehler, Profil läuft auch ohne GPU.

## B — Erste vollständige Sitzung

Implementiere L01 mit drei Runden, einer Pflegeaktion, Reflexion und idempotenter Besuchsbelohnung. Temporäre Hunde aus zusammenhängenden Three-Objekten mit vier Pfoten, Kopf, Ohren und Schwanz; erkennbare Nala/Bruno-Farben. Standposen und einfache Gelenkdrehungen statt beliebiger Kugel. L01 muss im Portrait bedienbar sein. Noch keine zweite Lektion bauen, bevor die erste einmal vollständig durchlaufen und neu geladen werden kann.

## C — Rendereradapter

GameRenderer besitzt WebGLRenderer, Scene, vorbereitete OrthographicCamera, Licht, AssetManager und Animationsmixer. Eine invalidate()-Funktion plant höchstens einen requestAnimationFrame. Solange sichtbare Animationen laufen, nächsten Frame anfordern. Bei Profil, Hintergrund und Pause kein dauerhafter Renderloop. visuelle dt begrenzen, z. B. 0,1 s; die Pflegezeit davon unabhängig aus tatsächlicher aktiver Zeit akkumulieren. Tab-/Fokuswechsel setzt den Zeitanker zurück, damit Rückkehr keinen großen aktiven Tick erzeugt.

ResizeObserver beobachtet Szenecontainer. CSS-Größe, aspect/frustum und Zeichenpuffer synchronisieren. DPR-Ziel 1–1,5 auf Low-Tier; niemals volle Gerätepixeldichte ungeprüft übernehmen. Framing Hund plus Pfoten/Schwanz auf allen Zielgrößen. Keine OrbitControls im MVP. CameraRig hat nur school/lesson/closeup und reduziert Bewegungen bei Nutzerpräferenz.

GLTFLoader und optionale Decoder nur aus kompatiblem Three-Paket. Bei rigged Instanzen SkeletonUtils-kompatibles Klonen verwenden; Skeleton/AnimationMixer nicht zwischen unabhängigen Hunden teilen. Fehlende Clips lösen definierte Pose/Fallback aus, keine blockierte Transaktion. Material/Geometrie/Texture-Lebensdauer per AssetManager verwalten, gemeinsam genutzte Ressourcen erst nach letzter Nutzung freigeben. Context-loss: Simulation pausieren, DOM bleibt bedienbar, Wiederherstellen oder Lernansicht anbieten.

Farbraum und Tone-Mapping nach installierter Three-Version festlegen; Farbtexturen entsprechend markieren, Datenmaps nicht als Farben behandeln. Licht erst korrekt einstellen, dann Artfeinschliff. Keine verpflichtenden Shader oder Postprocessing.

## D — Vollständiger MVP

L02/L03, Bindung, Ausbauten, Wachstum und isolierte Challenge integrieren. Danach GLBs ersetzen, ohne Simulationsregeln zu verändern. Debugkontrollen dürfen Uhr, Zustand, Lektionen und Tierstatus setzen, aber nur in Dev/Test; nicht als normale Spielerbuttons.

## E — Offline und Abschluss

Service Worker erst nachdem Builds und Assetmanifest stabil sind. App-Shell + kleine Kernassets versioniert cachen; keine großen Referenzbilder. Update nicht mitten in einer Lektion aktivieren; erst Save sichern, dann Wechsel anbieten. Erster Offlinebesuch ohne Cache erhält verständlichen Hinweis. Bei Mobiltelefonprüfung lokale Netzwerkadresse dokumentieren; Service Worker/Installation benötigen eine geeignete sichere Umgebung, ihre Funktion nicht aus einem einfachen LAN-Test ableiten.

## Qualitätstore

A: Shell und Speicher. B: eine komplette spielbare Sitzung. C: Portrait, Unterbrechung und Renderer ohne Dauerlast. D: sämtliche Produktregeln. E: GLB-Integration, Performance und QA. Bei fehlenden fertigen Modellen kann D als funktionaler MVP bestehen, aber Art-Abnahme bleibt offen. Keine monolithische main.ts mit sämtlichen Regeln.
