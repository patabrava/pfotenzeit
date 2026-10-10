import { expect, test, type Page } from '@playwright/test';
import { content } from '../../src/content';
import type { Save } from '../../src/simulation/types';

async function save(page: Page): Promise<Save> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('pfotenzeit');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['meta', 'saves']);
      let meta: any, saves: any;
      transaction.objectStore('meta').get('meta').onsuccess = event => { meta = (event.target as IDBRequest).result; };
      transaction.objectStore('saves').getAll().onsuccess = event => { saves = (event.target as IDBRequest).result; };
      transaction.oncomplete = () => { db.close(); resolve(saves.find((s: any) => s.saveId === meta.saveIds[meta.activeMode])); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
}

async function tap(page: Page, key: string): Promise<void> {
  const button = page.locator(`[data-key="${key}"]`).first();
  await expect(button).toBeVisible();
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
  await page.waitForTimeout(350);
  await button.click();
}

test('all three lessons complete, including supported retries, exercise reactions and reloads', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  let supported = 0;
  let inserted = 0;
  for (const lessonId of ['L01', 'L02', 'L03'] as const) {
    // Deterministic positioning only; attempts, choices and completion use the player UI.
    await page.evaluate(() => {
      const world = (window as any).__pzWorld;
      world.send({ type: 'teleport', actor: 'handler', position: { x: -1, z: -1.4 } });
      world.send({ type: 'stop' });
    });
    await tap(page, 'prompt');
    if (await page.locator('[data-key="mira-lesson"]').isVisible()) await tap(page, 'mira-lesson');
    await tap(page, `lesson-${lessonId}`);
    await tap(page, 'next');
    const wrongUsed = new Set<string>();
    for (let step = 0; ; step++) {
      expect(step, 'lesson terminates rather than getting stuck in a retry').toBeLessThan(40);
      const visit = (await save(page)).currentVisit!;
      if (visit.phase === 'reflect') break;
      const ref = visit.queue[visit.index]!;
      const round = content.lessons[lessonId].rounds.find(r => r.id === ref.roundId)!;
      if (visit.phase === 'observe') {
        supported += Number(ref.supported);
        inserted += Number(ref.inserted);
        if (round.exercise) {
          await page.evaluate(() => {
            const world = (window as any).__pzWorld;
            world.send({ type: 'teleport', actor: 'handler', position: { x: -2.4, z: 2.2 } });
            world.send({ type: 'teleport', actor: 'dog', position: { x: -2, z: 2 } });
            world.send({ type: 'stop' });
          });
          await tap(page, 'attempt');
          await expect.poll(async () => (await save(page)).currentVisit?.phase, { timeout: 15000 }).toBe('decide');
        } else await tap(page, 'next');
      } else if (visit.phase === 'decide') {
        const attempt = visit.attempts.filter(a => a.roundId === ref.roundId).at(-1);
        const offered = round.options.filter(option => !option.forResponses || attempt && option.forResponses.includes(attempt.response));
        const wrong = lessonId === 'L02' && !ref.supported && !ref.inserted && !wrongUsed.has(ref.roundId);
        const option = (wrong ? offered.find(o => !o.helpful) : offered.find(o => o.helpful && o.next !== 'retry')) ?? offered.find(o => o.helpful);
        expect(option, 'successful exercise offers an advancing choice').toBeDefined();
        if (wrong) wrongUsed.add(ref.roundId);
        await tap(page, `option-${option!.id}`);
        await expect.poll(async () => ['feedback', 'reflect'].includes((await save(page)).currentVisit!.phase), { timeout: 15000 }).toBe(true);
      } else if (visit.phase === 'feedback') await tap(page, 'next');
      else await page.waitForTimeout(100);
    }
    await page.screenshot({ path: testInfo.outputPath(`${lessonId}-reflection.png`) });
    await page.reload();
    await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
    expect((await save(page)).currentVisit?.phase).toBe('reflect');
    await tap(page, 'done');
    await expect.poll(async () => (await save(page)).currentVisit).toBe(null);
    await expect.poll(async () => (await save(page)).pendingPresentation, { timeout: 15000 }).toBe(null);
    await tap(page, 'reward-continue');
    await expect(page.locator('[data-view="home"]')).toBeVisible();
  }
  expect((await save(page)).completedLessonIds.sort()).toEqual(['L01', 'L02', 'L03']);
  expect(supported).toBeGreaterThan(0);
  expect(inserted).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
