/**
 * MODE (04/05): onboarding text verbatim + game-rule disclaimer; "Challenge starten" / "Entspannt spielen";
 * switching, pausing and archiving the challenge. Meta actions go through store.dispatchMeta (D-012).
 */
import { button, confirmDialog, el, secondary, text } from './components';
import type { UiContext, View } from './context';
import { rejectionText } from './sheets';
import { t } from './strings';
import { createView } from './view';

export function createModeView(ctx: UiContext): View {
  const root = el('section', { class: 'screen screen--panel', attrs: { 'aria-labelledby': 'mode-title' }, dataset: { view: 'mode' } });

  const view = createView({
    root,
    derive(snapshot) {
      const { save, meta } = snapshot;
      return {
        activeMode: meta.activeMode,
        hasChallenge: meta.saveIds.challenge !== null,
        paused: save.challengePaused,
        lost: save.dog.status === 'lost',
        archives: meta.archives.map((archive) => archive.saveId),
        visit: save.currentVisit !== null,
      };
    },
    render(snapshot) {
      const { save, meta } = snapshot;
      const now = (): number => ctx.store.providers.nowUTC();
      const header = el('header', { class: 'screen-header' }, [
        button({ label: t.app.back, icon: 'back', iconOnly: true, variant: 'ghost', key: 'back' }, () => ctx.goBack()),
        el('h1', { id: 'mode-title', text: t.mode.title }),
      ]);

      const actions: HTMLElement[] = [];
      if (meta.activeMode === 'standard') {
        actions.push(
          button(
            { label: meta.saveIds.challenge ? t.mode.switchToChallenge : t.mode.startChallenge, variant: 'primary', large: true, block: true, key: 'to-challenge' },
            async () => {
              await ctx.store.dispatchMeta({ type: 'SELECT_MODE', mode: 'challenge', nowUTC: now() });
              ctx.toast(t.toasts.modeSwitched('challenge'));
              ctx.navigate('home');
            },
          ),
          button({ label: t.mode.playRelaxed, variant: 'secondary', large: true, block: true, key: 'relaxed' }, () => ctx.goBack()),
        );
      } else {
        actions.push(
          button({ label: t.mode.toStandard, variant: 'primary', large: true, block: true, key: 'to-standard' }, async () => {
            await ctx.store.dispatchMeta({ type: 'SELECT_MODE', mode: 'standard', nowUTC: now() });
            ctx.toast(t.toasts.modeSwitched('standard'));
            ctx.navigate('home');
          }),
        );
        if (save.dog.status !== 'lost') {
          actions.push(
            button(
              { label: save.challengePaused ? t.mode.resumeChallenge : t.mode.pauseChallenge, variant: 'secondary', large: true, block: true, icon: save.challengePaused ? 'play' : 'pause', key: 'pause' },
              async () => {
                const result = await ctx.store.act(save.challengePaused ? 'RESUME_CHALLENGE' : 'PAUSE_CHALLENGE', {});
                if (result.outcome === 'applied') ctx.toast(save.challengePaused ? t.toasts.resumed : t.toasts.paused);
                else if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, save.dog.name));
              },
            ),
          );
        }
        actions.push(
          button({ label: t.mode.archive, variant: 'ghost', block: true, key: 'archive' }, async () => {
            const confirmed = await confirmDialog(ctx.modalHost, {
              title: t.mode.archiveTitle,
              text: t.mode.archiveText,
              confirmLabel: t.mode.archiveConfirm,
              confirmVariant: 'secondary',
            });
            if (!confirmed) return;
            await ctx.store.dispatchMeta({ type: 'ARCHIVE_CHALLENGE', nowUTC: now() });
            ctx.toast(t.toasts.modeSwitched('standard'));
            ctx.navigate('home');
          }),
        );
      }

      const archives = meta.archives.length
        ? el('div', { class: 'stack stack--tight' }, [
            el('h2', { class: 'card-title', text: t.mode.archives }),
            el(
              'ul',
              { class: 'list' },
              [...meta.archives].reverse().map((archive) =>
                el('li', { class: 'list-item' }, [
                  el('h3', { text: t.mode.archiveEntry(archive.dogName, archive.visitCount) }),
                  secondary(`${t.dates.short(archive.createdUTC)} – ${t.dates.short(archive.endedUTC)}`),
                ]),
              ),
            ),
          ])
        : null;

      const body = el('div', { class: 'screen-body', dataset: { scrollKey: 'mode-body' } }, [
        text(t.mode.current(meta.activeMode), 'text-lead'),
        el('div', { class: 'card card--plain stack stack--tight' }, [
          el('h2', { class: 'card-title', text: t.settings.modeCurrent('standard') }),
          text(t.mode.standardText),
        ]),
        el('div', { class: 'card card--plain stack stack--tight' }, [
          el('h2', { class: 'card-title', text: t.settings.modeCurrent('challenge') }),
          text(t.mode.onboarding),
          secondary(t.mode.disclaimer),
          secondary(t.mode.offlineSafe),
          save.mode === 'challenge' && save.challengePaused ? el('span', { class: 'badge badge--warn', text: t.mode.pausedNote }) : null,
        ]),
        secondary(t.mode.separateSaves),
        archives,
      ]);
      const footer = el('footer', { class: 'screen-footer' }, actions);
      return [header, body, footer];
    },
  });
  return view;
}
