import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = 'verification/ines-yard';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${server.resolvedUrls.local[0]}src/render/dev/scene.html?yard=1`);
    await page.waitForFunction(() => window.__pfotenzeitYard?.renderer.debug.humans().find(h => h.root.name === 'player_actor')?.tier() === 'glb');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${width}-idle.png` });
    const before = await page.evaluate(() => {
      const a = window.__pfotenzeitYard.renderer.debug.humans().find(h => h.root.name === 'player_actor');
      return { name: a.root.userData.characterName, model: a.id, x: a.position().x, z: a.position().z, leg: a.root.getObjectByName('LeftUpLeg').quaternion.toArray() };
    });
    await page.keyboard.down('d');
    await page.waitForFunction(() => window.__pfotenzeitYard.sim.state.handler.x > 0.45);
    await page.evaluate(() => { const { renderer, sim } = window.__pfotenzeitYard; renderer.updateWorld(sim.step(0.1)); renderer.debug.step(0.1); });
    await page.screenshot({ path: `${out}/${width}-walking.png` });
    const after = await page.evaluate(() => {
      const { renderer } = window.__pfotenzeitYard;
      const a = renderer.debug.humans().find(h => h.root.name === 'player_actor');
      const head = a.position(); head.y += a.topHeight();
      const p = renderer.debug.camera.project(head);
      const body = a.position(); const b = renderer.debug.camera.project(body);
      return { name: a.root.userData.characterName, model: a.id, x: a.position().x, z: a.position().z, leg: a.root.getObjectByName('LeftUpLeg').quaternion.toArray(), head: { x: p.x, y: p.y }, feet: { x: b.x, y: b.y }, count: renderer.debug.humans().length };
    });
    await page.keyboard.up('d');
    await page.evaluate(() => { const { renderer, sim } = window.__pfotenzeitYard; for (let i = 0; i < 100; i++) { renderer.updateWorld(sim.step(0.1)); renderer.debug.step(0.1); } });
    await page.waitForTimeout(200);
    const held = await page.evaluate(() => window.__pfotenzeitYard.renderer.debug.worldHeld());
    results.push({ width, before, after, held, errors, ok: after.name === 'Ines' && after.model === 'human_mira' && after.x > before.x + 0.2 && Math.abs(after.head.y) < 1 && Math.abs(after.feet.y) < 1 && after.count === 3 && held && !errors.length });
    await page.close();
  }
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
