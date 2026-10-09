/**
 * Entry point. Keeps no rules: boots the app shell (WP-C) which wires storage, store, ui and renderer.
 */
import './ui/styles.css';
import { boot } from './app/boot';

boot().catch((error: unknown) => {
  console.error('[pfotenzeit] boot failed', error);
  const root = document.getElementById('app');
  if (root) {
    root.setAttribute('aria-busy', 'false');
    root.innerHTML =
      '<main class="boot-error" role="alert"><h1>Pfotenzeit</h1><p>Das Spiel konnte nicht gestartet werden. Bitte Seite neu laden.</p></main>';
  }
});
