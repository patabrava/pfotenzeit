/**
 * Yard helpers (D-041, WP-R): is the walkable yard active, what does a zone prompt do, the "Hof" zone
 * sheet for the fallback (walk = teleport), Mira's choice sheet and the Alex/Bruno info sheet.
 * All mutations go through store.act; world inputs go through ctx.world.send.
 */
import type { CareKind } from '../simulation/types';
import type { StoreSnapshot } from '../state/store';
import type { ZoneId } from '../world/types';
import { button, createSheet, el, secondary, text } from './components';
import type { UiContext } from './context';
import { rejectionText } from './sheets';
import { t, tPractice, tWorld } from './strings';

/** Stress from which "Abstand geben" / petting as calm care is offered (plan §4). */
export const CALM_STRESS_MIN = 35;

/** The 3D yard is walkable: world present, yard mode, renderer ready, on home/practice. */
export function isYardActive(snapshot: StoreSnapshot, ctx: UiContext): boolean {
  const { app } = snapshot;
  return (
    ctx.world !== null &&
    ctx.world.isAvailable() &&
    app.yardMode === 'yard' &&
    app.rendererStatus === 'ready' &&
    !app.reducedMotion &&
    (app.route === 'home' || app.route === 'practice' || app.route === 'lesson')
  );
}

/** The yard exists but is used through text + buttons (reduced motion, WebGL fallback, static choice). */
export function isYardFallback(snapshot: StoreSnapshot, ctx: UiContext): boolean {
  return ctx.world !== null && !isYardActive(snapshot, ctx);
}

export function practiceUnlocked(snapshot: StoreSnapshot): boolean {
  return snapshot.save.completedLessonIds.length > 0;
}

/** Care kind behind a zone prompt, or null for zones with their own sheet / no action. */
export function zoneCare(zone: ZoneId, snapshot: StoreSnapshot): CareKind | null {
  switch (zone) {
    case 'bowl':
      return 'meal';
    case 'rest_deck':
      return 'rest';
    case 'sniff_corner':
      return snapshot.save.school.upgrades.includes('sniff_corner') ? 'play' : null;
    case 'quiet_corner':
      return snapshot.save.dog.stress >= CALM_STRESS_MIN ? 'calm' : null;
    default:
      return null;
  }
}

/** Whether the prompt button is shown for this zone in this state. */
export function zoneHasAction(zone: ZoneId, snapshot: StoreSnapshot): boolean {
  if (zoneCare(zone, snapshot)) return true;
  if (zone === 'mira' || zone === 'alex_bruno') return true;
  if (zone === 'circle') return practiceUnlocked(snapshot);
  return false;
}

/** Bruno's current state from the world (near → tense) as the content sentence. */
export function brunoLine(ctx: UiContext): string {
  const context = ctx.world?.getContext() ?? null;
  return tWorld.brunoState(context && context.otherDogBand === 'near' ? 'tense' : 'relaxed');
}

export async function runPrompt(ctx: UiContext, zone: ZoneId): Promise<void> {
  const snapshot = ctx.store.get();
  const care = zoneCare(zone, snapshot);
  if (care) {
    const result = await ctx.store.act('CARE', { kind: care });
    if (result.outcome === 'applied') ctx.announce(t.care.presenting(snapshot.save.dog.name, care));
    else if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, snapshot.save.dog.name));
    return;
  }
  if (zone === 'mira') {
    openMiraChoice(ctx);
    return;
  }
  if (zone === 'alex_bruno') {
    openAlexBrunoSheet(ctx);
    return;
  }
  if (zone === 'circle' && practiceUnlocked(snapshot)) {
    ctx.openPracticeSheet();
  }
}

/** Mira: lesson picker, or lesson / free practice once a lesson is completed. */
export function openMiraChoice(ctx: UiContext): void {
  if (!practiceUnlocked(ctx.store.get())) {
    ctx.openLessonPicker();
    return;
  }
  const sheet = createSheet(ctx.modalHost, { title: tWorld.miraChoice.title }, [
    el('div', { class: 'stack stack--tight' }, [
      button({ label: tWorld.miraChoice.lesson, variant: 'option', icon: 'paw', key: 'mira-lesson' }, () => {
        sheet.close();
        ctx.openLessonPicker();
      }),
      button({ label: tWorld.miraChoice.practice, variant: 'option', icon: 'toy', key: 'mira-practice' }, () => {
        sheet.close();
        ctx.openPracticeSheet();
      }),
      button({ label: tWorld.miraChoice.later, variant: 'text', key: 'mira-later' }, () => sheet.close()),
    ]),
    secondary(tPractice.intro),
  ]);
}

export function openAlexBrunoSheet(ctx: UiContext): void {
  const sheet = createSheet(ctx.modalHost, { title: tWorld.prompt('alex_bruno') }, [
    text(tWorld.alexBruno(brunoLine(ctx)), 'text-lead'),
    button({ label: t.app.close, variant: 'secondary', block: true, key: 'alex-close' }, () => sheet.close()),
  ]);
}

/** Fallback "Hof" sheet: zones as buttons; walking is a teleport of the handler to the zone centre. */
export function openYardSheet(ctx: UiContext): void {
  const world = ctx.world;
  const state = world?.getState() ?? null;
  if (!world || !state) {
    ctx.toast(t.toasts.actionRejected);
    return;
  }
  const snapshot = ctx.store.get();
  const zones = state.layout.zones.filter((zone) => !zone.requiresUpgrade || snapshot.save.school.upgrades.includes(zone.requiresUpgrade));
  const sheet = createSheet(ctx.modalHost, { title: tWorld.zonesTitle }, [
    el(
      'div',
      { class: 'stack stack--tight' },
      zones.map((zone) =>
        button({ label: tWorld.prompt(zone.id), variant: 'option', key: `zone-${zone.id}` }, async () => {
          world.send({ type: 'teleport', actor: 'handler', position: zone.center });
          world.send({ type: 'stop' });
          sheet.close();
          if (zoneHasAction(zone.id, ctx.store.get())) await runPrompt(ctx, zone.id);
          else ctx.toast(tWorld.arrived(tWorld.prompt(zone.id)));
        }),
      ),
    ),
    secondary(tWorld.staticNote),
  ]);
}
