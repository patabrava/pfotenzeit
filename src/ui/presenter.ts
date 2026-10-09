/**
 * Presenter: turns `save.pendingPresentation` into `renderer.present(...)` calls exactly once per
 * transaction, then dispatches ACKNOWLEDGE_EFFECT. Holds a presentation snapshot so the UI shows the
 * pre-effect values while the animation plays and animates to the committed end state afterwards.
 * On reload with a pending presentation the same path re-presents (or snaps under reduced motion).
 * Never computes or changes domain state (15 Transaktionen, step 4).
 */
import type { AudioManager } from '../audio/AudioManager';
import type { RendererHandle } from '../render/types';
import { CARE_PRESENTATION_MS } from '../simulation/defaults';
import type { DomainEffect, NeedValues, PixelState, Save } from '../simulation/types';
import type { Store, StoreSnapshot } from '../state/store';

export interface PresenterDeps {
  store: Store;
  audio: AudioManager;
  getRenderer(): RendererHandle | null;
}

export type EffectListener = (effect: DomainEffect, snapshot: StoreSnapshot) => void;

export interface Presenter {
  update(snapshot: StoreSnapshot): void;
  /** Need values to display: the effect's `before` while a care effect is being presented. */
  getDisplayNeeds(save: Save): NeedValues;
  /** Marks to display: pre-reward / pre-purchase while that effect is being presented. */
  getDisplayMarks(save: Save): number;
  /** Pixel state override during care presentation (rest/calm → resting). */
  getPixelOverride(): PixelState | null;
  /** Effect currently being shown, if any. */
  getActiveEffect(): DomainEffect | null;
  isPresenting(): boolean;
  /** Fires after an effect has been shown (before acknowledgement). */
  onEffectShown(listener: EffectListener): () => void;
  /** Fires whenever the presentation state changes (start/advance/end). */
  onChange(listener: () => void): () => void;
  destroy(): void;
}

interface ActivePresentation {
  transactionId: string;
  saveId: string;
  effects: DomainEffect[];
  index: number;
}

const SNAP_MS = 220;
const DECISION_MS = 1400;
const REWARD_MS = 1000;
const UPGRADE_MS = 500;
const GROWTH_MS = 1600;

function fallbackDuration(effect: DomainEffect): number {
  switch (effect.type) {
    case 'care':
      return CARE_PRESENTATION_MS[effect.kind];
    case 'decision':
      return DECISION_MS;
    case 'visitRewarded':
      return REWARD_MS;
    case 'upgradeBought':
      return UPGRADE_MS;
    case 'growth':
      return GROWTH_MS;
    default:
      return 0;
  }
}

