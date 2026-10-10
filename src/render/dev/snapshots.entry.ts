/**
 * Renders verification sheets to PNG with the CPU rasterizer (no GPU needed):
 * pose sheets (Nala, Bruno), gesture sheet, cast sheet and the lesson/school/closeup framings at the
 * five target viewports. Output: $TMPDIR/pfotenzeit-shots (or SHOTS_DIR).
 *   CHECK_ENTRY=snapshots npx vite build --config src/render/dev/vite.check.config.ts && node node_modules/.cache/render-check/snapshots.entry.js
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from 'three';
import { POSE_IDS, type GestureId, type SceneDirective, type WorldDirective } from '../../simulation/types';
import { yardDirective } from './yardDev';
import { createYardSim } from './yardSim';
import { createGameRenderer, type GameRendererHandle } from '../app/GameRenderer';
import { BACKGROUND_HEX } from '../materials/palette';
import { defaultDirective } from '../devScene';
import { encodePng, softRender } from './softRender';

const outDir = process.env.SHOTS_DIR ?? join(process.env.TMPDIR ?? '/tmp', 'pfotenzeit-shots');
mkdirSync(outDir, { recursive: true });

function blit(sheet: Uint8Array, sheetW: number, tile: Uint8Array, tileW: number, tileH: number, x0: number, y0: number): void {
  for (let y = 0; y < tileH; y++) sheet.set(tile.subarray(y * tileW * 3, (y + 1) * tileW * 3), ((y0 + y) * sheetW + x0) * 3);
}

function makeRenderer(): GameRendererHandle {
  return createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, disableGlb: true });
}

function settle(handle: GameRendererHandle, seconds = 0): void {
  for (const a of [...handle.debug.dogs(), ...handle.debug.humans()]) a.update(0);
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) handle.debug.step(1 / 60);
  handle.debug.camera.update(10);
}

function shot(handle: GameRendererHandle, w: number, h: number): Uint8Array {
  return softRender(handle.debug.scene, handle.debug.camera.camera, { width: w, height: h, background: BACKGROUND_HEX });
}

function save(name: string, w: number, h: number, rgb: Uint8Array): void {
  writeFileSync(join(outDir, name), encodePng(w, h, rgb));
  console.log(`wrote ${join(outDir, name)}`);
}

function poseSheet(id: 'dog_nala' | 'dog_bruno', growth: 'arriving' | 'growing', facing: number, name: string): void {
  const tile = 240;
  const cols = 5;
  const rows = Math.ceil(POSE_IDS.length / cols);
  const sheet = new Uint8Array(tile * cols * tile * rows * 3).fill(255);
  POSE_IDS.forEach((pose, i) => {
    const handle = makeRenderer();
    handle.debug.camera.setViewport(tile, tile);
    const base = defaultDirective();
    const directive: SceneDirective = {
      ...base,
      view: 'closeup',
      humans: [],
      props: [],
      dogs: [{ id, name: id, growthStage: growth, pose, position: 'center', facing }],
      focusDogId: id,
    };
    handle.apply(directive);
    // Sample mid-cycle so walk/sniff/recover show motion (hold=false).
    const dog = handle.debug.dogs()[0];
    if (pose === 'walk') dog?.update(0);
    settle(handle, pose === 'recover' ? 0 : 0.4);
    if (pose === 'recover') {
      void dog?.play('tense_idle', { instant: true });
      void dog?.play('recover');
      settle(handle, 0.9);
    }
    const rgb = shot(handle, tile, tile);
    blit(sheet, tile * cols, rgb, tile, tile, (i % cols) * tile, Math.floor(i / cols) * tile);
    handle.dispose();
  });
  save(name, tile * cols, tile * rows, sheet);
}

function gestureSheet(): void {
  const gestures: GestureId[] = ['idle', 'greet', 'gesture_explain', 'offer_reward', 'kneel'];
  const tileW = 220;
  const tileH = 300;
  const sheet = new Uint8Array(tileW * gestures.length * tileH * 2 * 3).fill(255);
  (['human_mira', 'human_alex'] as const).forEach((id, row) => {
    gestures.forEach((gesture, i) => {
      const handle = makeRenderer();
      handle.debug.camera.setViewport(tileW, tileH);
      handle.apply({ ...defaultDirective(), view: 'closeup', dogs: [], props: [], focusDogId: null, humans: [{ id, gesture, position: 'center', facing: 25 }] });
      settle(handle, 0.3);
      const human = handle.debug.humans()[0];
      if (human) handle.debug.camera.frame({ view: 'closeup', points: human.measure(), ground: human.position(), zone: null, facing: (human.facing() * Math.PI) / 180, handler: null }, true);
      const rgb = shot(handle, tileW, tileH);
      blit(sheet, tileW * gestures.length, rgb, tileW, tileH, i * tileW, row * tileH);
      handle.dispose();
    });
  });
  save('gestures.png', tileW * gestures.length, tileH * 2, sheet);
}

function castSheet(): void {
  const handle = makeRenderer();
  const w = 900;
  const h = 520;
  handle.debug.camera.setViewport(w, h);
  handle.apply({
    view: 'lesson',
    environment: 'courtyard_loud',
    upgrades: ['rest_place', 'sniff_corner'],
    dogs: [
      { id: 'dog_nala', name: 'Nala', growthStage: 'growing', pose: 'look_at_handler', position: 'center', facing: 30 },
      { id: 'dog_bruno', name: 'Bruno', growthStage: 'arriving', pose: 'idle_relaxed', position: 'right', facing: -20 },
    ],
    humans: [
      { id: 'human_mira', gesture: 'gesture_explain', position: 'left', facing: -40 },
      { id: 'human_alex', gesture: 'idle', position: 'edge', facing: -120 },
    ],
    props: ['bowl', 'water', 'blanket', 'ball', 'toy_rolling', 'leaf'],
    focusDogId: 'dog_nala',
    hold: false,
  });
  settle(handle, 0.5);
  save('cast_lesson.png', w, h, shot(handle, w, h));
  handle.dispose();
}

function framingSheet(view: 'school' | 'lesson' | 'closeup'): void {
  const viewports: Array<[number, number]> = [
    [360, 640],
    [390, 844],
    [430, 932],
    [844, 390],
    [1440, 900],
  ];
  // Layout: three portrait tiles in a row, then two landscape tiles scaled 1:2 below.
  const scale = 0.5;
  const sheetW = Math.round(360 + 390 + 430 + 40);
  const sheetH = Math.round(932 + 20 + 900 * scale + 20);
  const sheet = new Uint8Array(sheetW * sheetH * 3).fill(200);
  let x = 0;
  viewports.forEach(([w, h], i) => {
    const handle = makeRenderer();
    handle.debug.camera.setViewport(w, h);
    const base = defaultDirective();
    handle.apply({
      ...base,
      view,
      environment: 'courtyard',
      upgrades: ['rest_place'],
      props: ['water', 'ball'],
      dogs: [{ ...base.dogs[0]!, growthStage: 'arriving', pose: 'sit', facing: 25 }],
      humans: [{ id: 'human_mira', gesture: 'offer_reward', position: 'left', facing: -40 }],
    });
    settle(handle, 0.3);
    if (i < 3) {
      const rgb = shot(handle, w, h);
      blit(sheet, sheetW, rgb, w, h, x, 0);
      x += w + 20;
    } else {
      const tw = Math.round(w * scale);
      const th = Math.round(h * scale);
      const rgb = shot(handle, tw, th);
      const ox = i === 3 ? 0 : Math.round(844 * scale) + 20;
      blit(sheet, sheetW, rgb, tw, th, ox, 932 + 20);
    }
    handle.dispose();
  });
  save(`framing_${view}.png`, sheetW, sheetH, sheet);
}

function zoneSheet(): void {
  const handle = makeRenderer();
  const w = 390;
  const h = 844;
  const sheet = new Uint8Array(w * 2 * h * 3).fill(255);
  (['rest_place', 'sniff_corner'] as const).forEach((env, i) => {
    handle.debug.camera.setViewport(w, h);
    const base = defaultDirective();
    handle.apply({
      ...base,
      view: 'school',
      environment: env,
      upgrades: [env],
      props: env === 'rest_place' ? ['blanket'] : [],
      humans: [],
      dogs: [{ ...base.dogs[0]!, pose: env === 'rest_place' ? 'rest_loop' : 'sniff', position: env === 'rest_place' ? 'rest' : 'sniff', facing: 40 }],
    });
    handle.setReducedMotion(true);
    settle(handle, 0.2);
    blit(sheet, w * 2, shot(handle, w, h), w, h, i * w, 0);
  });
  save('zones.png', w * 2, h, sheet);
  handle.dispose();
}

/** D-041 yard: near (spawn), walking toward the gate with the toy out, far apart; portrait and landscape. */
function yardSheet(): void {
  const tiles: Array<{ w: number; h: number; world: WorldDirective; seconds: number }> = [];
  const near = createYardSim();
  tiles.push({ w: 390, h: 844, world: near.directive(), seconds: 0.5 });
  const walking = createYardSim({ distraction: 'toy' });
  walking.moveTo({ x: 0.2, z: 2.8 });
  let w: WorldDirective = walking.directive();
  for (let i = 0; i < 40; i++) w = walking.step(1 / 60);
  tiles.push({ w: 390, h: 844, world: w, seconds: 0 });
  const far = createYardSim({ handler: { x: -2.4, z: 2.2, facing: 150, speed: 0, target: null }, dog: { x: 2.3, z: -1.7, facing: 90, speed: 0, pose: 'sniff' }, momentSpot: { x: 2.3, z: -1.7 } });
  tiles.push({ w: 844, h: 390, world: far.directive(), seconds: 0.5 });
  const sheetW = 390 + 390 + 844 + 40;
  const sheetH = 844;
  const sheet = new Uint8Array(sheetW * sheetH * 3).fill(200);
  let x = 0;
  for (const tile of tiles) {
    const handle = makeRenderer();
    handle.debug.camera.setViewport(tile.w, tile.h);
    handle.apply(yardDirective(tile.world));
    settle(handle, tile.seconds);
    handle.updateWorld(tile.world);
    settle(handle, 0.4);
    blit(sheet, sheetW, shot(handle, tile.w, tile.h), tile.w, tile.h, x, 0);
    x += tile.w + 20;
    handle.dispose();
  }
  save('yard.png', sheetW, sheetH, sheet);
}

poseSheet('dog_nala', 'arriving', 35, 'poses_nala_arriving.png');
poseSheet('dog_nala', 'growing', 35, 'poses_nala_growing.png');
poseSheet('dog_bruno', 'arriving', 35, 'poses_bruno.png');
gestureSheet();
castSheet();
framingSheet('lesson');
framingSheet('school');
framingSheet('closeup');
zoneSheet();
yardSheet();
