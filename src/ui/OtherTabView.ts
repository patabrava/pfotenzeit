/**
 * Shown when another tab owns the simulation clock (09 Speichern und Zeit). No clock, no writes here.
 */
import { button, el, secondary, text } from './components';
import type { UiContext, View } from './context';
import { t } from './strings';
import { createView } from './view';

export function createOtherTabView(ctx: UiContext): View {
  const root = el('section', { class: 'screen screen--centered', attrs: { role: 'alert', 'aria-labelledby': 'other-tab-title' }, dataset: { view: 'otherTab' } });
  return createView({
    root,
    derive: (snapshot) => snapshot.app.ownership,
    render() {
      return [
        el('div', { class: 'screen-body' }, [
          el('h1', { id: 'other-tab-title', class: 'card-title', text: t.otherTab.title }),
          text(t.otherTab.text, 'text-lead'),
          button({ label: t.otherTab.retry, variant: 'secondary', large: true, key: 'retry' }, () => {
            void ctx;
            window.location.reload();
          }),
          secondary(t.settings.version(ctx.appVersion)),
        ]),
      ];
    },
  });
}
