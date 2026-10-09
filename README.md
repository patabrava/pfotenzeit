# Pfotenzeit — implementation

Mobile-first dog-school prototype (German game text). Plain Three.js + TypeScript + Vite, DOM UI, IndexedDB saves, no backend.
Design package: `docs/pfotenzeit/` (start at `00_START_HERE_CLAUDE.md`). Decisions: `docs/DECISIONS.md`. Progress and evidence: `PROGRESS.md`. Asset provenance: `docs/ASSET_REPORT.md`.

## Run

Requires Node ≥ 22.12 (developed with Node 26, npm 11). Google Chrome is used for the browser smoke.

```sh
npm ci
npm run dev            # http://localhost:5173, also reachable on the LAN (printed address) for phone tests
npm run typecheck      # tsc --noEmit
npm test               # Vitest: rule, content, storage and integration tests (single run)
npm run build          # typecheck + production build (dist/, includes sw.js)
npm run preview        # serve dist/ on :4173
npm run test:e2e       # Playwright smoke against the preview build (installed Chrome)
npm run assets:build   # regenerate the code-authored GLBs + public/assets/manifest.json
npm run assets:check   # re-validate GLBs against the manifest (gltf-validator, rig, clips, bounds)
npm run pixel:export   # export pixel sprites to public/assets/pixel/
```

Dev-only helpers: the debug panel (button bottom-left or Ctrl+Shift+D in `npm run dev`) sets clock, needs, mode, lessons and renderer state; `src/render/dev/scene.html` cycles poses; `src/ui/dev/harness.html` shows UI states.

## Structure

See `CLAUDE.md` for module boundaries. `src/simulation` (pure rules, no DOM/Three), `src/content` (German data), `src/state` (store), `src/storage` (IndexedDB, export/import, tab ownership), `src/render` (Three.js, procedural actors + GLB path), `src/ui` (DOM views, pixel profile, presenter), `src/app` (boot, lifecycle clock, routes, service worker), `scripts/` (asset pipeline), `tests/` (vitest + playwright).

## Saves and modes

One IndexedDB database `pfotenzeit`. Standard and challenge are separate saves; a challenge loss is archived and never touches the standard save. Export/import via Settings → Daten. Standard mode has no offline penalties; the challenge offline formula credits at most 8 hours and never kills.

## Status (honest)

Functional MVP: three lessons, care, pixel profile, memories, two upgrades, growth, challenge mode, persistence, interruption handling. Characters are **code-authored** rigged GLBs (not final art) with procedural fallback. Lesson texts are provisional pending the book review. See `PROGRESS.md` for what was verified and what was not.

## Notes for the Claude sandbox

Inside the Claude Code sandbox used for development, `~/.npm` is not writable (`export npm_config_cache="$TMPDIR/npm-cache"`), any path containing `token` is unreadable (`HOME="$TMPDIR/vhome" PFZ_NO_DOM=1 npm test`), and browsers cannot start. None of this applies to a normal shell.
