/** Full exercise/animation browser audit. Run against Vite (developer imports are used for deterministic setup). */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = process.env.PZ_BASE ? null : await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await server?.listen();
const base = process.env.PZ_BASE ?? server.resolvedUrls.local[0];
const phase = process.env.PZ_PHASE ?? 'all';
const onlyWidth = process.env.PZ_WIDTH;
const onlyKind = process.env.PZ_KIND;
const onlyDistraction = process.env.PZ_DISTRACTION;
const filtered = onlyWidth || onlyKind || onlyDistraction;
const selected = name => (!onlyWidth || name.startsWith(`${onlyWidth}-`)) && (!onlyKind || name.includes(`-${onlyKind}-`)) && (!onlyDistraction || name.endsWith(`-${onlyDistraction}`));
const out = 'verification/exercise-qa';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = phase === 'practice' ? JSON.parse(await readFile(`${out}/results.json`, 'utf8')).filter(r => r.name.startsWith('all-animation') || filtered && !selected(r.name)) : [];
async function tap(page, key) {
  const button = page.locator(`[data-key="${key}"]`).first();
  await expect(button).toBeVisible();
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
  await page.waitForTimeout(350); // sheet click-through guard
  await button.click();
}
async function place(page, kind, difficult = false) {
  await page.evaluate(({ kind, difficult }) => {
    const world = window.__pzWorld;
    const dog = difficult ? { x: 0.8, z: 0.4 } : { x: -2, z: 2 };
    const handler = kind === 'recall' ? { x: -2.4, z: -1.1 } : { x: dog.x - 0.4, z: dog.z + 0.2 };
    world.send({ type: 'teleport', actor: 'handler', position: handler });
    world.send({ type: 'teleport', actor: 'dog', position: dog });
    const nearOther = difficult && world.getPractice().distraction === 'other_dog';
    world.send({ type: 'teleport', actor: 'other_dog', position: nearOther ? { x: 1.4, z: 0.4 } : { x: 2.4, z: 1.6 } });
    world.send({ type: 'stop' });
  }, { kind, difficult });
}
try {
  // Review every authored observation, variant and decision using actual shipped GLBs.
  for (const growth of phase === 'practice' ? [] : ['arriving', 'growing']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/src/render/dev/lesson-review.html?growth=${growth}`);
    await expect(page.locator('#status')).toContainText('Ready', { timeout: 30000 });
    await page.locator('#all').click();
    await expect(page.locator('#status')).toContainText('Completed', { timeout: 240000 });
    for (const link of await page.locator('#downloads a').all()) {
      const pending = page.waitForEvent('download');
      await link.click();
      const download = await pending;
      await download.saveAs(`${out}/${download.suggestedFilename()}`);
    }
    const measured = await page.evaluate(async () => JSON.parse(await (await fetch(document.querySelector('#downloads a:last-child').href)).text()));
    results.push({ name: `all-animation-cases-${growth}`, count: measured.cases.length, pass: measured.cases.every(c => c.pass) && !errors.length, errors });
    console.log(`Reviewed ${measured.cases.length} animation cases (${growth})`);
    await page.close();
  }
  // Real HUD attempts, response scripts, repeat and exit; saves are isolated per viewport.
  for (const [width, height, reducedMotion] of phase === 'animations' ? [] : [[390, 844, 'no-preference'], [360, 640, 'reduce'], [1440, 900, 'no-preference']]) {
    if (onlyWidth && String(width) !== onlyWidth) continue;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
    // Only unlock prerequisites. All exercise selection and attempt actions go through the player UI.
    await page.getByRole('button', { name: 'DBG', exact: true }).click();
    await expect(page.locator('.pz-debug')).toBeVisible();
    await page.waitForTimeout(200);
    for (const id of ['L01', 'L02']) await page.getByRole('button', { name: `complete ${id}`, exact: true }).click();
    await page.keyboard.press('Control+Shift+D');
    await expect(page.locator('.pz-debug')).toBeHidden();
    for (const kind of ['recall', 'find_spot', 'look_at']) for (const distraction of ['none', 'toy', 'other_dog']) {
      const name = `${width}-${kind}-${distraction}`;
      if (!selected(name)) continue;
      try {
        await page.evaluate(() => {
          window.__pzWorld.send({ type: 'teleport', actor: 'handler', position: { x: -1, z: -1.4 } });
          window.__pzWorld.send({ type: 'stop' });
        });
        await tap(page, 'prompt');
        await tap(page, 'mira-practice');
        await tap(page, `practice-${kind}`);
        await tap(page, `distraction-${distraction}`);
        await tap(page, 'practice-start');
        await place(page, kind);
        const expected = kind === 'recall' ? 'comes' : kind === 'find_spot' ? 'settled' : 'glance';
        await tap(page, 'attempt');
        await expect(page.locator('[data-key="practice-again"]')).toBeVisible({ timeout: 15000 });
        const response = await page.evaluate(() => window.__pzWorld.getPractice().lastResponse);
        assert.equal(response, expected);
        await expect.poll(() => page.evaluate(() => window.__pzWorld.getState().actors.dog.speed)).toBeLessThan(0.05);
        await page.screenshot({ path: `${out}/${name}.png` });
        assert.ok(await page.locator('.scene').evaluate(node => {
          const scene = node.getBoundingClientRect();
          const card = document.querySelector('.card--dialog').getBoundingClientRect();
          const header = document.querySelector('.lesson-header').getBoundingClientRect();
          return scene.height > 0 && scene.top >= header.bottom - 2 && scene.bottom <= card.top + 2;
        }), '3D scene has a visible strip between header and dialog');
        await tap(page, 'practice-again');
        // Exercise adverse responses and helpful hint after two unsuccessful attempts.
        const difficult = kind !== 'look_at' && distraction !== 'none';
        await place(page, kind, difficult);
        await tap(page, 'attempt');
        await expect(page.locator('[data-key="practice-again"]')).toBeVisible({ timeout: 15000 });
        const repeated = await page.evaluate(() => window.__pzWorld.getPractice());
        assert.equal(repeated.attempts, 2);
        if (difficult) assert.ok(!['comes', 'settled'].includes(repeated.lastResponse));
        await tap(page, 'practice-done');
        await expect(page.locator('[data-view="home"]')).toBeVisible();
        assert.equal(await page.evaluate(() => window.__pzWorld.getPractice()), null);
        results.push({ name, pass: true, response, repeated: repeated.lastResponse });
        console.log(`PASS ${name}: ${response} / ${repeated.lastResponse}`);
      } catch (error) {
        await page.screenshot({ path: `${out}/${name}-failed.png` });
        results.push({ name, pass: false, error: String(error) });
        throw error;
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} catch (error) {
  results.push({ name: 'audit-interrupted', pass: false, error: String(error) });
  throw error;
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  await server?.close();
}
console.log(JSON.stringify(results, null, 2));
if (results.some(r => !r.pass)) process.exitCode = 1;
