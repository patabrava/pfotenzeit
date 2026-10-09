#!/usr/bin/env node
/**
 * Browser verification for the renderer (run OUTSIDE the Claude sandbox; headless Chrome cannot
 * bind its singleton socket inside it). Starts a Vite dev server, opens the dev scene with the
 * local Google Chrome (or the Playwright Chromium if installed), and for each of the five target
 * viewports takes screenshots of the three views, reads renderer.info metrics, and checks demand
 * rendering: the frame counter must not increase while setActive(false) or while held idle.
 *
 *   node src/render/dev/verify-browser.mjs            # screenshots → $TMPDIR/pfotenzeit-browser
 *   node src/render/dev/verify-browser.mjs --out dir  # custom output directory
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : join(process.env.TMPDIR ?? '/tmp', 'pfotenzeit-browser');
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  [360, 640],
  [390, 844],
  [430, 932],
  [844, 390],
  [1440, 900],
];
const VIEWS = ['school', 'lesson', 'closeup'];

const server = await createServer({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${server.config.server.port}/`;
const url = `${base}src/render/dev/scene.html?controls=0`;

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
} catch {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [width, height] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__pfotenzeitDev && window.__pfotenzeitDev.renderer.getStatus() === 'ready', null, { timeout: 30000 });
  await sleep(400);
  const entry = { viewport: `${width}x${height}`, views: {}, errors };
  for (const view of VIEWS) {
    await page.evaluate((v) => window.__pfotenzeitDev.set({ view: v }), view);
    await sleep(700);
    await page.screenshot({ path: join(outDir, `${width}x${height}_${view}.png`) });
    entry.views[view] = await page.evaluate(() => window.__pfotenzeitDev.metrics());
  }
  // Demand rendering: no frames while inactive, no frames while held and settled.
  const demand = await page.evaluate(async () => {
    const api = window.__pfotenzeitDev;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    api.set({ view: 'lesson', hold: false });
    await wait(400);
    const idleBefore = api.frames();
    await wait(500);
    const idleAfter = api.frames();
    api.renderer.setActive(false);
    await wait(100);
    const inactiveBefore = api.frames();
    api.renderer.invalidate();
    await wait(1200);
    const inactiveAfter = api.frames();
    api.renderer.setActive(true);
    await wait(300);
    const resumed = api.frames();
    api.set({ hold: true });
    await wait(800);
    const holdBefore = api.frames();
    await wait(1000);
    const holdAfter = api.frames();
    api.set({ hold: false });
    return { idleFramesPerHalfSecond: idleAfter - idleBefore, inactiveFrames: inactiveAfter - inactiveBefore, resumedFrames: resumed - inactiveAfter, heldFrames: holdAfter - holdBefore };
  });
  entry.demand = demand;
  entry.demandOk = demand.inactiveFrames === 0 && demand.heldFrames === 0 && demand.resumedFrames > 0;
  results.push(entry);
  await page.close();
}

await browser.close();
await server.close();
writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  const lesson = r.views.lesson;
  console.log(`${r.viewport}: lesson drawCalls=${lesson.drawCalls} triangles=${lesson.triangles} fps=${lesson.fpsEstimate} dpr=${lesson.dpr} tiers=${JSON.stringify(lesson.assetTiers)} demand=${r.demandOk ? 'ok' : 'FAIL'} ${JSON.stringify(r.demand)}${r.errors.length ? ` errors=${r.errors.join(' | ')}` : ''}`);
}
console.log(`screenshots and results.json in ${outDir}`);
process.exitCode = results.every((r) => r.demandOk && r.errors.length === 0) ? 0 : 1;
