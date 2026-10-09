/**
 * SETTINGS: audio, reduce motion override, observation text, quality tier, rename, Spielmodus → MODE,
 * export/import, version, Debug (dev only). Every change goes through UPDATE_SETTINGS / RENAME_DOG.
 */
import { DOG_NAME_MAX_LENGTH } from '../simulation/defaults';
import type { QualityTier, ReducedMotionOverride, Settings } from '../simulation/types';
import { button, el, secondary, segmented, switchControl, text } from './components';
import type { UiContext, View } from './context';
import { rejectionText } from './sheets';
import { t } from './strings';
import { createView } from './view';

export function createSettingsView(ctx: UiContext): View {
  const root = el('section', { class: 'screen screen--panel', attrs: { 'aria-labelledby': 'settings-title' }, dataset: { view: 'settings' } });
  const nameInput = el('input', {
    class: 'input',
    id: 'rename-input',
    attrs: { type: 'text', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'done', maxlength: DOG_NAME_MAX_LENGTH, 'aria-describedby': 'rename-hint' },
  });
  nameInput.dataset.key = 'rename-input';
  const fileInput = el('input', { class: 'sr-only', attrs: { type: 'file', accept: 'application/json,.json', 'aria-hidden': 'true', tabindex: -1 } });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    await ctx.importSave(file);
  });

  async function patchSettings(patch: Partial<Settings>): Promise<void> {
    const result = await ctx.store.act('UPDATE_SETTINGS', { patch });
    if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, ctx.store.get().save.dog.name));
  }

  async function rename(): Promise<void> {
    const name = nameInput.value.trim();
    if (name.length === 0 || name.length > DOG_NAME_MAX_LENGTH) {
      ctx.toast(t.settings.renameInvalid);
      nameInput.focus();
      return;
    }
    const result = await ctx.store.act('RENAME_DOG', { name });
    if (result.outcome === 'applied') ctx.toast(t.settings.renamed(name));
    else if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, name));
  }
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void rename();
    }
  });

  const view = createView({
    root,
    derive(snapshot) {
      const { save, app } = snapshot;
      return {
        settings: save.settings,
        name: save.dog.name,
        mode: save.mode,
        online: app.online,
        debugOpen: app.debugOpen,
        storageError: app.storageError,
      };
    },
    render(snapshot) {
      const { save, app } = snapshot;
      const settings = save.settings;
      if (document.activeElement !== nameInput) nameInput.value = save.dog.name;

      const header = el('header', { class: 'screen-header' }, [
        button({ label: t.app.back, icon: 'back', iconOnly: true, variant: 'ghost', key: 'back' }, () => ctx.goBack()),
        el('h1', { id: 'settings-title', text: t.settings.title }),
      ]);

      const audioRow = el('div', { class: 'setting' }, [
        el('span', { class: 'setting-label', id: 'setting-audio', text: t.settings.audio }),
        switchControl(t.settings.audio, settings.audioEnabled, (next) => patchSettings({ audioEnabled: next }), 'audio'),
        el('span', { class: 'setting-hint', text: t.settings.audioHint }),
      ]);

      const motionOptions: { value: ReducedMotionOverride; label: string }[] = [
        { value: 'system', label: t.settings.reducedMotionOptions.system },
        { value: 'on', label: t.settings.reducedMotionOptions.on },
        { value: 'off', label: t.settings.reducedMotionOptions.off },
      ];
      const motionRow = el('div', { class: 'setting setting--stack' }, [
        el('span', { class: 'setting-label', text: t.settings.reducedMotion }),
        segmented(t.settings.reducedMotion, motionOptions, settings.reducedMotionOverride, (value) => patchSettings({ reducedMotionOverride: value }), 'motion'),
        el('span', { class: 'setting-hint', text: t.settings.reducedMotionHint }),
      ]);

      const observationRow = el('div', { class: 'setting' }, [
        el('span', { class: 'setting-label', text: t.settings.observationText }),
        switchControl(t.settings.observationText, settings.observationTextEnabled, (next) => patchSettings({ observationTextEnabled: next }), 'observation'),
        el('span', { class: 'setting-hint', text: t.settings.observationTextHint }),
      ]);

      const qualityOptions: { value: QualityTier; label: string }[] = [
        { value: 'auto', label: t.settings.qualityOptions.auto },
        { value: 'low', label: t.settings.qualityOptions.low },
        { value: 'high', label: t.settings.qualityOptions.high },
      ];
      const qualityRow = el('div', { class: 'setting setting--stack' }, [
        el('span', { class: 'setting-label', text: t.settings.quality }),
        segmented(t.settings.quality, qualityOptions, settings.qualityTier, (value) => patchSettings({ qualityTier: value }), 'quality'),
        el('span', { class: 'setting-hint', text: t.settings.qualityHint }),
      ]);

      const renameRow = el('div', { class: 'setting setting--stack' }, [
        el('span', { class: 'setting-label', text: t.settings.rename }),
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [el('label', { attrs: { for: 'rename-input' }, text: t.settings.renameLabel }), nameInput]),
          button({ label: t.settings.renameSave, variant: 'secondary', key: 'rename-save' }, rename),
        ]),
        el('span', { class: 'setting-hint', id: 'rename-hint', text: t.settings.renameHint }),
      ]);

      const modeRow = el('div', { class: 'setting' }, [
        el('span', { class: 'setting-label', text: t.settings.mode }),
        button({ label: t.settings.modeCurrent(save.mode), variant: 'secondary', icon: 'chevron', key: 'mode' }, () => ctx.navigate('mode')),
        el('span', { class: 'setting-hint', text: t.settings.modeHint }),
      ]);

      const dataRow = el('div', { class: 'setting setting--stack' }, [
        el('span', { class: 'setting-label', text: t.settings.data }),
        el('div', { class: 'dock-row dock-row--two' }, [
          button({ label: t.settings.export, variant: 'secondary', key: 'export' }, () => ctx.exportSave()),
          button({ label: t.settings.import, variant: 'secondary', key: 'import' }, () => (ctx.hasImportPicker() ? ctx.importSave() : fileInput.click())),
        ]),
        fileInput,
        el('span', { class: 'setting-hint', text: t.settings.importHint }),
        app.storageError ? el('span', { class: 'setting-hint', text: t.banner.storageHint }) : null,
      ]);

      const about = el('div', { class: 'setting setting--stack' }, [
        el('span', { class: 'setting-label', text: t.settings.about }),
        text(t.settings.aboutText),
        secondary(t.settings.version(ctx.appVersion)),
        !app.online ? secondary(t.banner.offline) : null,
      ]);

      const debugRow = import.meta.env.DEV
        ? el('div', { class: 'setting' }, [
            el('span', { class: 'setting-label', text: t.settings.debug }),
            switchControl(t.settings.debug, app.debugOpen, (next) => ctx.store.patchApp({ debugOpen: next }), 'debug'),
          ])
        : null;

      const body = el('div', { class: 'screen-body', dataset: { scrollKey: 'settings-body' } }, [
        audioRow,
        motionRow,
        observationRow,
        qualityRow,
        renameRow,
        modeRow,
        dataRow,
        about,
        debugRow,
      ]);
      return [header, body];
    },
  });
  return view;
}
