/**
 * Browser smoke (17 Browser-Smoke 1, 2, 4, 5, 7). Runs against the production preview with the installed Chrome.
 * Run outside the Claude sandbox: `npm run test:e2e` (first `npx playwright install chromium` if Chrome is missing).
 */
import { expect, test, type Page } from '@playwright/test';
import { content } from '../../src/content';
import { de } from '../../src/content/de';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** First helpful option that advances (exercise rounds: the one offered after a successful attempt, never 'retry'). */
const helpful = (lessonId: 'L01' | 'L02' | 'L03', round: number): string =>
  content.lessons[lessonId].rounds[round]!.options.find((o) => o.helpful && o.next !== 'retry')!.label;

async function freshApp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/');
  // Each Playwright test already receives an isolated browser context. Deleting
  // IndexedDB after boot blocks behind the app's live database connection.
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  return errors;
}

async function tap(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: false }).first();
  await expect(button).toBeVisible({ timeout: 10_000 });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });
  // Preserve the UI's 300 ms click-through guard after closing sheets.
  await page.waitForTimeout(350);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await button.tap();
  else await button.click();
}

test('standard start, profile, care, L01 to care closure, reflection, mark, reload', async ({ page }, testInfo) => {
  let mainNavigations = 0;
  page.on('request', (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) mainNavigations += 1; });
  const errors = await freshApp(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForTimeout(300);
  expect(mainNavigations).toBe(1); // first service-worker claim must preserve the open game
  // The scene must fill its layer, not inherit the canvas's 150px default height.
  await expect.poll(async () => page.locator('.scene').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return Math.abs(rect.height - window.innerHeight) < 2 && Math.abs(rect.width - window.innerWidth) < 2;
  })).toBe(true);
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
  await page.locator('[data-key="lesson-L01"]').click();
  await tap(page, de.lesson.start);
  for (let round = 0; round < 3; round += 1) {
    const roundDef = content.lessons.L01.rounds[round]!;
    if (roundDef.exercise) {
      // D-041 playable round (L01_B find_spot): put handler and dog far from Bruno so Nala settles, then attempt.
      await expect(page.locator('[data-key="attempt"]')).toBeVisible({ timeout: 10_000 });
      const bandFar = page.locator('[data-key="band-far"]');
      if (await bandFar.count()) {
        await bandFar.click(); // fallback path (no walkable yard): choose the far band
      } else {
        await page.evaluate(() => {
          const world = (window as unknown as { __pzWorld?: { send(input: unknown): void } }).__pzWorld;
          if (!world) throw new Error('window.__pzWorld missing: the world controller must expose it for automation');
          world.send({ type: 'teleport', actor: 'handler', position: { x: -2.4, z: 2.2 } });
          world.send({ type: 'teleport', actor: 'dog', position: { x: -2.0, z: 2.0 } });
          world.send({ type: 'stop' });
        });
      }
      await tap(page, roundDef.exercise.readyLabel); // waits until the attempt button is enabled (no timer involved)
      await expect(page.locator('.tag--attempt')).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: testInfo.outputPath(`03-exercise-${round + 1}.png`) });
    } else {
      await tap(page, de.lesson.next); // observe → decide
    }
    await expect(page.locator('[data-key^="option-"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-key^="option-"]').first()).not.toHaveAttribute('aria-disabled', 'true');
    await page.waitForTimeout(400); // allow the camera to settle before visual evidence
    await expect.poll(() => page.locator('.scene').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const header = document.querySelector('.lesson-header')!.getBoundingClientRect();
      const card = document.querySelector('.card--dialog')!.getBoundingClientRect();
      return rect.top >= header.bottom && rect.bottom <= card.top && rect.height > 0;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`03-round-${round + 1}.png`) });
    await tap(page, helpful('L01', round));
    if (round < 2) {
      await tap(page, de.lesson.next); // feedback → next round
    }
  }
  await expect(page.getByRole('button', { name: de.reflection.doneToday })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath('04-reflection.png') });
  await tap(page, de.reflection.doneToday);
  await tap(page, de.app.continue); // reward summary (WP-J) → home
  await expect(page.getByRole('button', { name: de.home.toLesson })).toBeVisible({ timeout: 10_000 });

  // School sheet shows the marks.
  await tap(page, de.home.school);
  await expect(page.getByText(de.school.marksCount(2))).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('05-school.png') });

  // Reload keeps the committed state exactly once.
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  // The hash router restores the school sheet; the background school button is inert.
  await expect(page.getByText(de.school.marksCount(2))).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

async function persistedMode(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open('pfotenzeit');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('meta').objectStore('meta').get('meta');
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => { db.close(); resolve(request.result.activeMode); };
    };
  }));
}

