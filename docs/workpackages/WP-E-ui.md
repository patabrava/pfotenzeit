# WP-E — DOM UI, input, audio (session: ines-24)

Read first: `/CLAUDE.md`, `docs/DECISIONS.md` (D-003, D-006, D-008), `docs/pfotenzeit/05_MOBILE_UX.md` (all), `02_SPIELSCHLEIFE.md`, `04_PFLEGE_CHALLENGE.md` (Folgen, Abschied, Pixelprofil), `06_ART_DIRECTION.md` (UI, Palette), `14_CLAUDE_EXECUTION.md` (A, B), `17_EXECUTION_CHECKLIST.md` (Browser-Smoke).

## Mission

Every screen the player touches, in German, one-handed, portrait-first, accessible, driven only by the store. The 3D scene is a container you hand to the renderer; the pixel profile is a canvas you hand to WP-B's `createPixelDog`.

## You own (write only here)

- `src/ui/index.ts` — `mountUi(store, deps): UiHandle`
- `src/ui/components.ts` — `el()`, `button()`, sheet, dialog, toast, progress bars (needs), tabs, collapsible, focus trap, aria-live region
- `src/ui/AppShell.ts` — 100dvh layout with safe-area insets, header, scene container, action dock (≤ 28 % height in training), route switching, modal layering, inert world behind modals
- `src/ui/HomeView.ts`, `LessonView.ts`, `ProfileView.ts`, `SchoolView.ts`, `SettingsView.ts`, `ReflectionView.ts`, `MemorialView.ts`, `ModeView.ts`, `OtherTabView.ts`, `WebglFallbackView.ts`, `InterruptionBanner.ts`
- `src/ui/styles.css` (replace the stub), `src/ui/fonts.css` (Atkinson Hyperlegible is downloaded by ines-c3 to `public/assets/fonts/`; use `@font-face` with `font-display: swap` and a system fallback stack)
- `src/ui/presenter.ts` — turns `save.pendingPresentation` into `renderer.present(...)` calls exactly once, then `ACKNOWLEDGE_EFFECT`; holds a `presentationSnapshot` so numbers animate to the committed end state after the animation; on reload with a pending presentation it re-presents (or snaps under reduced motion) and acknowledges
- `src/input/actions.ts` — pointer handling: Pointer Events, one action per gesture, `pointercancel` discards, no click-through after closing a sheet (ignore pointerup within 300 ms after a sheet closes), keyboard Tab/Enter/Escape
- `src/audio/AudioManager.ts` — tiny WebAudio synth cues (no files needed; optional small OGG/MP3 later): soft confirm for helpful decisions, soft chime for upgrade/mark, faint sniff/breath never as substitute for body language; unlock on first user gesture; global toggle; failures never block
- `public/assets/audio/README.md` (sources/licences if you add files)

Read-only: `src/state/store.ts`, `src/app/appState.ts`, `src/simulation/{types,selectors,defaults}.ts`, `src/content/**` (strings in `content/de.ts` from WP-B — until it lands, keep your own temporary strings in `src/ui/strings.tmp.ts` and switch when `de.ts` exists), `src/render/types.ts`, `src/ui/pixel/**` (WP-B).

## Deps object

```ts
interface UiDeps {
  getRenderer(): Promise<RendererHandle>;   // lazy; WP-C provides
  onExport(): Promise<void>; onImport(file: File): Promise<void>;   // WP-C provides
  appVersion: string;
}
```
Call `getRenderer()` after the home view is in the DOM; mount into the scene container; mirror `renderer.onStatus` into `store.patchApp({rendererStatus})`; `renderer.setActive(...)` true only on `home`/`lesson` when unpaused; `renderer.apply(getSceneDirective(save, content, {route}))` on every save/app change (it diffs).

## Screens (05)