function maxDuration(effect: DomainEffect): number {
  return fallbackDuration(effect) + 700;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function createPresenter(deps: PresenterDeps): Presenter {
  const { store, audio } = deps;
  let active: ActivePresentation | null = null;
  const handled = new Set<string>();
  const effectListeners = new Set<EffectListener>();
  const changeListeners = new Set<() => void>();
  let destroyed = false;

  function emitChange(): void {
    for (const listener of changeListeners) {
      try {
        listener();
      } catch (error) {
        console.error('[presenter] change listener failed', error);
      }
    }
  }

  function currentEffect(): DomainEffect | null {
    if (!active) return null;
    return active.effects[active.index] ?? null;
  }

  function rendererVisible(snapshot: StoreSnapshot): boolean {
    const renderer = deps.getRenderer();
    if (!renderer) return false;
    if (renderer.getStatus() !== 'ready') return false;
    const route = snapshot.app.route;
    return route === 'home' || route === 'lesson';
  }

  function playCue(effect: DomainEffect): void {
    switch (effect.type) {
      case 'care':
        audio.play(effect.kind === 'calm' ? 'sniff' : 'soft');
        break;
      case 'decision':
        if (effect.helpful) audio.play('confirm');
        else if (effect.poseAfter === 'sniff') audio.play('sniff');
        break;
      case 'visitRewarded':
      case 'upgradeBought':
      case 'growth':
        audio.play('chime');
        break;
      default:
        break;
    }
  }

  async function presentOne(effect: DomainEffect, snapshot: StoreSnapshot): Promise<void> {
    const reducedMotion = snapshot.app.reducedMotion;
    playCue(effect);
    if (effect.type === 'lost') return;
    if (reducedMotion) {
      const renderer = deps.getRenderer();
      if (renderer && rendererVisible(snapshot)) {
        await Promise.race([renderer.present(effect, { maxDurationMs: 300, reducedMotion: true }), wait(400)]);
      } else {
        await wait(SNAP_MS);
      }
      return;
    }
    const renderer = deps.getRenderer();
    if (renderer && rendererVisible(snapshot)) {
      const max = maxDuration(effect);
      try {
        await Promise.race([renderer.present(effect, { maxDurationMs: max, reducedMotion: false }), wait(max + 300)]);
      } catch (error) {
        console.warn('[presenter] present failed, falling back to timer', error);
        await wait(Math.min(fallbackDuration(effect), 1500));
      }
      return;
    }
    await wait(fallbackDuration(effect));
  }

  async function run(presentation: ActivePresentation): Promise<void> {
    active = presentation;
    store.patchApp({ presenting: true });
    emitChange();
    try {
      while (!destroyed && active === presentation && presentation.index < presentation.effects.length) {
        const snapshot = store.get();
        if (snapshot.save.saveId !== presentation.saveId) break;
        const effect = presentation.effects[presentation.index]!;
        await presentOne(effect, snapshot);
        if (destroyed || active !== presentation) break;
        const after = store.get();
        for (const listener of effectListeners) {
          try {
            listener(effect, after);
          } catch (error) {
            console.error('[presenter] effect listener failed', error);
          }
        }
        presentation.index += 1;
        emitChange();
      }
    } finally {
      if (active === presentation) {
        active = null;
        store.patchApp({ presenting: false });
        emitChange();
        if (!destroyed && store.get().save.saveId === presentation.saveId) {
          await store.act('ACKNOWLEDGE_EFFECT', { presentedTransactionId: presentation.transactionId });
        }
      }
    }
  }

  return {
    update(snapshot) {
      const pending = snapshot.save.pendingPresentation;
      if (active && snapshot.save.saveId !== active.saveId) {
        // The active save changed under us (mode switch): abandon the visual run; the new save decides.
        active = null;
        store.patchApp({ presenting: false });
        emitChange();
      }
      if (!pending) return;
      if (active && active.transactionId === pending.transactionId) return;
      if (handled.has(pending.transactionId)) return;
      handled.add(pending.transactionId);
      void run({ transactionId: pending.transactionId, saveId: snapshot.save.saveId, effects: [...pending.effects], index: 0 });
    },
    getDisplayNeeds(save) {
      const effect = currentEffect();
      if (effect && effect.type === 'care') return effect.before;
      const { satiety, energy, comfort, arousal, stress, vitality } = save.dog;
      return { satiety, energy, comfort, arousal, stress, vitality };
    },
    getDisplayMarks(save) {
      const effect = currentEffect();
      if (!effect) return save.school.marks;
      if (effect.type === 'visitRewarded') return Math.max(0, save.school.marks - (effect.visitMark ? 1 : 0) - effect.learningMarks);
      if (effect.type === 'upgradeBought') return save.school.marks + effect.cost;
      return save.school.marks;
    },
    getPixelOverride() {
      const effect = currentEffect();
      if (effect && effect.type === 'care' && (effect.kind === 'rest' || effect.kind === 'calm')) return 'resting';
      return null;
    },
    getActiveEffect: currentEffect,
    isPresenting: () => active !== null,
    onEffectShown(listener) {
      effectListeners.add(listener);
      return () => effectListeners.delete(listener);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    destroy() {
      destroyed = true;
      active = null;
      effectListeners.clear();
      changeListeners.clear();
    },
  };
}
