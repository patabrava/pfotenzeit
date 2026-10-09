/**
 * Recovery screen for an unreadable / invalid save (boot step 4). Nothing is reset silently:
 * explain, offer the backup download, import of a file, or an explicit fresh start after confirmation.
 */
import './fonts.css';
import './styles.css';
import type { RecoveryFlow } from '../app/boot';
import { installFonts } from './fonts';
import { button, collapsible, confirmDialog, el, secondary, text } from './components';
import { t } from './strings';

export interface RecoveryHandle {
  destroy(): void;
}

const R = {
  title: 'Spielstand konnte nicht geladen werden',
  intro: 'Dein gespeicherter Stand wurde gesichert und nicht verändert. Du entscheidest, wie es weitergeht.',
  details: 'Technische Details',
  downloadBackup: 'Sicherung herunterladen',
  importFile: 'Spielstand aus Datei laden',
  startFresh: 'Neu beginnen',
  startFreshTitle: 'Neu beginnen?',
  startFreshText: 'Ein neuer Standard-Spielstand wird angelegt. Die Sicherung des alten Standes bleibt im Browser erhalten.',
  startFreshConfirm: 'Ja, neu beginnen',
  working: 'Einen Moment …',
};

export function mountRecovery(root: HTMLElement, flow: RecoveryFlow): RecoveryHandle {
  installFonts();
  const modalHost = el('div', { class: 'layer layer-modal' });
  const status = el('p', { class: 'text-secondary', attrs: { role: 'status', 'aria-live': 'polite' } });

  const errorList = el('div', {}, [
    flow.problem.errors.length
      ? el('ul', { class: 'list' }, flow.problem.errors.slice(0, 12).map((error) => el('li', { class: 'list-item text-secondary', text: error })))
      : secondary(flow.problem.kind),
  ]);

  const body = el('div', { class: 'screen-body' }, [
    el('h1', { id: 'recovery-title', class: 'card-title', text: R.title }),
    text(flow.problem.message, 'text-lead'),
    text(R.intro),
    collapsible(R.details, errorList, false, () => undefined, 'recovery-details'),
    status,
  ]);

  const footer = el('footer', { class: 'screen-footer' }, [
    flow.problem.backupKey
      ? button({ label: R.downloadBackup, variant: 'secondary', large: true, block: true, key: 'backup' }, async () => {
          status.textContent = R.working;
          try {
            await flow.downloadBackup();
            status.textContent = t.settings.exportDone;
          } catch (error) {
            console.error('[recovery] backup download failed', error);
            status.textContent = t.settings.exportFailed;
          }
        })
      : null,
    button({ label: R.importFile, variant: 'primary', large: true, block: true, key: 'import' }, async () => {
      status.textContent = R.working;
      const outcome = await flow.importFile();
      status.textContent = outcome.message;
    }),
    button({ label: R.startFresh, variant: 'ghost', block: true, key: 'fresh' }, async () => {
      const confirmed = await confirmDialog(modalHost, {
        title: R.startFreshTitle,
        text: R.startFreshText,
        confirmLabel: R.startFreshConfirm,
        confirmVariant: 'secondary',
      });
      if (!confirmed) return;
      status.textContent = R.working;
      await flow.startFresh();
    }),
    secondary(t.banner.storageHint),
  ]);

  const screen = el('section', { class: 'screen screen--centered', attrs: { role: 'alertdialog', 'aria-labelledby': 'recovery-title' } }, [body, footer]);
  const shell = el('div', { class: 'shell' }, [el('div', { class: 'layer layer-screen' }, [screen]), modalHost]);
  root.replaceChildren(shell);
  root.setAttribute('aria-busy', 'false');
  return {
    destroy() {
      shell.remove();
    },
  };
}
