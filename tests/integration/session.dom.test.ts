// @vitest-environment happy-dom
/**
 * Integration: real boot → real UI → real store/reducer → memory repository, driven through the DOM.
 * No WebGL in jsdom, so the renderer reports 'failed' and the text fallback is used (that path is a
 * product requirement: 17 "WebGL-Ausfall: Profil und Lerntexte weiterhin nutzbar").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, type BootHandle } from '../../src/app/boot';
import { content } from '../../src/content';
import { de } from '../../src/content/de';
import { createTestProviders } from '../../src/simulation/fixtures';
import { createMemoryRepository } from '../../src/storage/memoryRepository';
import type { OwnershipState, TabOwnership } from '../../src/storage/types';

function ownerOwnership(): TabOwnership {
  return {
    acquire: async () => 'owner' as OwnershipState,
    onChange: () => () => undefined,
    release: () => undefined,
  };
}

function installMatchMedia(reduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function visibleButtons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.closest('[inert]') && !b.hidden);
}

function findButton(root: HTMLElement, label: string): HTMLButtonElement | null {
  const wanted = label.trim();
  return (
    visibleButtons(root).find((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim() === wanted) ??
    visibleButtons(root).find((b) => (b.textContent ?? '').includes(wanted)) ??
    null
  );
}

async function click(root: HTMLElement, label: string): Promise<void> {
  const button = await vi.waitFor(
    () => {
      const found = findButton(root, label);
      if (!found) {
        const labels = visibleButtons(root).map((b) => (b.textContent ?? '').trim()).join(' | ');
        throw new Error(`button "${label}" not found; visible: ${labels}`);
      }
      if (found.getAttribute('aria-disabled') === 'true' || found.disabled) throw new Error(`button "${label}" disabled`);
      return found;
    },
    { timeout: 4000, interval: 25 },
  );
  // Pointer-first input (05): the views listen to pointer events and click.
  button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }));
  button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }));
  button.click();
}

async function waitForText(root: HTMLElement, text: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!(root.textContent ?? '').includes(text)) throw new Error(`text "${text}" not visible`);
    },
    { timeout: 4000, interval: 25 },
  );
}

const helpfulLabel = (lessonId: 'L01' | 'L02' | 'L03', roundIndex: number): string => {
  const round = content.lessons[lessonId].rounds[roundIndex]!;
  return round.options.find((o) => o.helpful)!.label;
};

describe('full standard session through the DOM', () => {
  let root: HTMLElement;
  let handle: BootHandle | null = null;
  const repository = createMemoryRepository();
  const providers = createTestProviders();

  beforeEach(() => {
    installMatchMedia(true); // reduced motion: presenter snaps, keeps the test fast
    root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
  });

  afterEach(() => {
    handle?.destroy();
    handle = null;
    root.remove();
  });

  it('plays L01 to a care closure, rewards once, survives reload, and never double-rewards', async () => {
    handle = await boot({ root, repository, providers, ownership: ownerOwnership(), serviceWorker: false });
    const store = handle.store!;
    expect(store.get().save.mode).toBe('standard');
    expect(store.get().app.ownership).toBe('owner');

    // HOME → lesson picker → start L01
    await click(root, de.home.toLesson);
    const l01Title = content.lessons.L01.title;
    await waitForText(root, l01Title);
    const startButton = await vi.waitFor(() => {
      const candidates = visibleButtons(root).filter((b) => (b.textContent ?? '').includes(l01Title) || (b.textContent ?? '').includes('L01'));
      const found = candidates[0];
      if (!found) throw new Error('no L01 button');
      return found;
    });
    startButton.click();
    await vi.waitFor(() => {
      expect(store.get().save.currentVisit?.lessonId).toBe('L01');
    });
    expect(store.get().save.currentVisit?.phase).toBe('prepare');

    // prepare → observe (round A)
    await click(root, de.lesson.start);
    await vi.waitFor(() => expect(store.get().save.currentVisit?.phase).toBe('observe'));
    // observe → decide
    await click(root, de.lesson.next);
    await vi.waitFor(() => expect(store.get().save.currentVisit?.phase).toBe('decide'));
    // decide: helpful option A
    await click(root, helpfulLabel('L01', 0));
    await vi.waitFor(() => expect(store.get().save.currentVisit?.phase).toBe('feedback'), { timeout: 5000 });
    expect(store.get().save.pendingPresentation).toBeNull();
    // feedback → observe round B (energy −4 once)
    const energyBefore = store.get().save.dog.energy;
    await click(root, de.lesson.next);
    await vi.waitFor(() => expect(store.get().save.currentVisit?.phase).toBe('observe'));
    expect(store.get().save.dog.energy).toBe(energyBefore - 4);
    expect(store.get().save.currentVisit?.index).toBe(1);

    await click(root, de.lesson.next);
    await click(root, helpfulLabel('L01', 1)); // Mehr Abstand (counts for learning)
    await vi.waitFor(() => expect(store.get().save.currentVisit?.phase).toBe('feedback'), { timeout: 5000 });
    await click(root, de.lesson.next);
    await vi.waitFor(() => expect(store.get().save.currentVisit?.index).toBe(2));

    await click(root, de.lesson.next);
    await click(root, helpfulLabel('L01', 2)); // Pause anbieten → careClosure → reflect
    await vi.waitFor(() => expect(store.get().save.currentVisit?.phase).toBe('reflect'), { timeout: 5000 });

    // REFLECTION → Fertig für heute
    await click(root, de.reflection.doneToday);
    await vi.waitFor(() => expect(store.get().save.currentVisit).toBeNull());

    const after = store.get().save;
    expect(after.completedLessonIds).toEqual(['L01']);
    expect(after.careClosureVisitIds).toHaveLength(1);
    expect(after.helpfulVisitIds).toHaveLength(1);
    expect(after.memories).toHaveLength(1);
    expect(after.dog.learnedPoints).toEqual(['criterion_context']);
    expect(after.school.marks).toBe(2); // 1 visit mark + 1 learning mark
    expect(after.rewardedVisitIds).toHaveLength(1);
    expect(after.pendingPresentation).toBeNull();
    await vi.waitFor(() => expect(store.get().app.route).toBe('home'));

    // Persisted?
    const stored = await repository.loadSave(after.saveId);
    expect(stored?.school.marks).toBe(2);
    expect(stored?.revision).toBe(after.revision);

    // Reload: a second boot from the same repository restores the committed end state exactly once.
    handle.destroy();
    root.innerHTML = '';
    handle = await boot({ root, repository, providers, ownership: ownerOwnership(), serviceWorker: false });
    const reloaded = handle.store!.get().save;
    expect(reloaded.saveId).toBe(after.saveId);
    expect(reloaded.school.marks).toBe(2);
    expect(reloaded.completedLessonIds).toEqual(['L01']);
    expect(reloaded.dog.satiety).toBe(after.dog.satiety); // standard: no offline loss
    await waitForText(root, de.home.toLesson);
  });

  it('reload in the middle of a reaction re-presents once and does not duplicate the decision', async () => {
    const repo = createMemoryRepository();
    const prov = createTestProviders();
    handle = await boot({ root, repository: repo, providers: prov, ownership: ownerOwnership(), serviceWorker: false });
    const store = handle.store!;
    await click(root, de.home.toLesson);
    await waitForText(root, content.lessons.L02.title);
    const l02 = await vi.waitFor(() => {
      const found = visibleButtons(root).find((b) => (b.textContent ?? '').includes(content.lessons.L02.title));
      if (!found) throw new Error('no L02 button');
      return found;
    });
    l02.click();
    await vi.waitFor(() => expect(store.get().save.currentVisit?.lessonId).toBe('L02'));
    await click(root, de.lesson.start);
    await click(root, de.lesson.next);
    await vi.waitFor(() => expect(store.get().save.currentVisit?.phase).toBe('decide'));

    // Commit the decision directly and "crash" before the UI acknowledges: phase react + pending presentation.
    const result = await store.act('SELECT_OPTION', { optionId: content.lessons.L02.rounds[0]!.options.find((o) => o.helpful)!.id });
    expect(result.outcome).toBe('applied');
    const crashed = await repo.loadSave(store.get().save.saveId);
    expect(crashed?.currentVisit?.phase).toBe('react');
    expect(crashed?.pendingPresentation).not.toBeNull();
    handle.destroy();
    root.innerHTML = '';

    handle = await boot({ root, repository: repo, providers: prov, ownership: ownerOwnership(), serviceWorker: false });
    const store2 = handle.store!;
    await vi.waitFor(() => expect(store2.get().app.route).toBe('lesson'));
    await vi.waitFor(() => expect(store2.get().save.currentVisit?.phase).toBe('feedback'), { timeout: 5000 });
    expect(store2.get().save.pendingPresentation).toBeNull();
    expect(store2.get().save.currentVisit?.decisions).toHaveLength(1);
  });
});
