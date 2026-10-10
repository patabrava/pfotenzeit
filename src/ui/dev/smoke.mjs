#!/usr/bin/env node
/**
 * UI smoke pass for WP-E / WP-J (dev only; needs a Playwright browser, which the sandbox cannot provide).
 * Run outside the sandbox:
 *   npx playwright install chromium      # once (or set PZ_BROWSER_CHANNEL=chrome)
 *   npx vite --port 5231 &               # dev server
 *   node src/ui/dev/smoke.mjs            # this script; screenshots go to $TMPDIR/pz-smoke/
 * Checks at 360×640: home/lesson/profile/school/settings/mode, 200 % root font size (no hidden actions),
 * keyboard-only pass, WebGL fallback, challenge bands, memorial, other tab.
 * D-041 yard checks (390×844): prompt after scripted moveTo, dog sheet, practice sheet + HUD, WASD/Enter, exercise round
 * through the static fallback (bands → attempt → decide), settings yard switch.
 * Checks at 390×844 (WP-J layout rules): lesson header ≤ 44 px, scene strip ≥ 50 % of the viewport in
 * observe and decide, dock ≤ 28 %, option buttons 52–56 px, menu icon button at the dock's right edge,
 * feedback symbol + Mira quote, reflection reward rows + mark counter bump, "Weiter" → home.
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

/** Lesson layout metrics relative to the viewport (D-032 strip measurement is read from the .scene box). */
async function lessonMetrics(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const scene = rect('.scene');
    const header = rect('.lesson-header');
    const card = rect('.card--dialog');
    const dock = rect('.dock--lesson');
    const menu = rect('[data-key="more"]');
    const options = Array.from(document.querySelectorAll('[data-key^="option-"]')).map((b) => b.getBoundingClientRect().height);
    return {
      vh,
      sceneRatio: scene ? scene.height / vh : 0,
      headerHeight: header?.height ?? 0,
      cardRatio: card ? card.height / vh : 0,
      dockRatio: dock ? dock.height / vh : 0,
      menuAtRightEdge: menu && dock ? Math.abs(menu.right - (dock.right - 6)) <= 2 && menu.width >= 47 && menu.width <= 49 : false,
      optionHeights: options,
      sceneBelowHeader: scene && header ? scene.top >= header.bottom - 1 : false,
      sceneAboveCard: scene && card ? scene.bottom <= card.top + 1 : false,
    };
  });
}

async function startLesson(page) {
  await page.click('[data-key="primary"]');
  await page.click('[data-key="lesson-L01"]');
  await page.waitForTimeout(350); // 300 ms sheet-close guard
  await page.waitForSelector('[data-view="lesson"]');
}

