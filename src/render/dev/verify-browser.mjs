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
 *   node src/render/dev/verify-browser.mjs --manifest candidates   # staged textured candidates (D-036)
 *   node src/render/dev/verify-browser.mjs --review a=<spec> b=<spec> --out <dir>   # hero review (WP-M)
 *   The default run also does the D-041 yard pass (scene.html?yard=1 at 390×844 and 844×390): screenshots at
 *   spawn, after a tap-to-move to the gate and far apart; asserts share ≥ 12 % at spawn, the tap moves the
 *   handler and frames stop ~4 s after the stop. Written to yard.json next to results.json.
 *     one contact sheet per camera × light (review_<cam>_<light>.png, turntable frames at 0/90/180/270 for
 *     closeup_portrait) plus review.json with triangles, draw calls, texture bytes, share, margin per subject.
 *
 * Per viewport it also records the D-034 framing report (height share, margin, azimuth) for the
 * three views, a lesson-strip pass (?strip=1, the D-032 strip between header and dialog) and the
 * D-035 present() timings (decision, visitRewarded, upgradeBought, care meal; normal and reduced).
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
const reviewIndex = args.indexOf('--review');
const reviewArg = (name) => {
  const hit = args.find((x) => x.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
};
const manifestIndex = args.indexOf('--manifest');
const manifestParam = manifestIndex >= 0 ? `&manifest=${encodeURIComponent(args[manifestIndex + 1])}` : '';
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = args.includes('--yard-only') ? [] : [
  [360, 640],
  [390, 844],
  [430, 932],
  [844, 390],
  [1440, 900],
];
const VIEWS = ['school', 'lesson', 'closeup'];

const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${server.config.server.port}/`;
const url = `${base}src/render/dev/scene.html?controls=0${manifestParam}`;
const stripUrl = `${base}src/render/dev/scene.html?controls=0&strip=1${manifestParam}`;

let browser;
if (reviewIndex >= 0) {
  const a = reviewArg('a') ?? 'procedural:dog.nala.puppy';
  const b = reviewArg('b') ?? 'candidates:dog.nala.puppy';
  const pose = reviewArg('pose');
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  } catch {
    browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  }
  const CAMS = { front: [480, 560], side: [480, 560], closeup_portrait: [390, 844], lesson_strip: [390, 232], landscape: [844, 390] };
  const review = { a, b, pose: pose ?? 'idle_relaxed', sheets: [] };
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [cam, [pw, ph]] of Object.entries(CAMS)) {
    for (const light of ['neutral', 'courtyard']) {
      const page = await browser.newPage({ viewport: { width: pw * 2 + 32, height: ph + 72 }, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const q = `review=1&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&cam=${cam}&light=${light}${pose ? `&pose=${encodeURIComponent(pose)}` : ''}`;
      await page.goto(`${base}src/render/dev/scene.html?${q}`);
      await page.waitForFunction(() => window.__pfotenzeitReview, null, { timeout: 30000 });
      await page.evaluate(() => window.__pfotenzeitReview.ready());
      await sleepMs(600);
      const file = `review_${cam}_${light}.png`;
      await page.screenshot({ path: join(outDir, file), fullPage: true });
      const entry = { cam, light, file, metrics: await page.evaluate(() => window.__pfotenzeitReview.metrics()), errors, frames: [] };
      if (cam === 'closeup_portrait') {
        for (const deg of [0, 90, 180, 270]) {
          await page.evaluate((d) => window.__pfotenzeitReview.setSpin(d), deg);
          await sleepMs(350);
          const f = `review_${cam}_${light}_turn${deg}.png`;
          await page.screenshot({ path: join(outDir, f), fullPage: true });
          entry.frames.push(f);
        }
      }
      review.sheets.push(entry);
      await page.close();
    }
  }
  await browser.close();
  await server.close();
  writeFileSync(join(outDir, 'review.json'), JSON.stringify(review, null, 2));
  for (const s of review.sheets) {
    const fmt = (m) => `${m.label} [${m.tier}] ${m.triangles} tris, ${m.actorDrawCalls} model calls (${m.drawCalls} scene), ${(m.textureBytes / 1024 / 1024).toFixed(2)} MB, share ${m.heightShare === null ? '-' : (m.heightShare * 100).toFixed(1) + '%'}, margin ${m.minMargin === null ? '-' : (m.minMargin * 100).toFixed(1) + '%'}`;
    console.log(`${s.cam}/${s.light}: A ${fmt(s.metrics.a)} | B ${fmt(s.metrics.b)}${s.errors.length ? ` errors=${s.errors.join(' | ')}` : ''}`);
  }
  console.log(`review sheets and review.json in ${outDir}`);
  process.exitCode = review.sheets.every((s) => s.errors.length === 0) ? 0 : 1;
  process.exit();
}
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
    await sleep(900);
    await page.screenshot({ path: join(outDir, `${width}x${height}_${view}.png`) });
    entry.views[view] = await page.evaluate(() => window.__pfotenzeitDev.metrics());
    entry.views[view].framing = await page.evaluate(() => window.__pfotenzeitDev.framing());
  }
  // D-035 choreography timings (ms) with and without reduced motion.
  entry.timings = await page.evaluate(async () => {
    const api = window.__pfotenzeitDev;
    const out = {};
    api.set({ view: 'lesson', hold: false });
    await new Promise((r) => setTimeout(r, 500));
    const time = async (name, effect, reducedMotion) => {
      const t0 = performance.now();
      await api.renderer.present(effect, { maxDurationMs: 6000, reducedMotion });
      out[name] = Math.round(performance.now() - t0);
    };
    await time('decision', { type: 'decision', dogId: 'dog_nala', poseAfter: 'sit', lessonId: 'L01', roundId: 'r1', optionId: 'o1', supported: true }, false);
    await time('decisionReduced', { type: 'decision', dogId: 'dog_nala', poseAfter: 'play_bow', lessonId: 'L01', roundId: 'r1', optionId: 'o1', supported: true }, true);
    await time('visitRewarded', { type: 'visitRewarded', lessonId: 'L01', visitMark: true, bond: false, newlyLearned: [], learningMarks: 0, closure: null }, false);
    await time('upgradeBought', { type: 'upgradeBought', upgradeId: 'rest_place' }, false);
    await time('careMeal', { type: 'care', kind: 'meal', pose: 'eat' }, false);
    await time('careMealReduced', { type: 'care', kind: 'meal', pose: 'eat' }, true);
    api.set({ view: 'lesson' });
    return out;
  });
  // Observation keeps dog body-language moving; inactive and reduced-motion held scenes stop frames.
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
    const observationBefore = api.frames();
    await wait(1000);
    const observationAfter = api.frames();
    api.renderer.setReducedMotion(true);
    api.set({ hold: true });
    await wait(800);
    const holdBefore = api.frames();
    await wait(1000);
    const holdAfter = api.frames();
    api.renderer.setReducedMotion(false);
    api.set({ hold: false });
    return { heldObservationFrames: observationAfter - observationBefore, idleFramesPerHalfSecond: idleAfter - idleBefore, inactiveFrames: inactiveAfter - inactiveBefore, resumedFrames: resumed - inactiveAfter, heldFrames: holdAfter - holdBefore };
  });
  entry.demand = demand;
  entry.demandOk = demand.inactiveFrames === 0 && demand.heldFrames === 0 && demand.resumedFrames > 0 && demand.heldObservationFrames > 0;
  results.push(entry);
  await page.close();

  // Lesson strip (D-032): the scene sized between header and dialog.
  const strip = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await strip.goto(stripUrl);
  await strip.waitForFunction(() => window.__pfotenzeitDev && window.__pfotenzeitDev.renderer.getStatus() === 'ready', null, { timeout: 30000 });
  await strip.evaluate(() => window.__pfotenzeitDev.set({ view: 'lesson' }));
  await sleep(900);
  await strip.screenshot({ path: join(outDir, `${width}x${height}_strip_lesson.png`) });
  entry.strip = await strip.evaluate(() => ({ metrics: window.__pfotenzeitDev.metrics(), framing: window.__pfotenzeitDev.framing(), size: (() => { const r = document.getElementById('root').getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })() }));
  await strip.close();
}

// D-041 yard pass (WP-Q): follow framing, tap-to-move through renderer.pick, zero frames once still.
const yardResults = [];
for (const [width, height] of [[390, 844], [844, 390]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}src/render/dev/scene.html?yard=1${manifestParam}`);
  await page.waitForFunction(() => window.__pfotenzeitYard && window.__pfotenzeitYard.renderer.getStatus() === 'ready', null, { timeout: 30000 });
  await sleep(1200);
  const tag = `${width}x${height}`;
  const framing = () => page.evaluate(() => window.__pfotenzeitYard.renderer.debug.framingReport());
  const handlerPos = () => page.evaluate(() => ({ ...window.__pfotenzeitYard.sim.state.handler }));
  const frames = () => page.evaluate(() => window.__pfotenzeitYard.renderer.debug.frameCount());
  const inFrame = (x, z) => page.evaluate(([px, pz]) => {
    const p = window.__pfotenzeitYard.screenPoint({ x: px, z: pz });
    const r = document.getElementById('root').getBoundingClientRect();
    return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  }, [x, z]);
  const entry = { viewport: tag, errors, spawn: {}, tap: {}, still: {}, far: {} };

  await page.screenshot({ path: join(outDir, `${tag}_yard_spawn.png`) });
  entry.spawn = { framing: await framing(), handlerInFrame: await inFrame(0, 1.2), metrics: await page.evaluate(() => window.__pfotenzeitYard.renderer.getMetrics()) };

  // Tap inside the gate zone: pick → zone → the handler walks there, the dog follows, the camera follows both.
  const before = await handlerPos();
  // Full-height actors can occlude a ground tap or put the gate outside the
  // initial follow frame. Approach it through visible, unoccluded ground taps.
  for (let hop = 0; hop < 6; hop++) {
    const approach = await page.evaluate(() => {
      const api = window.__pfotenzeitYard;
      const goal = { x: 0.2, z: 2.6 };
      const screen = api.screenPoint(goal);
      const hit = api.renderer.pick(screen.x, screen.y);
      if (hit?.kind === 'ground' || hit?.kind === 'zone') return null;
      const h = api.sim.state.handler;
      let best = null;
      let score = Math.hypot(h.x - goal.x, h.z - goal.z) - 0.1;
      for (let x = -1; x <= 1.4; x += 0.2) for (let z = 1.4; z <= 2.6; z += 0.2) {
        const point = { x, z };
        const distance = Math.hypot(x - goal.x, z - goal.z);
        if (distance >= score) continue;
        const s = api.screenPoint(point);
        const pick = api.renderer.pick(s.x, s.y);
        if (pick?.kind !== 'ground' && pick?.kind !== 'zone') continue;
        score = distance;
        best = { screen: s, point };
      }
      return best;
    });
    if (!approach) break;
    await page.mouse.click(approach.screen.x, approach.screen.y);
    await page.waitForFunction((p) => {
      const h = window.__pfotenzeitYard.sim.state.handler;
      return Math.hypot(h.x - p.x, h.z - p.z) < 0.05;
    }, approach.point, { timeout: 15000 });
    await sleep(400);
  }
  const target = await page.evaluate(() => window.__pfotenzeitYard.screenPoint({ x: 0.2, z: 2.6 }));
  const pick = await page.evaluate((t) => window.__pfotenzeitYard.renderer.pick(t.x, t.y), target);
  await page.mouse.click(target.x, target.y);
  await sleep(500);
  const moving = await handlerPos();
  const framesMovingStart = await frames();
  await sleep(500);
  const framesMovingEnd = await frames();
  await sleep(1500);
  await page.screenshot({ path: join(outDir, `${tag}_yard_gate.png`) });
  const after = await handlerPos();
  entry.tap = {
    pick,
    moved: Math.hypot(moving.x - before.x, moving.z - before.z) > 0.1,
    arrived: Math.hypot(after.x - 0.2, after.z - 2.6) < 0.1,
    framesWhileMoving: framesMovingEnd - framesMovingStart,
    framing: await framing(),
    handlerInFrame: await inFrame(after.x, after.z),
    prompt: await page.evaluate(() => window.__pfotenzeitYard.renderer.debug.world()?.prompt?.zoneId ?? null),
  };

  // Still: ~4 s after the stop the yard is held and no frames are requested.
  await sleep(4500);
  const stillStart = await frames();
  await sleep(1000);
  const stillEnd = await frames();
  entry.still = { held: await page.evaluate(() => window.__pfotenzeitYard.renderer.debug.worldHeld()), framesPerSecond: stillEnd - stillStart };

  // Far apart: handler in the quiet corner, dog stays in the sniff corner; both must be inside.
  await page.evaluate(() => {
    const s = window.__pfotenzeitYard.sim.state;
    s.dogFollows = false;
    s.handler = { x: -2.4, z: 2.2, facing: 150, speed: 0, target: null };
    s.dog = { x: 2.3, z: -1.7, facing: 90, speed: 0, pose: 'sniff' };
    s.restPose = 'sniff';
  });
  await sleep(1200);
  await page.screenshot({ path: join(outDir, `${tag}_yard_far.png`) });
  entry.far = { framing: await framing(), handlerInFrame: await inFrame(-2.4, 2.2), dogInFrame: await inFrame(2.3, -1.7) };

  entry.ok =
    errors.length === 0 &&
    (entry.spawn.framing?.heightShare ?? 0) >= 0.12 &&
    entry.spawn.handlerInFrame &&
    entry.tap.moved &&
    entry.tap.framesWhileMoving > 0 &&
    entry.tap.handlerInFrame &&
    entry.still.framesPerSecond === 0 &&
    entry.far.handlerInFrame &&
    entry.far.dogInFrame;
  yardResults.push(entry);
  await page.close();
}
writeFileSync(join(outDir, 'yard.json'), JSON.stringify(yardResults, null, 2));

