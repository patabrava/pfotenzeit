/**
 * Pfotenzeit service worker (14 E). Built as a second Vite entry to `sw.js` (see WP-C proposal in
 * the integration notes; until vite.config.ts emits it, registration fails softly).
 *
 * Install: read `.vite/manifest.json` (emitted with build.manifest = true), derive the versioned
 * app-shell file list, and cache shell + core assets atomically (addAll). Small core assets listed
 * in `assets/manifest.json` (models, pixel sprites) are added best-effort. Docs images are never
 * cached. Activate: drop old shell caches. Fetch: navigations network-first with cached shell
 * fallback and a readable offline page; same-origin assets cache-first.
 *
 * Update strategy: the new worker waits until the page posts {type:'SKIP_WAITING'}.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

// Asset-only releases must change the worker bytes as well as the cache name.
declare const __PZ_ASSET_VERSION__: string;
const CACHE_PREFIX = `pfotenzeit-shell-${__PZ_ASSET_VERSION__}-`;
const CORE_ASSET_MAX_BYTES = 3 * 1024 * 1024;
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './apple-touch-icon.png', './offline.html',
  './assets/fonts/AtkinsonHyperlegible-Regular.woff2',
  './assets/fonts/AtkinsonHyperlegible-Bold.woff2',
  './assets/fonts/AtkinsonHyperlegible-Italic.woff2',
  './assets/fonts/AtkinsonHyperlegible-BoldItalic.woff2',
];

interface ViteManifestEntry {
  file: string;
  css?: string[];
  assets?: string[];
  isEntry?: boolean;
}

interface AssetManifestLike {
  assets?: Record<string, { url: string | null; status?: string; bytes?: number | null }>;
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function resolveShell(): Promise<{ cacheName: string; files: string[] }> {
  const files = new Set(SHELL_FILES);
  let version = 'dev';
  try {
    const response = await fetch('./.vite/manifest.json', { cache: 'no-store' });
    if (response.ok) {
      const text = await response.text();
      version = hash(text);
      const manifest = JSON.parse(text) as Record<string, ViteManifestEntry>;
      for (const entry of Object.values(manifest)) {
        if (entry.file) files.add(`./${entry.file}`);
        for (const css of entry.css ?? []) files.add(`./${css}`);
        for (const asset of entry.assets ?? []) files.add(`./${asset}`);
      }
    }
  } catch {
    // No build manifest: shell only.
  }
  return { cacheName: `${CACHE_PREFIX}${version}`, files: [...files] };
}

async function coreAssets(): Promise<string[]> {
  try {
    const response = await fetch('./assets/manifest.json', { cache: 'no-store' });
    if (!response.ok) return [];
    const manifest = (await response.json()) as AssetManifestLike;
    const urls: string[] = ['./assets/manifest.json'];
    for (const entry of Object.values(manifest.assets ?? {})) {
      if (!entry.url || entry.status === 'pending') continue;
      if (typeof entry.bytes === 'number' && entry.bytes > CORE_ASSET_MAX_BYTES) continue;
      if (/docs\//.test(entry.url)) continue;
      urls.push(entry.url.startsWith('.') || entry.url.startsWith('/') ? entry.url : `./${entry.url}`);
    }
    return urls;
  } catch {
    return [];
  }
}

let currentCacheName: string | null = null;

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const { cacheName, files } = await resolveShell();
      currentCacheName = cacheName;
      const cache = await caches.open(cacheName);
      // Atomic: if any shell file fails, install fails and the old version stays active.
      await cache.addAll(files);
      // Best effort for core assets.
      for (const url of await coreAssets()) {
        try {
          await cache.add(url);
        } catch {
          // optional asset; stays network-only
        }
      }
      // Do NOT skipWaiting here: the page decides (outside a lesson, after a commit).
    })(),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = currentCacheName ?? (await resolveShell()).cacheName;
      currentCacheName = keep;
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== keep).map((name) => caches.delete(name)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === 'SKIP_WAITING') void sw.skipWaiting();
});

async function shellCache(): Promise<Cache | null> {
  if (currentCacheName) return caches.open(currentCacheName);
  const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
  const latest = names[names.length - 1];
  if (!latest) return null;
  currentCacheName = latest;
  return caches.open(latest);
}

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          return network;
        } catch {
          const cache = await shellCache();
          const shell = (await cache?.match('./index.html')) ?? (await cache?.match('./'));
          if (shell) return shell;
          const offline = await cache?.match('./offline.html');
          return (
            offline ??
            new Response(
              '<!doctype html><html lang="de"><meta charset="utf-8"><title>Pfotenzeit</title><p>Pfotenzeit ist offline noch nicht verfügbar. Bitte einmal mit Internetverbindung öffnen.</p></html>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            )
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await shellCache();
      // The shell is public, same-origin, static content. Dev/preview servers
      // send Vary: Origin, while module requests carry an Origin header that
      // cache.add() did not send. That header must not hide a precached asset.
      const cached = await cache?.match(request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(request);
      // Runtime-cache same-origin app assets (hashed build output, models, pixel, audio); never docs.
      if (response.ok && cache && /\/assets\//.test(url.pathname) && !/\/docs\//.test(url.pathname)) {
        void cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
