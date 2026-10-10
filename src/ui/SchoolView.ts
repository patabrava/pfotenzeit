/**
 * School bottom sheet (05 SCHOOL): marks count, two upgrade cards with cost/preview/"Ausbauen".
 * Insufficient marks → explained no-op (button stays focusable, aria-disabled, explanation text).
 * No purchase animation over the dog.
 */
import type { UpgradeId } from '../simulation/types';
import type { StoreSnapshot } from '../state/store';
import { button, createSheet, el, markCounter, replaceChildren, secondary, setMarkCounter, text, type ModalHandle } from './components';
import type { UiContext } from './context';
import { t } from './strings';

export function openSchoolSheet(ctx: UiContext, onClose: () => void): ModalHandle {
  const body = el('div', { class: 'stack' });
  const marksNode = markCounter(ctx.presenter.getDisplayMarks(ctx.store.get().save), t.school.marksLabel);
  const sheet = createSheet(ctx.modalHost, { title: t.school.title, onClose }, [body]);

  const render = (snapshot: StoreSnapshot): void => {
    const { save } = snapshot;
    const marks = ctx.presenter.getDisplayMarks(save);
    setMarkCounter(marksNode, marks, t.school.marksLabel);
    const header = el('div', { class: 'row row--between' }, [marksNode, el('span', { class: 'text-secondary', text: t.school.marks(marks) })]);
    const cards = (Object.keys(ctx.content.upgrades) as UpgradeId[]).map((id) => {
      const upgrade = ctx.content.upgrades[id];
      const owned = save.school.upgrades.includes(id);
      const missing = Math.max(0, upgrade.cost - save.school.marks);
      const affordable = missing === 0 && !owned;
      const explanation = owned ? null : missing > 0 ? secondary(t.school.missing(missing)) : null;
      const action = owned
        ? el('span', { class: 'badge badge--ok', text: t.school.owned })
        : button(
            {
              label: t.school.build,
              sub: t.school.cost(upgrade.cost),
              variant: 'primary',
              block: true,
              key: `upgrade-${id}`,
              ariaDisabled: !affordable,
              options: { onBlocked: () => ctx.toast(t.school.missing(missing)) },
            },
            async () => {
              const result = await ctx.store.act('BUY_UPGRADE', { upgradeId: id });
              if (result.outcome === 'applied') {
                ctx.announce(t.school.bought(upgrade.label));
              } else if (result.outcome === 'rejected' && result.reason === 'insufficient_marks') {
                ctx.toast(t.school.missing(Math.max(1, upgrade.cost - save.school.marks)));
              } else if (result.outcome === 'rejected') {
                ctx.toast(t.toasts.actionRejected);
              }
            },
          );
      return el('article', { class: `upgrade-card${owned ? ' is-owned' : ''}`, attrs: { 'aria-labelledby': `upgrade-title-${id}` } }, [
        el('h3', { id: `upgrade-title-${id}`, text: upgrade.label }),
        text(upgrade.description),
        el('div', { class: 'upgrade-preview' }, [el('strong', { text: `${t.school.preview}: ` }), upgrade.preview]),
        explanation,
        action,
      ]);
    });
    replaceChildren(body, [header, ...cards, secondary(t.school.note)]);
  };

  render(ctx.store.get());
  const unsubscribe = ctx.store.subscribe((snapshot, change) => {
    if (!sheet.isOpen()) return;
    if (change === 'save' || change === 'app') render(snapshot);
  });
  const unsubscribePresenter = ctx.presenter.onChange(() => {
    if (sheet.isOpen()) render(ctx.store.get());
  });
  const originalClose = sheet.close;
  sheet.close = () => {
    unsubscribe();
    unsubscribePresenter();
    originalClose();
  };
  return sheet;
}
