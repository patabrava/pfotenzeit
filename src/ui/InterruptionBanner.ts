/**
 * Banner layer: return summary after an interruption (05 Unterbrechungen), storage error with export,
 * context-lost note. Toasts are rendered by the shell next to this.
 */
import { banner, button, el } from './components';
import type { UiContext, View } from './context';
import { t } from './strings';
import { createView } from './view';

const RETURN_SUMMARY_MS = 10_000;

export function createInterruptionBanner(ctx: UiContext): View {
  const root = el('div', { class: 'stack stack--tight', dataset: { view: 'banners' } });
  root.style.width = '100%';
  root.style.alignItems = 'center';
  let dismissTimer: number | null = null;

  const view = createView({
    root,
    derive(snapshot) {
      const { app } = snapshot;
      return {
        summary: app.returnSummary,
        storage: app.storageError,
        renderer: app.rendererStatus,
        ownership: app.ownership,
        update: app.pauseReasons.includes('update'),
        route: app.route,
      };
    },
    render(snapshot) {
      const { app } = snapshot;
      const items: HTMLElement[] = [];
      if (app.storageError) {
        items.push(
          banner('crit', t.banner.storageTitle, `${t.banner.storageHint}`, [
            button({ label: t.banner.storageExport, variant: 'secondary', key: 'storage-export' }, () => ctx.exportSave()),
          ]),
        );
      }
      if (app.returnSummary && app.ownership !== 'other') {
        items.push(
          banner('info', t.banner.interruptionTitle, app.returnSummary, [
            button({ label: t.banner.interruptionDismiss, variant: 'ghost', key: 'summary-dismiss' }, () => ctx.store.patchApp({ returnSummary: null })),
          ]),
        );
        if (dismissTimer !== null) window.clearTimeout(dismissTimer);
        dismissTimer = window.setTimeout(() => {
          dismissTimer = null;
          if (ctx.store.get().app.returnSummary === app.returnSummary) ctx.store.patchApp({ returnSummary: null });
        }, RETURN_SUMMARY_MS);
      }
      if (app.rendererStatus === 'contextLost' && (app.route === 'home' || app.route === 'lesson')) {
        items.push(banner('warn', null, t.webgl.contextLost));
      }
      if (app.pauseReasons.includes('update') && app.route !== 'lesson' && ctx.deps.applyUpdate) {
        items.push(
          banner('info', null, t.banner.updateAvailable, [
            button({ label: t.banner.updateApply, variant: 'secondary', key: 'update-apply' }, () => ctx.deps.applyUpdate?.()),
          ]),
        );
      }
      return items;
    },
    destroy() {
      if (dismissTimer !== null) window.clearTimeout(dismissTimer);
    },
  });
  return view;
}