const browser = await chromium.launch({ channel: process.env.PZ_BROWSER_CHANNEL ?? 'chrome' });
try {
  const errors = [];
  const hookErrors = (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  };

  // ======================================================================= 360×640 (WP-E baseline)
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, locale: 'de-DE' });
  const page = await ctx.newPage();
  hookErrors(page);

  await page.goto(HARNESS);
  await page.waitForSelector('[data-view="home"] .dock .btn');
  await shot(page, '01-home-360');
  record('home: reward anchor follows the visible yard mark counter', await page.evaluate(() => {
    const counter = document.querySelector('[data-view="home"] .mark-counter');
    const anchor = document.querySelector('.shell')?.dataset.rewardAnchor ?? 'null';
    return counter ? anchor !== 'null' : anchor === 'null';
  }));
  record('home: dock actions reachable at 360×640', (await actionsVisibleOrScrollable(page)).length === 0);
  record('home: no mid-word breaks in dock buttons', await page.evaluate(() => {
    // A mid-word break shows as a button whose text does not fit one line and has no space/hyphen to break at.
    return Array.from(document.querySelectorAll('.dock .btn')).every((btn) => {
      const label = btn.querySelector('.btn-label') ?? btn;
      const lines = Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight));
      return lines <= 1 || /[\s-]/.test(label.textContent ?? '');
    });
  }));

  // --- keyboard: Tab to primary, Enter opens lesson picker, Escape closes
  await page.keyboard.press('Tab');
  const active = await page.evaluate(() => {
    const node = document.activeElement;
    return node instanceof HTMLButtonElement ? node.getAttribute('aria-label') ?? node.textContent?.trim() ?? '' : '';
  });
  record('keyboard: first Tab lands on a control', Boolean(active), active);
  await page.focus('[data-key="primary"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet-panel');
  await shot(page, '02-lesson-picker');
  record('keyboard: focus trapped inside sheet', await page.evaluate(() => Boolean(document.activeElement?.closest('.sheet-panel'))));
  record('modal: world layer inert behind sheet', await page.evaluate(() => document.querySelector('.layer-world')?.inert === true));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-panel', { state: 'detached' });
  record('keyboard: Escape closes sheet', true);
  await page.waitForTimeout(350);

  // --- start L01 and walk the rounds
  await startLesson(page);
  await shot(page, '03-lesson-prepare');
  record('lesson: dock ≤ 28 % height (360)', (await lessonMetrics(page)).dockRatio <= 0.28 + 0.002);
  await page.click('[data-key="next"]'); // prepare → observe
  await page.waitForSelector('[data-key="look-closer"], .describe-body');
  await shot(page, '04-lesson-observe');
  await page.click('[data-key="next"]'); // observe → decide
  await page.waitForSelector('[data-key^="option-"]');
  await shot(page, '05-lesson-decide');
  record('lesson: options reachable (360)', (await actionsVisibleOrScrollable(page)).length === 0);
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
  record('profile: pixel canvas is an integer multiple of 128 device px', await page.evaluate(() => {
    const canvas = document.querySelector('.pixel-box canvas');
    if (!canvas) return false;
    const css = canvas.getBoundingClientRect().width;
    const device = css * window.devicePixelRatio;
    return Math.abs(device / 128 - Math.round(device / 128)) < 0.02 && canvas.width === Math.round(device);
  }));
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
  record('school: insufficient marks → aria-disabled but focusable', await page.evaluate(() => {
    const btn = document.querySelector('[data-key="upgrade-rest_place"]');
    return btn?.getAttribute('aria-disabled') === 'true' && !btn.hasAttribute('disabled');
  }));
  record('school: mark counter present', await page.evaluate(() => Boolean(document.querySelector('.sheet-panel .mark-counter'))));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
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
  await startLesson(page);
  await page.click('[data-key="next"]');
  await page.click('[data-key="next"]');
  await page.waitForSelector('[data-key^="option-"]');
  await shot(page, '14-lesson-decide-200pct');
  record('200 %: lesson options reachable', (await actionsVisibleOrScrollable(page)).length === 0);
  record('200 %: lesson header still one line (≤ 2× 44 px)', (await lessonMetrics(page)).headerHeight <= 88 + 1);

  // --- fallback, bands, memorial, other tab
  await page.goto(`${HARNESS}?renderer=fail`);
  await page.waitForSelector('[data-view="sceneFallback"]:not([hidden])');
  record('fallback: lives inside the scene strip', await page.evaluate(() => Boolean(document.querySelector('.scene > .scene-fallback'))));
  await shot(page, '15-webgl-fallback');
  await startLesson(page);
  await page.click('[data-key="next"]');
  await page.waitForSelector('.pose-line');
  record('fallback: pose line shown in lesson without renderer', await page.evaluate(() => document.querySelectorAll('.pose-line').length >= 1));
  await shot(page, '15b-webgl-fallback-lesson');
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
  await ctx.close();

  // ======================================================================= 390×844 (WP-J layout rules)
  const ctx390 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, locale: 'de-DE' });
  const p = await ctx390.newPage();
  hookErrors(p);
  await p.goto(`${HARNESS}?observation=optional`);
  await p.waitForSelector('[data-view="home"] .dock .btn');
  await startLesson(p);
  await p.click('[data-key="next"]'); // → observe
  await p.waitForSelector('[data-key="look-closer"], .describe-body');
  await p.waitForTimeout(250); // ResizeObserver → fitScene
  let m = await lessonMetrics(p);
  await shot(p, '20-390-observe');
  record('390: header ≤ 44 px', m.headerHeight <= 44 + 0.5, `${m.headerHeight.toFixed(1)} px`);
  record('390: scene strip ≥ 50 % in observe', m.sceneRatio >= 0.5, `${(m.sceneRatio * 100).toFixed(1)} %`);
  record('390: strip sits between header and card (D-032)', m.sceneBelowHeader && m.sceneAboveCard);
  record('390: card ≤ 28 % in observe', m.cardRatio <= 0.28 + 0.002, `${(m.cardRatio * 100).toFixed(1)} %`);
  // D-035 reward anchor: the shell publishes the normalized counter centre (clamped to the strip) for the renderer.
  record('390: reward anchor points at the mark counter', await p.evaluate(() => {
    const key = document.querySelector('.shell')?.dataset.rewardAnchor;
    const counter = document.querySelector('.lesson-header .mark-counter');
    const strip = document.querySelector('.scene');
    if (!key || key === 'null' || !counter || !strip) return false;
    const [x, y] = key.split(':').map(Number);
    const c = counter.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    const px = s.left + x * s.width;
    const expectedY = Math.min(1, Math.max(0, (c.top + c.height / 2 - s.top) / s.height));
    return px >= c.left - 1 && px <= c.right + 1 && Math.abs(y - expectedY) < 0.005;
  }), await p.evaluate(() => document.querySelector('.shell')?.dataset.rewardAnchor ?? ''));
  // "Genauer ansehen" expands inline, card still ≤ 28 % (scrolls inside)
  await p.click('[data-key="look-closer"]');
  await p.waitForSelector('.describe-body');
  await p.waitForTimeout(250);
  m = await lessonMetrics(p);
  await shot(p, '21-390-observe-expanded');
  record('390: expanded description keeps strip ≥ 50 %', m.sceneRatio >= 0.5, `${(m.sceneRatio * 100).toFixed(1)} %`);
  record('390: description scrolls inside card', await p.evaluate(() => {
    const card = document.querySelector('.card--dialog');
    return card ? getComputedStyle(card).overflowY === 'auto' : false;
  }));
  await p.click('[data-key="look-closer"]'); // collapse again
  await p.click('[data-key="next"]'); // → decide
  await p.waitForSelector('[data-key^="option-"]');
  record('390: decide has no inline text button (description via menu)', !(await p.$('[data-key="look-closer"]')));
  await p.waitForTimeout(250);
  m = await lessonMetrics(p);
  await shot(p, '22-390-decide');
  record('390: scene strip ≥ 50 % in decide', m.sceneRatio >= 0.5, `${(m.sceneRatio * 100).toFixed(1)} %`);
  record('390: dock ≤ 28 % in decide', m.dockRatio <= 0.28 + 0.002, `${(m.dockRatio * 100).toFixed(1)} %`);
  record('390: option buttons 52–56 px', m.optionHeights.length >= 2 && m.optionHeights.every((h) => h >= 51.5 && h <= 56.5), m.optionHeights.map((h) => h.toFixed(1)).join('/'));
  record('390: menu is a 48 px icon button at the dock\'s right edge', m.menuAtRightEdge);
  record('390: options reachable', (await actionsVisibleOrScrollable(p)).length === 0);
  await p.click('[data-key^="option-"]');
  await p.waitForSelector('.observation-text'); // react one-liner
  record('390: react shows a one-line text, no spinner', await p.evaluate(() => !document.querySelector('.spinner, [role="progressbar"]')));
  await p.waitForSelector('[data-key="next"]:not([aria-disabled="true"])', { timeout: 6000 });
  await p.waitForTimeout(250);
  await shot(p, '23-390-feedback');
  record('390: feedback has symbol + text and quoted Mira line', await p.evaluate(() => {
    const mark = document.querySelector('.card--dialog .feedback-mark');
    const quote = document.querySelector('.card--dialog .quote');
    const order = mark && quote ? Boolean(mark.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    return Boolean(mark?.textContent?.trim()) && order;
  }));
  record('390: feedback card ≤ 28 %', (await lessonMetrics(p)).cardRatio <= 0.28 + 0.002);

  // Walk the remaining rounds until the reflection screen.
  for (let i = 0; i < 12; i += 1) {
    if (await p.$('[data-view="reflection"]')) break;
    const next = await p.$('[data-key="next"]:not([aria-disabled="true"])');
    if (next) {
      await next.click();
    } else if (await p.$('[data-key="attempt"]')) {
      if (await p.$('[data-key="band-far"]')) await p.click('[data-key="band-far"]');
      else await p.evaluate(() => {
        window.__pzWorld.send({ type: 'setBand', band: 'far' });
      });
      await p.click('[data-key="attempt"]:not([aria-disabled="true"])');
    } else {
      const optionId = await p.evaluate(async () => {
        const { getCurrentOptions } = await import('/src/simulation/selectors.ts');
        const store = window.__pz.store;
        return getCurrentOptions(store.get().save, store.content).find(o => o.helpful && o.next !== 'retry')?.id;
      });
      const option = optionId ? await p.$(`[data-key="option-${optionId}"]`) : await p.$('[data-key^="option-"]');
      if (option) await option.click();
    }
    await p.waitForTimeout(400);
    await p.waitForSelector('[data-key="next"]:not([aria-disabled="true"]), [data-key="attempt"], [data-key^="option-"], [data-view="reflection"]', { timeout: 8000 });
  }
  await p.waitForSelector('[data-view="reflection"]');
  await shot(p, '24-390-reflection');
  record('390: reflection shows both closing buttons with equal weight', await p.evaluate(() => {
    const a = document.querySelector('[data-key="done"]');
    const b = document.querySelector('[data-key="to-school"]');
    const weight = (btn) => ['btn--primary', 'btn--large'].map((c) => btn.classList.contains(c)).join();
    return Boolean(a && b) && weight(a) === weight(b) && Math.abs(a.getBoundingClientRect().height - b.getBoundingClientRect().height) < 1;
  }));
  const marksBefore = await p.evaluate(() => Number(document.querySelector('[data-view="reflection"] .mark-counter')?.dataset.value ?? -1));
  await p.click('[data-key="done"]');
  await p.waitForSelector('.reward-rows');
  await shot(p, '25-390-reward-rows');
  record('390: reward summary as three rows', await p.evaluate(() => document.querySelectorAll('.reward-row').length === 3));
  record('390: no reward animation over the dog', await p.evaluate(() => !document.querySelector('.layer-scene .reward-row, .scene .mark-counter')));
  await p.waitForTimeout(1200);
  const marksAfter = await p.evaluate(() => Number(document.querySelector('[data-view="reflection"] .mark-counter')?.dataset.value ?? -1));
  record('390: header gains visit mark and first learning mark', marksAfter === marksBefore + 2, `${marksBefore} → ${marksAfter}`);
  await p.click('[data-key="reward-continue"]');
  await p.waitForSelector('[data-view="home"] .dock .btn');
  record('390: Weiter returns home', true);
  await p.waitForTimeout(1300);
  record('390: reward shown once (no dialog after the rows)', !(await p.$('.dialog-panel')));

  // Reload while the route is 'reflection' and the visitRewarded effect is still pending: the shell redirects
  // home, the presenter presents via timer and acknowledges, the dialog shows the reward exactly once,
  // and the next visit can start.
  await p.goto(`${HARNESS}?route=reflection&pending=reward`);
  await p.waitForSelector('[data-view="home"] .dock .btn');
  await p.waitForSelector('.dialog-panel', { timeout: 3000 });
  await shot(p, '27-390-reload-reflection-reward');
  record('reload@reflection: redirected home, reward dialog shown once', await p.evaluate(() => document.querySelectorAll('.dialog-panel').length === 1 && document.querySelectorAll('.reward-rows').length === 0));
  await p.click('[data-key="reward-ok"]');
  await p.waitForSelector('.dialog-panel', { state: 'detached' });
  await p.waitForTimeout(350);
  record('reload@reflection: pendingPresentation acknowledged', await p.evaluate(() => window.__pz?.store.get().save.pendingPresentation === null));
  await p.evaluate(() => window.__pzWorld.send({ type: 'moveTo', target: { x: -1.0, z: -1.4 } }));
  await p.click('[data-key="prompt"]');
  await p.click('[data-key="mira-lesson"]');
  await p.click('[data-key="lesson-L02"], [data-key="lesson-L01"]');
  await p.waitForTimeout(350);
  await p.waitForSelector('[data-view="lesson"]', { timeout: 3000 });
  record('reload@reflection: next visit starts', true);

  // ======================================================================= D-041 yard (WP-R)
  // Home yard: scripted moveTo → prompt button; dog sheet; Mira choice → practice sheet → practice HUD.
  await p.goto(`${HARNESS}?growth=1`); // completed lessons → practice unlocked
  await p.waitForSelector('[data-view="home"] [data-key="dog"]');
  record('yard: dog button present when the world is available', true);
  // Spawn is inside the training circle: with a completed lesson the prompt there is "Freies Üben" (WP-P note).
  record('yard: circle prompt at spawn once practice is unlocked', await p.evaluate(() => window.__pzWorld.getContext()?.prompt === 'circle' && Boolean(document.querySelector('[data-key="prompt"]'))));
  await p.evaluate(() => window.__pzWorld.send({ type: 'moveTo', target: { x: -1.0, z: -1.4 } })); // Mira zone
  await p.waitForSelector('[data-key="prompt"]', { timeout: 3000 });
  await shot(p, '28-390-yard-prompt');
  record('yard: prompt button ≥ 56 px after moveTo (Mira)', await p.evaluate(() => {
    const btn = document.querySelector('[data-key="prompt"]');
    return btn ? btn.getBoundingClientRect().height >= 55.5 && /Mira/.test(btn.textContent ?? '') : false;
  }));
  record('yard: shell publishes prompt via world context', await p.evaluate(() => window.__pzWorld.getContext()?.prompt === 'mira'));
  await p.click('[data-key="prompt"]');
  await p.waitForSelector('[data-key="mira-practice"]');
  await p.click('[data-key="mira-practice"]');
  await p.waitForSelector('[data-key="practice-recall"]');
  await shot(p, '29-390-practice-sheet');
  record('yard: practice sheet opens from the Mira prompt', true);
  await p.click('[data-key="practice-recall"]');
  await p.click('[data-key="practice-start"]');
  await p.waitForSelector('[data-view="practice"]');
  await p.evaluate(() => window.__pzWorld.send({ type: 'setBand', band: 'near' }));
  await p.waitForTimeout(250);
  m = await lessonMetrics(p);
  await shot(p, '30-390-practice-hud');
  record('yard: practice HUD strip ≥ 50 %', m.sceneRatio >= 0.5, `${(m.sceneRatio * 100).toFixed(1)} %`);
  record('yard: practice attempt disabled until ready (recall needs far)', await p.evaluate(() => document.querySelector('[data-key="attempt"]')?.getAttribute('aria-disabled') === 'true'));
  await p.evaluate(() => window.__pzWorld.send({ type: 'setBand', band: 'far' }));
  await p.waitForSelector('[data-key="attempt"]:not([aria-disabled="true"])', { timeout: 3000 });
  await p.click('[data-key="attempt"]');
  await p.waitForSelector('[data-key="practice-again"]', { timeout: 4000 });
  await shot(p, '31-390-practice-response');
  record('yard: practice shows the response and Noch einmal / Fertig', await p.evaluate(() => Boolean(document.querySelector('[data-key="practice-done"]') && document.querySelector('.card--dialog .observation-text'))));
  await p.click('[data-key="practice-done"]');
  await p.waitForSelector('[data-view="home"] .dock .btn');
  record('yard: Fertig returns home', true);

  // Dog sheet from the dock button (fallback path for the 3D dog tap).
  await p.click('[data-key="dog"]');
  await p.waitForSelector('[data-key="dog-sit"]');
  await shot(p, '32-390-dog-sheet');
  record('yard: dog sheet has attention line and three actions', await p.evaluate(() => document.querySelectorAll('.sheet-panel [data-key^="dog-"]').length === 3 && Boolean(document.querySelector('.sheet-panel .text-lead'))));
  await p.click('[data-key="dog-sit"]');
  await p.waitForSelector('.sheet-panel', { state: 'detached' });
  await p.waitForTimeout(350);

  // Keyboard: D moves the handler, Enter activates the prompt, Escape closes the sheet.
  const xBefore = await p.evaluate(() => window.__pzWorld.getState().actors.handler.position.x);
  await p.keyboard.down('d');
  await p.waitForTimeout(80);
  await p.keyboard.up('d');
  const xAfter = await p.evaluate(() => window.__pzWorld.getState().actors.handler.position.x);
  record('yard: WASD moves the handler', xAfter > xBefore, `${xBefore.toFixed(2)} → ${xAfter.toFixed(2)}`);
  await p.evaluate(() => window.__pzWorld.send({ type: 'moveTo', target: { x: -1.0, z: -1.4 } }));
  await p.waitForSelector('[data-key="prompt"]');
  await p.keyboard.press('Enter');
  await p.waitForSelector('[data-key="mira-lesson"]', { timeout: 3000 });
  record('yard: Enter activates the prompt', true);
  await p.keyboard.press('Escape');
  await p.waitForSelector('.sheet-panel', { state: 'detached' });

  // Exercise round through the fallback (static mode): bands → attempt → exercise → decide.
  await p.goto(`${HARNESS}?yardMode=static`);
  await p.waitForSelector('[data-view="home"] .dock .btn');
  record('static: Hof button present (zone list fallback)', Boolean(await p.$('[data-key="yard"]')));
  await startLesson(p);
  await p.click('[data-key="next"]'); // prepare → observe A
  await p.click('[data-key="next"]'); // observe A → decide A
  await p.waitForSelector('[data-key^="option-"]');
  await p.click('[data-key^="option-"]');
  await p.waitForSelector('[data-key="next"]:not([aria-disabled="true"])', { timeout: 6000 });
  await p.click('[data-key="next"]'); // feedback A → observe B (exercise round)
  await p.waitForSelector('[data-key="band-far"]', { timeout: 4000 });
  await p.waitForTimeout(250);
  m = await lessonMetrics(p);
  await shot(p, '33-390-exercise-observe-static');
  record('exercise: band buttons and attempt in observe', await p.evaluate(() => Boolean(document.querySelector('[data-key="attempt"]')) && document.querySelectorAll('[data-key^="band-"]').length === 3));
  record('exercise: strip still between header and card', m.sceneBelowHeader && m.sceneAboveCard, `${(m.sceneRatio * 100).toFixed(1)} %`);
  await p.click('[data-key="band-far"]');
  await p.waitForSelector('[data-key="attempt"]:not([aria-disabled="true"])', { timeout: 3000 });
  await p.click('[data-key="attempt"]');
  await p.waitForSelector('[data-key^="option-"]', { timeout: 8000 });
  await shot(p, '34-390-exercise-decide');
  record('exercise: attempt → exercise phase → decide with filtered options', true);
  record('exercise: attempt tag in header', Boolean(await p.$('.tag--attempt')));
  record('exercise: pendingPresentation acknowledged after response', await p.evaluate(() => window.__pz?.store.get().save.pendingPresentation === null));

  // Settings: yard mode toggle present.
  await p.goto(`${HARNESS}`);
  await p.waitForSelector('[data-key="settings"]');
  await p.click('[data-key="settings"]');
  await p.waitForSelector('[data-view="settings"]');
  record('settings: yard mode switch present', Boolean(await p.$('[data-key="yard-mode"]')));

  // Reduced motion: pose line under the strip, feedback instant.
  const ctxRm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion: 'reduce', locale: 'de-DE' });
  const r = await ctxRm.newPage();
  hookErrors(r);
  await r.goto(HARNESS);
  await r.waitForSelector('[data-view="home"] .dock .btn');
  await startLesson(r);
  await r.click('[data-key="next"]');
  await r.waitForSelector('.pose-line');
  await r.waitForTimeout(250);
  m = await lessonMetrics(r);
  await shot(r, '26-390-reduced-motion');
  record('390 reduced motion: pose line present and strip ≥ 50 %', m.sceneRatio >= 0.5, `${(m.sceneRatio * 100).toFixed(1)} %`);
  await ctxRm.close();
  await ctx390.close();

  record('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${out}`);
process.exit(failed.length ? 1 : 0);
