/**
 * Dog sheet (D-041 §4/§5): opens when the player taps the dog (renderer pick → actor 'dog') or from the
 * fallback menu. Name + attention line (de.poses via the pose line helper), "Streicheln" (= CARE calm
 * when stress ≥ 35, otherwise a greeting line), "Spielen" (= CARE play), "Sitz" (world holdDog, free),
 * and the current moment's observation + responses ("Ignorieren" always). Closes after an action.
 * Mirrors app.dogSheetOpen so the shell can keep the world inert while it is open.
 */
import type { DogAttention, MomentKind, MomentResponse, PoseId } from '../simulation/types';
import type { StoreSnapshot } from '../state/store';
import { button, createSheet, el, replaceChildren, secondary, text } from './components';
import type { UiContext } from './context';
import { rejectionText } from './sheets';
import { poseLine, t, tWorld } from './strings';
import { CALM_STRESS_MIN } from './yard';

const ATTENTION_POSE: Record<DogAttention, PoseId> = {
  relaxed: 'idle_relaxed',
  focused: 'look_at_handler',
  distracted: 'sniff',
  tense: 'tense_idle',
  tired: 'tired_idle',
  resting: 'rest_loop',
};

const MOMENT_RESPONSES: MomentResponse[] = ['allow', 'call_gently', 'sit_with', 'reward_glance'];

export function attentionPose(attention: DogAttention | null | undefined): PoseId {
  return attention ? ATTENTION_POSE[attention] : 'idle_relaxed';
}

export function openDogSheet(ctx: UiContext): void {
  const body = el('div', { class: 'stack' });
  const sheet = createSheet(
    ctx.modalHost,
    {
      title: tWorld.dogTitle(ctx.store.get().save.dog.name),
      onClose: () => {
        if (ctx.store.get().app.dogSheetOpen) ctx.store.patchApp({ dogSheetOpen: false });
      },
    },
    [body],
  );
  ctx.store.patchApp({ dogSheetOpen: true });

  const render = (snapshot: StoreSnapshot): void => {
    const { save, app } = snapshot;
    const name = save.dog.name;
    const context = ctx.world?.getContext() ?? null;
    const state = ctx.world?.getState() ?? null;
    const locked = app.presenting || save.currentVisit?.phase === 'react' || save.currentVisit?.phase === 'exercise';
    const blocked = { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) };

    const children: Array<HTMLElement | null> = [text(poseLine(name, attentionPose(context?.attention)), 'text-lead')];

    // --- moment block
    const moment = state?.moment ?? null;
    if (moment && moment.response === null) {
      const momentText = (ctx.content.moments as Partial<Record<MomentKind, (typeof ctx.content.moments)[MomentKind]>> | undefined)?.[moment.kind];
      const respond = async (response: MomentResponse): Promise<void> => {
        ctx.world?.send({ type: 'respondMoment', momentId: moment.id, response });
        if (response !== 'ignore') {
          const result = await ctx.store.act('RESPOND_MOMENT', { kind: moment.kind, response });
          if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, name));
          else if (momentText?.outcome[response]) ctx.announce(momentText.outcome[response] ?? '');
        }
        sheet.close();
      };
      const responses = MOMENT_RESPONSES.filter((response) => momentText?.responses[response]).map((response) =>
        button({ label: momentText?.responses[response] ?? response, variant: 'option', key: `moment-${response}`, ariaDisabled: locked, options: blocked }, () => respond(response)),
      );
      children.push(
        el('div', { class: 'moment-block stack stack--tight' }, [
          momentText ? text(momentText.observation) : null,
          ...responses,
          button({ label: momentText?.responses.ignore ?? tWorld.dogClose, variant: 'text', key: 'moment-ignore' }, () => respond('ignore')),
        ]),
      );
    }

    // --- actions
    const pet = async (): Promise<void> => {
      if (save.dog.stress >= CALM_STRESS_MIN) {
        const result = await ctx.store.act('CARE', { kind: 'calm' });
        if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, name));
        else ctx.announce(t.care.presenting(name, 'calm'));
      } else {
        ctx.toast(tWorld.greeting(name));
      }
      sheet.close();
    };
    const play = async (): Promise<void> => {
      const result = await ctx.store.act('CARE', { kind: 'play' });
      if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, name));
      else ctx.announce(t.care.presenting(name, 'play'));
      sheet.close();
    };
    const sit = (): void => {
      ctx.world?.send({ type: 'holdDog', pose: 'sit' });
      ctx.announce(tWorld.sitDone(name));
      sheet.close();
    };
    children.push(
      el('div', { class: 'dock-row dock-row--three' }, [
        button({ label: tWorld.dogPet, variant: 'option', icon: 'calm', key: 'dog-pet', ariaDisabled: locked, options: blocked }, pet),
        button({ label: tWorld.dogPlay, variant: 'option', icon: 'toy', key: 'dog-play', ariaDisabled: locked, options: blocked }, play),
        button({ label: tWorld.dogSit, variant: 'option', icon: 'paw', key: 'dog-sit', ariaDisabled: locked, options: blocked }, sit),
      ]),
      secondary(t.care.waterNote),
    );
    replaceChildren(body, children);
  };

  render(ctx.store.get());
  const unsubscribe = ctx.store.subscribe((snapshot, change) => {
    if (!sheet.isOpen()) return;
    if (change === 'save' || change === 'app') render(snapshot);
  });
  const unsubscribeWorld = ctx.world?.onChange(() => {
    if (sheet.isOpen()) render(ctx.store.get());
  });
  const originalClose = sheet.close;
  sheet.close = () => {
    unsubscribe();
    unsubscribeWorld?.();
    originalClose();
  };
}