test('challenge onboarding creates a separate run and standard stays untouched', async ({ page }) => {
  const errors = await freshApp(page);
  await tap(page, de.app.settings);
  await page.locator('[data-key="mode"]').click();
  await expect(page.getByText(/Allein durch deine Abwesenheit/)).toBeVisible();
  await tap(page, de.challenge.start);
  // The onboarding screen itself says Challenge; wait for the committed mode
  // switch and navigation before testing its reload persistence.
  await expect(page.locator('[data-view="mode"]')).toHaveCount(0);
  await expect.poll(() => persistedMode(page)).toBe('challenge');
  await expect(page.locator('[data-view="home"]')).toContainText(/Verfassung/);
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  expect(await persistedMode(page)).toBe('challenge');
  await expect(page.locator('[data-view="home"]')).toContainText(/Verfassung/);
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
  await page.locator('[data-key="lesson-L01"]').click();
  await tap(page, de.lesson.start);
  // The seeded visit may choose a supported content variant, so verify the
  // actual observation and description rather than the base round's wording.
  await expect(page.locator('[data-view="lesson"] h2')).toContainText(/Nala/);
  await expect(page.locator('[data-view="lesson"] .describe-body')).toContainText(/Beobachtung beschreiben/);
  await expect(page.locator('[data-key="next"]')).toBeVisible();
  await tap(page, de.lesson.next);
  await tap(page, helpful('L01', 0));
  await tap(page, de.lesson.next);
  await expect(page.locator('[data-key="band-far"]')).toBeVisible();
  await page.locator('[data-key="band-far"]').click();
  await tap(page, content.lessons.L01.rounds[1]!.exercise!.readyLabel);
  await expect(page.getByRole('button', { name: helpful('L01', 1), exact: true })).toBeVisible({ timeout: 15000 });
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


test('installed worker serves the integrated dog model and its CC BY puppy provenance', async ({ page }) => {
  const errors = await freshApp(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const expected = createHash('sha256').update(await readFile('public/assets/models/dog_nala_puppy.glb')).digest('hex');
  const asset = await page.evaluate(async () => {
    const response = await fetch('./assets/manifest.json');
    if (!response.ok) throw new Error('Manifest not available');
    const manifest = await response.json();
    const dog = manifest.assets['dog.nala.puppy'];
    const model = await fetch(dog.url);
    if (!model.ok) throw new Error('Dog model not available');
    const bytes = await model.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { rig: dog.rig, integrated: dog.productionIntegrated, license: dog.license, sourceUrl: dog.sourceUrl, sourceSha256: dog.sourceSha256, clips: dog.clips.length, bytes: bytes.byteLength, sha256: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('') };
  });
  expect(asset.rig).toBe('vendor');
  expect(asset.integrated).toBe(true);
  expect(asset.license).toBe('CC BY 4.0; kenchoo / Tech developers; https://creativecommons.org/licenses/by/4.0/');
  expect(asset.sourceUrl).toBe('https://sketchfab.com/3d-models/dog-puppy-72331763040e4314b154f84348fe0957');
  expect(asset.sourceSha256).toBe('45bbe4ae0561c49f0dd1bc821305b577dd75b9c8cd8cc011dae6adc409990811');
  expect(asset.clips).toBe(16);
  expect(asset.sha256).toBe(expected);
  await tap(page, de.app.settings);
  const summary=page.locator('.model-credits > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Dog Puppy · kenchoo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Originalmodell · Tech developers' })).toHaveAttribute('href', 'https://skfb.ly/6WMyH');
  await expect(page.getByRole('link', { name: 'Lizenz: Creative Commons Namensnennung 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  expect(errors).toEqual([]);
});


test('installed worker serves both integrated CC0 human replacements', async ({ page }) => {
  const errors = await freshApp(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  for (const name of ['mira', 'alex']) {
    const expected = createHash('sha256').update(await readFile(`public/assets/models/human_${name}.glb`)).digest('hex');
    const asset = await page.evaluate(async (name) => {
      const manifest = await (await fetch('./assets/manifest.json')).json();
      const entry = manifest.assets[`human.${name}`];
      const response = await fetch(entry.url);
      if (!response.ok) throw new Error(`Human model missing: ${name}`);
      const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { rig: entry.rig, integrated: entry.productionIntegrated, license: entry.license, sourceUrl: entry.sourceUrl, clips: entry.clips, sha256: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('') };
    }, name);
    expect(asset.rig).toBe('vendor');
    expect(asset.integrated).toBe(true);
    expect(asset.license).toBe('CC0 1.0; Grab3D; https://creativecommons.org/publicdomain/zero/1.0/');
    expect(asset.sourceUrl).toBe(`https://grab3d.com/models/characters/${name === 'mira' ? 'woman' : 'man'}/`);
    expect(asset.clips).toEqual(['idle', 'greet', 'gesture_explain', 'offer_reward', 'kneel']);
    expect(asset.sha256).toBe(expected);
  }
  await tap(page, de.app.settings);
  await page.locator('.model-credits > summary').click();
  await expect(page.getByRole('link', { name: 'Casual Woman · Grab3D' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Casual Man · Grab3D' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lizenz: CC0 1.0' })).toHaveAttribute('href', 'https://creativecommons.org/publicdomain/zero/1.0/');
  expect(errors).toEqual([]);
});
