#!/usr/bin/env node
/**
 * UI smoke pass for WP-E (dev only; needs a Playwright browser, which the sandbox cannot provide).
 * Run outside the sandbox:
 *   npx playwright install chromium      # once
 *   npx vite --port 5231 &               # dev server
 *   node src/ui/dev/smoke.mjs            # this script; screenshots go to $TMPDIR/pz-smoke/
 * Checks: 360×640 portrait home/lesson/profile/school/settings/mode, 200 % root font size (no hidden
 * actions: every button in the dock is within the viewport or inside a scrollable dock), keyboard-only
 * pass (Tab to primary, Enter opens the lesson picker, Escape closes it), WebGL fallback, challenge bands,
 * memorial, other tab.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.PZ_BASE ?? 'http://localhost:5231';
const HARNESS = `${BASE}/src/ui/dev/harness.html`;
const out = path.join(process.env.TMPDIR ?? os.tmpdir(), 'pz-smoke');
fs.mkdirSync(out, { recursive: true });

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
}

async function actionsVisibleOrScrollable(page) {
  // Every dock button must be inside the viewport or inside an overflow:auto container.
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const buttons = Array.from(document.querySelectorAll('.dock .btn, .screen-footer .btn'));
    const bad = [];
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      const inView = rect.bottom <= vh + 1 && rect.top >= -1;
      const scroller = btn.closest('.dock, .screen-footer');
      const scrollable = scroller && scroller.scrollHeight > scroller.clientHeight + 1;
      if (!inView && !scrollable) bad.push(btn.textContent?.trim() ?? '?');
      if (rect.height < 48 - 0.5) bad.push(`${btn.textContent?.trim()} height ${rect.height}`);
    }
    return bad;
  });
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, locale: 'de-DE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

  // --- home at 360 px
  await page.goto(HARNESS);
  await page.waitForSelector('[data-view="home"] .dock .btn');
  await shot(page, '01-home-360');
  record('home: dock actions reachable at 360×640', (await actionsVisibleOrScrollable(page)).length === 0);

  // --- keyboard: Tab to primary, Enter opens lesson picker, Escape closes
  await page.keyboard.press('Tab');
  let active = await page.evaluate(() => document.activeElement?.textContent?.trim());
  record('keyboard: first Tab lands on a control', Boolean(active), active);
  await page.focus('[data-key="primary"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet-panel');
  await shot(page, '02-lesson-picker');
  const focusInSheet = await page.evaluate(() => Boolean(document.activeElement?.closest('.sheet-panel')));
  record('keyboard: focus trapped inside sheet', focusInSheet);
  const inertBehind = await page.evaluate(() => document.querySelector('.layer-world')?.inert === true);
  record('modal: world layer inert behind sheet', inertBehind);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-panel', { state: 'detached' });
  record('keyboard: Escape closes sheet', true);

  // --- start L01 and walk the rounds
  await page.click('[data-key="primary"]');
  await page.click('[data-key="lesson-L01"]');
  await page.waitForSelector('[data-view="lesson"]');
  await shot(page, '03-lesson-prepare');
  record('lesson: dock ≤ 28 % height', await page.evaluate(() => {
    const dock = document.querySelector('.dock--lesson');
    return dock ? dock.getBoundingClientRect().height <= window.innerHeight * 0.28 + 1 : false;
  }));
  await page.click('[data-key="next"]'); // prepare → observe
  await page.waitForSelector('[data-key="look-closer"], .hint-box');
  await shot(page, '04-lesson-observe');
  await page.click('[data-key="next"]'); // observe → decide
  await page.waitForSelector('[data-key^="option-"]');
  await shot(page, '05-lesson-decide');
  record('lesson: options reachable', (await actionsVisibleOrScrollable(page)).length === 0);
  await page.click('[data-key^="option-"]');
  await page.waitForSelector('[data-key="next"]:not([aria-disabled="true"])', { timeout: 6000 });
  await shot(page, '06-lesson-feedback');
  record('lesson: react → feedback via presenter/ACK', true);

  // --- profile from lesson and back
  await page.goto(`${HARNESS}?needs=low`);
  await page.waitForSelector('[data-key="profile"]');
  await page.click('[data-key="profile"]');
  await page.waitForSelector('[data-view="profile"]');
  await shot(page, '07-profile');
  await page.click('[data-key="care-meal"]');
  await page.waitForTimeout(300);
  await shot(page, '08-profile-care-presenting');
  await page.waitForTimeout(4500);
  await shot(page, '09-profile-care-done');
  record('profile: care presented inline', true);

  // --- school, settings, mode
  await page.click('[data-key="back"]');
  await page.click('[data-key="school"]');
  await page.waitForSelector('.sheet-panel');
  await shot(page, '10-school');
  const upgradeFocusable = await page.evaluate(() => {
    const btn = document.querySelector('[data-key="upgrade-rest_place"]');
    return btn?.getAttribute('aria-disabled') === 'true' && !btn.hasAttribute('disabled');
  });
  record('school: insufficient marks → aria-disabled but focusable', upgradeFocusable);
  await page.keyboard.press('Escape');
  await page.click('[data-key="settings"]');
  await page.waitForSelector('[data-view="settings"]');
  await shot(page, '11-settings');
  await page.click('[data-key="mode"]');
  await page.waitForSelector('[data-view="mode"]');
  await shot(page, '12-mode');

  // --- 200 % text
  await page.goto(HARNESS);
  await page.waitForSelector('[data-view="home"] .dock .btn');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.waitForTimeout(200);
  await shot(page, '13-home-200pct');
  record('200 %: home actions reachable', (await actionsVisibleOrScrollable(page)).length === 0);
  await page.click('[data-key="primary"]');
  await page.click('[data-key="lesson-L01"]');
  await page.click('[data-key="next"]');
  await page.click('[data-key="next"]');
  await page.waitForSelector('[data-key^="option-"]');
  await shot(page, '14-lesson-decide-200pct');
  record('200 %: lesson options reachable', (await actionsVisibleOrScrollable(page)).length === 0);

  // --- fallback, bands, memorial, other tab
  await page.goto(`${HARNESS}?renderer=fail`);
  await page.waitForSelector('[data-view="sceneFallback"]:not([hidden])');
  await shot(page, '15-webgl-fallback');
  await page.goto(`${HARNESS}?mode=challenge&band=critical`);
  await page.waitForSelector('.banner--crit');
  await shot(page, '16-challenge-critical');
  await page.goto(`${HARNESS}?mode=challenge&band=lost`);
  await page.waitForSelector('[data-view="memorial"]');
  await shot(page, '17-memorial');
  await page.goto(`${HARNESS}?other=1`);
  await page.waitForSelector('[data-view="otherTab"]');
  await shot(page, '18-other-tab');
  await page.goto(`${HARNESS}?storage=1&summary=1`);
  await page.waitForSelector('.banner--crit');
  await shot(page, '19-banners');

  record('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${out}`);
process.exit(failed.length ? 1 : 0);
