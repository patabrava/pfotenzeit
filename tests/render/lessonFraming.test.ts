import { describe, expect, it } from 'vitest';
import { createGameRenderer } from '../../src/render/app/GameRenderer';
import { defaultDirective } from '../../src/render/devScene';
import type { PoseId, StagePosition } from '../../src/simulation/types';
import { computeFraming, viewDirection } from '../../src/render/app/CameraRig';
import { Vector3 } from 'three';

describe('edge lesson camera visibility', () => {
  it('yard camera looks over the foreground rail at a resting dog in the quiet corner', () => {
    const ground = new Vector3(-2, 0, 2);
    const framing = computeFraming({ view: 'yard', ground, points: [ground, ground.clone().setY(0.15)], zone: null, facing: 0, handler: null }, 390 / 480);
    const direction = viewDirection(framing.elevation, framing.azimuth);
    const rayHeightAtRail = 0.15 + (3.4 - ground.z) * direction.y / direction.z;
    expect(rayHeightAtRail).toBeGreaterThan(1.1);
    expect(direction.z).toBeGreaterThan(0);
  });
  for (const position of ['rest', 'sniff'] as StagePosition[]) {
    it(`${position} stays on the courtyard side while the dog changes pose`, () => {
      const renderer = createGameRenderer({ baseUrl: './', qualityTier: 'low', reducedMotion: false, disableGlb: true });
      try {
        for (const [width, height] of [[390, 232], [844, 140], [1440, 248]]) {
          renderer.debug.camera.setViewport(width!, height!);
          for (const pose of ['tired_idle', 'rest_loop', 'rest_side', 'sniff'] as PoseId[]) {
            renderer.apply({ ...defaultDirective(), dogs: [{ ...defaultDirective().dogs[0]!, position, pose }] });
            for (let frame = 0; frame < 180; frame++) renderer.debug.step(1 / 60);
            const ground = renderer.debug.dogs()[0]!.position();
            const camera = renderer.debug.camera.camera.position;
            expect((camera.x - ground.x) * (position === 'rest' ? 1 : -1)).toBeGreaterThan(0);
            expect(camera.z).toBeGreaterThan(ground.z);
            expect(renderer.debug.framingReport()!.minMargin).toBeGreaterThan(0);
          }
        }
      } finally { renderer.dispose(); }
    });
  }
});