- **HOME**: scene full-bleed; top-left visit hint ("Nala wartet auf dich" / readiness line); top-right profile button with Nala's pixel face (64 px canvas); bottom contextual primary action: "Zur Übung" (opens lesson picker: three lesson cards with title, subtitle, learned state and "Wiederholen"), or "Versorgen" when readiness needs care, or "Wachsen" when `isGrowthAvailable`. Secondary: "Schule" (bottom sheet), "Einstellungen" (gear). Challenge band banner (yellow/red with icon + text; red keeps "Versorgen" and "Pause" large). Toast/aria-live for marks.
- **LESSON**: header compact learning point + round counter ("Runde 2 von 3", inserted/supported replay labelled "Gestützte Wiederholung"); scene in the middle 55 %; dialog card between actions; `prepare`: Mira intro + "Los geht's" (NEXT_ROUND); `observe`: observation text + "Genauer ansehen" (opens hint = `observationDescription`, no domain effect) + "Weiter" (NEXT_ROUND → decide); `decide`: 2–3 option buttons (52–56 px), plus overflow menu "Heute beenden" (COMPLETE_VISIT careClosure when meaningful per D-006 else ABANDON confirm) and "Versorgen" (care sheet usable mid-lesson except during react); `react`: inputs locked, presenter runs; `feedback`: feedback text, optional Mira line and "Im Alltag", button "Weiter"; `reflect`: → navigate to REFLECTION.
- **REFLECTION**: one sentence success, one sentence learning point, collapsible "Im Alltag", buttons "Fertig für heute" (COMPLETE_VISIT → home) and "Zur Schule" (COMPLETE_VISIT → school sheet). Show reward summary from the effect once (marks, memory, learned). `practiceText` when not learned.
- **PROFILE**: full-screen, pixel dog top third (PixelDog canvas, integer scaled), name + life phase ("Ankommen"/"Wachsen"), three plain need displays (Hunger/Energie/Wohlgefühl as bars with text values hidden behind a "Details" toggle), tabs Pflege (care buttons: Futter, Ruhe, Ruhiges Spiel or Abstand geben per `getCareSuggestion`; challenge: vitality line in words), Erinnerungen (list from `save.memories` with content texts), Gelernt (three learning points, learned/practising, summary, everyday). Back restores the previous route. Care animation presented inline (pixel state `resting` while rest plays).
- **SCHOOL** sheet: marks count, two upgrade cards with cost/preview/"Ausbauen"; owned state; insufficient → disabled with explanation text (no-op is explained, button still focusable).
- **SETTINGS**: audio, reduce motion override, observation text, quality tier, dog rename (text input, mobile keyboard), Spielmodus → **MODE** screen (05 onboarding text verbatim + game-rule disclaimer; "Challenge starten" / "Entspannt spielen"; switching, pausing challenge, archiving), Export/Import, version, "Debug" (dev only).
- **MEMORIAL**: neutral text from 04 verbatim, memory list, buttons "Erinnerung ansehen", "Neuen Challenge-Lauf beginnen" (ARCHIVE_CHALLENGE then CREATE_SAVE challenge), "Zum Standardmodus".
- **OTHER TAB**, **WEBGL FALLBACK** (text lesson view: observation descriptions + options still work; profile fully usable), **INTERRUPTION** banner (returnSummary), **STORAGE ERROR** banner with export.

## Rules

- 48×48 min targets, 8 px gaps, 16 px body text, 14 px secondary; 200 % text zoom must not hide actions; long German labels wrap; dialogs scroll; safe areas respected; no fixed heights.
- Reduced motion (system or override) shortens UI transitions and tells the presenter to snap.
- Focus visible; Escape closes sheets; aria-live polite for state changes; colour never the only carrier (icons + text).
- World inputs blocked under modals (`inert`). Scrolling in profile/lesson text never reaches the canvas.
- No domain logic in views: readiness, locks, availability all via selectors; every state change via `store.act`.
- Route changes use `src/app/routes.ts` (WP-C); until it lands, `store.patchApp({route})`.

## Done means
`npm run typecheck`, `npm run build` clean; the full flow works against the store with WP-A's reducer (coordinate via ines-c3 if it is not there yet: develop against `createDemoSave` and a stub dispatch). Message ines-c3: screens done, a11y checks done (keyboard-only pass, 200 % zoom at 360 px), open integration points, commands run with results.
