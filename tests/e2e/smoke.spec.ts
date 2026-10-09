/**
 * Browser smoke (17 Browser-Smoke 1, 2, 4, 5, 7). Runs against the production preview with the installed Chrome.
 * Run outside the Claude sandbox: `npm run test:e2e` (first `npx playwright install chromium` if Chrome is missing).
 */
import { expect, test, type Page } from '@playwright/test';
import { content } from '../../src/content';
import { de } from '../../src/content/de';

const helpful = (lessonId: 'L01' | 'L02' | 'L03', round: number): string =>
  content.lessons[lessonId].rounds[round]!.options.find((o) => o.helpful)!.label;

async function freshApp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(dbs.map((db) => new Promise((resolve) => (db.name ? (indexedDB.deleteDatabase(db.name).onsuccess = resolve) : resolve(null)))));
  });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  return errors;
}

async function tap(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: false }).first();
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
}

test('standard start, profile, care, L01 to care closure, reflection, mark, reload', async ({ page }, testInfo) => {
  const errors = await freshApp(page);
  await page.screenshot({ path: testInfo.outputPath('01-home.png') });

  // Profile and a free care action.
  await page.getByRole('button', { name: /Profil/ }).first().click();
  await expect(page.getByText(de.profile.tabs.care)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('02-profile.png') });
  await tap(page, de.care.actions.meal);
  await page.waitForTimeout(500);
  await tap(page, de.app.back);

  // Lesson L01.
  await tap(page, de.home.toLesson);
  await page.getByRole('button', { name: new RegExp(content.lessons.L01.title) }).first().click();
  await tap(page, de.lesson.start);
  for (let round = 0; round < 3; round += 1) {
    await tap(page, de.lesson.next); // observe → decide
    await page.screenshot({ path: testInfo.outputPath(`03-round-${round + 1}.png`) });
    await tap(page, helpful('L01', round));
    if (round < 2) {
      await tap(page, de.lesson.next); // feedback → next round
    }
  }
  await expect(page.getByRole('button', { name: de.reflection.doneToday })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath('04-reflection.png') });
  await tap(page, de.reflection.doneToday);
  await expect(page.getByRole('button', { name: de.home.toLesson })).toBeVisible({ timeout: 10_000 });

  // School sheet shows the marks.
  await tap(page, de.home.school);
  await expect(page.getByText(de.school.marksCount(2))).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('05-school.png') });

  // Reload keeps the committed state exactly once.
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  await tap(page, de.home.school);
  await expect(page.getByText(de.school.marksCount(2))).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('challenge onboarding creates a separate run and standard stays untouched', async ({ page }) => {
  const errors = await freshApp(page);
  await tap(page, de.app.settings);
  await tap(page, de.settings.mode);
  await expect(page.getByText(/Allein durch deine Abwesenheit/)).toBeVisible();
  await tap(page, de.challenge.start);
  await expect(page.locator('#app')).toContainText(/Challenge/);
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  await expect(page.locator('#app')).toContainText(/Challenge/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('WebGL unavailable still leaves profile and lesson texts usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    const proto = HTMLCanvasElement.prototype as unknown as { getContext: (...args: unknown[]) => unknown };
    const original = proto.getContext;
    proto.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const type = args[0];
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.apply(this, args);
    };
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  await tap(page, de.home.toLesson);
  await page.getByRole('button', { name: new RegExp(content.lessons.L01.title) }).first().click();
  await tap(page, de.lesson.start);
  await expect(page.locator('#app')).toContainText(content.lessons.L01.rounds[0]!.observationText.slice(0, 20));
  await context.close();
});

test('second tab is told the game is open elsewhere', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto('/');
  await expect(first.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#app')).toContainText(/anderen Tab/, { timeout: 20_000 });
  await context.close();
});
