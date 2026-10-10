/**
 * Yard dev harness (D-041): `scene.html?yard=1`. WASD moves the handler, a tap/click on the ground
 * walks there (through renderer.pick), a tap on the dog logs the pick. The scripted dog follows
 * loosely; prompt zones light up when the handler enters them. Keys: T toggles the toy distraction,
 * M drops a moment marker at the dog, E presents an 'exercise' (sit) and logs the resolve time.
 * Dev only: timers and DOM live here, never in the renderer.
 */
import { Vector3 } from 'three';
import type { SceneDirective, YardPoint } from '../../simulation/types';
import { createGameRenderer, type GameRendererHandle } from '../app/GameRenderer';
import { createYardSim, type YardSim } from './yardSim';

export interface YardDevApi {
  renderer: GameRendererHandle;
  sim: YardSim;
  /** Last framing line (dog share, handler/dog in frame). */
  status(): string;
  /** Client pixel of a yard ground point (browser verification taps). */
  screenPoint(point: YardPoint): { x: number; y: number };
  dispose(): void;
}

export function yardDirective(world: SceneDirective['world']): SceneDirective {
  return {
    view: 'yard',
    environment: 'courtyard',
    upgrades: ['rest_place', 'sniff_corner'],
    dogs: [
      { id: 'dog_nala', name: 'Nala', growthStage: 'arriving', pose: 'idle_relaxed', position: 'center', facing: 180 },
      { id: 'dog_bruno', name: 'Bruno', growthStage: 'arriving', pose: 'idle_relaxed', position: 'right', facing: -120 },
    ],
    humans: [
      { id: 'human_mira', gesture: 'idle', position: 'left', facing: 20 },
      { id: 'human_alex', gesture: 'idle', position: 'edge', facing: -60 },
    ],
    props: [],
    focusDogId: 'dog_nala',
    hold: false,
    world,
  };
}

export function mountYardDev(container: HTMLElement, options: { baseUrl?: string } = {}): YardDevApi {
  const baseUrl = options.baseUrl ?? (import.meta.env.BASE_URL as string);
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'absolute', inset: '0', overflow: 'hidden', touchAction: 'none' } as CSSStyleDeclaration);
  container.appendChild(host);
  const hud = document.createElement('pre');
  Object.assign(hud.style, { position: 'absolute', left: '0', right: '0', bottom: '0', margin: '0', padding: '6px 8px', background: 'rgba(36,54,49,0.85)', color: '#F4F0E8', font: '12px/1.4 system-ui, sans-serif', whiteSpace: 'pre-wrap', pointerEvents: 'none' } as CSSStyleDeclaration);
  container.appendChild(hud);

  const renderer = createGameRenderer({ baseUrl, qualityTier: 'auto', reducedMotion: false });
  const sim = createYardSim();
  let statusLine = '';
  const keys = new Set<string>();
  let raf = 0;
  let last = 0;
  let lastPick = '–';

  const velocityFromKeys = (): void => {
    let vx = 0;
    let vz = 0;
    if (keys.has('a')) vx -= 1;
    if (keys.has('d')) vx += 1;
    if (keys.has('w')) vz -= 1;
    if (keys.has('s')) vz += 1;
    sim.setVelocity(vx, vz);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if ('wasd'.includes(k)) {
      keys.add(k);
      velocityFromKeys();
      e.preventDefault();
    } else if (k === 't') {
      sim.state.distraction = sim.state.distraction === 'toy' ? 'none' : 'toy';
    } else if (k === 'm') {
      sim.state.momentSpot = sim.state.momentSpot ? null : { x: sim.state.dog.x, z: sim.state.dog.z };
    } else if (k === 'e') {
      const t0 = performance.now();
      sim.state.restPose = 'sit';
      void renderer
        .present({ type: 'exercise', roundId: 'dev', attemptId: 'dev', kind: 'look_at', response: 'settled', pose: 'sit', dogId: 'dog_nala' }, { maxDurationMs: 6000, reducedMotion: false })
        .then(() => {
          lastPick = `exercise resolved after ${(performance.now() - t0).toFixed(0)} ms`;
          sim.state.restPose = 'idle_relaxed';
        });
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (keys.delete(k)) velocityFromKeys();
  };
  const onPointer = (e: PointerEvent): void => {
    const hit = renderer.pick(e.clientX, e.clientY);
    lastPick = hit ? JSON.stringify(hit) : 'null';
    if (!hit) return;
    if (hit.kind === 'ground' || hit.kind === 'zone') sim.moveTo(hit.point);
    else if (hit.actor !== 'dog') sim.moveTo(hit.point);
  };

  const tick = (now: number): void => {
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const world = sim.step(dt);
    renderer.updateWorld(world);
    const f = renderer.debug.framingReport();
    const m = renderer.getMetrics();
    const h = world.actors.find((a) => a.key === 'handler');
    const d = world.actors.find((a) => a.key === 'dog');
    statusLine =
      `yard (WASD / tap: move handler · T toy · M moment · E exercise)  held=${renderer.debug.worldHeld()}\n` +
      `handler=(${h?.position.x.toFixed(2)}, ${h?.position.z.toFixed(2)}) v=${h?.speed.toFixed(2)}  dog=(${d?.position.x.toFixed(2)}, ${d?.position.z.toFixed(2)}) v=${d?.speed.toFixed(2)} pose=${d?.pose} prompt=${world.prompt?.zoneId ?? '–'}\n` +
      (f ? `dog share=${(f.heightShare * 100).toFixed(1)}% margin=${(f.minMargin * 100).toFixed(1)}% centre=(${f.centreX.toFixed(2)}, ${f.centreY.toFixed(2)})` : 'framing=–') +
      `  drawCalls=${m.drawCalls} fps=${m.fpsEstimate} frames=${renderer.debug.frameCount()}\n` +
      `pick: ${lastPick}`;
    hud.textContent = statusLine;
    raf = requestAnimationFrame(tick);
  };

  void renderer.mount(host).then(() => {
    renderer.apply(yardDirective(sim.directive()));
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    host.addEventListener('pointerdown', onPointer);
    raf = requestAnimationFrame(tick);
  });

  return {
    renderer,
    sim,
    status: () => statusLine,
    screenPoint(point) {
      const rect = host.getBoundingClientRect();
      const ndc = renderer.debug.camera.project(new Vector3(point.x, 0, point.z));
      return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height };
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      host.removeEventListener('pointerdown', onPointer);
      renderer.dispose();
      container.replaceChildren();
    },
  };
}