await browser.close();
await server.close();
writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
const pct = (f) => (f ? `${(f.heightShare * 100).toFixed(1)}% (margin ${(f.minMargin * 100).toFixed(1)}%, az ${f.azimuthDeg.toFixed(0)}°)` : '–');
for (const r of results) {
  const lesson = r.views.lesson;
  console.log(`${r.viewport}: lesson drawCalls=${lesson.drawCalls} triangles=${lesson.triangles} fps=${lesson.fpsEstimate} dpr=${lesson.dpr} tex=${(lesson.textureBytesEstimate / 1024 / 1024).toFixed(2)}MB tiers=${JSON.stringify(lesson.assetTiers)} demand=${r.demandOk ? 'ok' : 'FAIL'} ${JSON.stringify(r.demand)}${r.errors.length ? ` errors=${r.errors.join(' | ')}` : ''}`);
  console.log(`  D-034 closeup ${pct(r.views.closeup.framing)} | lesson ${pct(lesson.framing)} | school ${pct(r.views.school.framing)} | strip ${r.strip.size} lesson ${pct(r.strip.framing)}`);
  console.log(`  D-035 timings ms ${JSON.stringify(r.timings)}`);
}
for (const y of yardResults) {
  console.log(`${y.viewport} yard: spawn ${pct(y.spawn.framing)} drawCalls=${y.spawn.metrics?.drawCalls} | tap pick=${JSON.stringify(y.tap.pick)} moved=${y.tap.moved} arrived=${y.tap.arrived} framesWhileMoving=${y.tap.framesWhileMoving} prompt=${y.tap.prompt} gate ${pct(y.tap.framing)} | still held=${y.still.held} frames/s=${y.still.framesPerSecond} | far ${pct(y.far.framing)} handlerIn=${y.far.handlerInFrame} dogIn=${y.far.dogInFrame} → ${y.ok ? 'ok' : 'FAIL'}${y.errors.length ? ` errors=${y.errors.join(' | ')}` : ''}`);
}
console.log(`screenshots, results.json and yard.json in ${outDir}`);
process.exitCode = results.every((r) => r.demandOk && r.errors.length === 0) && yardResults.every((y) => y.ok) ? 0 : 1;
