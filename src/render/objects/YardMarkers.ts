/**
 * Yard mode markers (D-041): the handler is the player and is drawn as a quiet marker (soft ring
 * plus a forward arrow), the active prompt zone as a subtle sage ring that breathes over
 * 2 s (static under reduced motion), and a dog-initiated moment as a small chalk spot. All flat,
 * unlit, four draw calls in total; sizes in metres on the ground plane.
 */
import { CircleGeometry, Shape, ShapeGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { PALETTE } from '../materials/palette';

function flat(geometry: CircleGeometry | RingGeometry | ShapeGeometry, hex: string, opacity: number, name: string): Mesh {
  const material = new MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = name;
  mesh.renderOrder = 2;
  return mesh;
}

export interface YardMarkers {
  group: Group;
  handler: Group;
  prompt: Mesh;
  moment: Mesh;
  /** Handler position/facing (degrees, 0 = +z). */
  setHandler(x: number, z: number, facingDeg: number): void;
  setPrompt(x: number, z: number, radius: number, visible: boolean): void;
  setMoment(x: number, z: number, visible: boolean): void;
  /** Prompt ring breathing; returns true while something animates (false under reduced motion). */
  animate(t: number, reducedMotion: boolean): boolean;
  dispose(): void;
}

export function createYardMarkers(): YardMarkers {
  const group = new Group();
  group.name = 'yard_markers';

  // Handler: player selection ring and forward arrow beneath the visible person.
  const handler = new Group();
  handler.name = 'handler_marker';
  const ring = flat(new RingGeometry(0.22, 0.3, 40), PALETTE.sage, 0.55, 'handler_ring');
  ring.position.y = 0.012;
  // A forward arrow identifies the human player; a pawprint implied dog control.
  const shape = new Shape();
  shape.moveTo(0, -0.44);
  shape.lineTo(-0.09, -0.3);
  shape.lineTo(0.09, -0.3);
  shape.closePath();
  const arrow = flat(new ShapeGeometry(shape), PALETTE.sage, 0.9, 'handler_arrow');
  arrow.position.y = 0.014;
  handler.add(ring, arrow);

  const prompt = flat(new RingGeometry(0.86, 1, 56), PALETTE.sage, 0.4, 'prompt_ring');
  prompt.position.y = 0.011;
  prompt.visible = false;

  const moment = flat(new CircleGeometry(0.12, 24), PALETTE.chalk, 0.75, 'moment_marker');
  moment.position.y = 0.013;
  moment.visible = false;

  group.add(handler, prompt, moment);

  let promptRadius = 1;
  const api: YardMarkers = {
    group,
    handler,
    prompt,
    moment,
    setHandler(x, z, facingDeg) {
      handler.position.set(x, 0, z);
      handler.rotation.y = (facingDeg * Math.PI) / 180;
    },
    setPrompt(x, z, radius, visible) {
      prompt.visible = visible;
      prompt.position.set(x, 0.011, z);
      promptRadius = Math.max(0.3, radius);
      prompt.scale.set(promptRadius, promptRadius, 1);
    },
    setMoment(x, z, visible) {
      moment.visible = visible;
      moment.position.set(x, 0.013, z);
    },
    animate(t, reducedMotion) {
      if (!prompt.visible) return false;
      if (reducedMotion) {
        prompt.scale.set(promptRadius, promptRadius, 1);
        (prompt.material as MeshBasicMaterial).opacity = 0.4;
        return false;
      }
      // 2 s breath: ±4 % radius, opacity 0.32–0.48.
      const k = 0.5 + 0.5 * Math.sin((t / 2) * Math.PI * 2);
      const s = promptRadius * (0.96 + 0.08 * k);
      prompt.scale.set(s, s, 1);
      (prompt.material as MeshBasicMaterial).opacity = 0.32 + 0.16 * k;
      return true;
    },
    dispose() {
      group.traverse((node) => {
        const mesh = node as Mesh;
        if (!(mesh as { isMesh?: boolean }).isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      });
      group.removeFromParent();
    },
  };
  return api;
}
