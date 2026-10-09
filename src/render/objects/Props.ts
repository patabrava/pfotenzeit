/**
 * Care and scene props (PropId): bowl, water, blanket, ball, toy_rolling, leaf, plus the two
 * upgrade ids (handled by SchoolScene as merged toggle groups). Each care prop is one small merged
 * mesh with a pivot at its base so it can be moved toward the dog during present().
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three';
import type { PropId } from '../../simulation/types';
import { PALETTE } from '../materials/palette';
import { STAGE_POSITIONS, YARD } from './SchoolScene';
import { StaticBuilder, disposeMesh } from './staticBuilder';

export type CarePropId = Exclude<PropId, 'rest_place' | 'sniff_corner'>;

export const CARE_PROP_IDS: readonly CarePropId[] = ['bowl', 'water', 'blanket', 'ball', 'toy_rolling', 'leaf'];

export function isCareProp(id: PropId): id is CarePropId {
  return (CARE_PROP_IDS as readonly string[]).includes(id);
}

/** Resting positions in the yard. */
export const PROP_HOME: Record<CarePropId, Vector3> = {
  bowl: new Vector3(-1.1, 0, -2.3),
  water: new Vector3(1.8, 0.06, 0.7),
  blanket: new Vector3(STAGE_POSITIONS.rest.x + 0.05, 0.1, STAGE_POSITIONS.rest.z + 0.05),
  ball: new Vector3(0.9, 0, -0.9),
  toy_rolling: new Vector3(YARD.width / 2 - 0.7, 0, -2.4),
  leaf: new Vector3(1.6, 0.9, -2.9),
};

const HALF_PI = Math.PI / 2;

function buildBowl(hex: string, contents: string, contentY: number): Mesh {
  const b = new StaticBuilder();
  b.add(new CylinderGeometry(0.11, 0.08, 0.06, 18), hex, { position: [0, 0.03, 0] });
  b.add(new TorusGeometry(0.105, 0.012, 8, 20), hex, { position: [0, 0.06, 0], rotation: [HALF_PI, 0, 0] });
  b.add(new CylinderGeometry(0.09, 0.09, 0.012, 18), contents, { position: [0, contentY, 0] });
  return b.build('prop_bowl');
}

function buildBlanket(): Mesh {
  const b = new StaticBuilder();
  b.add(new BoxGeometry(0.62, 0.035, 0.5), PALETTE.blanket, { position: [0, 0.018, 0] });
  b.add(new BoxGeometry(0.6, 0.02, 0.1), '#B8A2BE', { position: [0, 0.045, -0.18] });
  b.add(new BoxGeometry(0.22, 0.03, 0.1), '#B8A2BE', { position: [0.15, 0.05, 0.1], rotation: [0, 0.4, 0] });
  const mesh = b.build('prop_blanket');
  return mesh;
}

function buildBall(): Mesh {
  const b = new StaticBuilder();
  b.add(new SphereGeometry(0.06, 14, 10), PALETTE.apricot, { position: [0, 0.06, 0] });
  b.add(new TorusGeometry(0.06, 0.008, 6, 20), PALETTE.chalk, { position: [0, 0.06, 0], rotation: [0.6, 0.4, 0] });
  return b.build('prop_ball');
}

function buildRollingToy(): Mesh {
  const b = new StaticBuilder();
  // A wobbly treat roller: cylinder with end caps.
  b.add(new CylinderGeometry(0.07, 0.07, 0.16, 16), PALETTE.sage, { position: [0, 0.07, 0], rotation: [0, 0, HALF_PI] });
  b.add(new CylinderGeometry(0.075, 0.075, 0.02, 16), PALETTE.ink, { position: [0.085, 0.07, 0], rotation: [0, 0, HALF_PI] });
  b.add(new CylinderGeometry(0.075, 0.075, 0.02, 16), PALETTE.ink, { position: [-0.085, 0.07, 0], rotation: [0, 0, HALF_PI] });
  return b.build('prop_toy_rolling');
}

function buildLeaf(): Mesh {
  const b = new StaticBuilder();
  b.add(new SphereGeometry(0.07, 8, 6), PALETTE.apricot, { scale: [1, 0.08, 0.6] });
  b.add(new BoxGeometry(0.11, 0.006, 0.008), PALETTE.terracotta, {});
  return b.build('prop_leaf');
}

export interface PropsSet {
  group: Group;
  meshes: Record<CarePropId, Mesh>;
  /** Show exactly these props (others hidden). */
  setVisible(ids: readonly PropId[]): void;
  /** Reset a prop to its home position. */
  home(id: CarePropId): void;
  homeAll(): void;
  /** Replace a procedural prop by a node from a props GLB. */
  setExternal(id: CarePropId, object: Object3D | null): void;
  /** Idle motion for the loud edge: rolling toy and falling leaf. Returns true if it moved. */
  animateEdge(t: number, loud: boolean, hold: boolean): boolean;
  triangles(): number;
  dispose(): void;
}

export function createProps(): PropsSet {
  const group = new Group();
  group.name = 'props';
  const meshes: Record<CarePropId, Mesh> = {
    bowl: buildBowl(PALETTE.ceramic, '#8C6A4A', 0.05),
    water: buildBowl('#9AA7A0', PALETTE.water, 0.052),
    blanket: buildBlanket(),
    ball: buildBall(),
    toy_rolling: buildRollingToy(),
    leaf: buildLeaf(),
  };
  const external: Partial<Record<CarePropId, Object3D>> = {};
  const holders: Record<CarePropId, Group> = {} as Record<CarePropId, Group>;
  let tri = 0;
  for (const id of CARE_PROP_IDS) {
    const holder = new Group();
    holder.name = `prop_${id}`;
    holder.add(meshes[id]);
    holder.position.copy(PROP_HOME[id]);
    holder.visible = false;
    meshes[id].castShadow = true;
    holders[id] = holder;
    group.add(holder);
    const geometry = meshes[id].geometry;
    const index = geometry.getIndex();
    tri += (index ? index.count : geometry.getAttribute('position').count) / 3;
  }

  const api: PropsSet = {
    group,
    meshes,
    setVisible(ids) {
      for (const id of CARE_PROP_IDS) holders[id].visible = ids.includes(id);
    },
    home(id) {
      holders[id].position.copy(PROP_HOME[id]);
      holders[id].rotation.set(0, 0, 0);
    },
    homeAll() {
      for (const id of CARE_PROP_IDS) api.home(id);
    },
    setExternal(id, object) {
      const previous = external[id];
      if (previous) holders[id].remove(previous);
      if (object) {
        external[id] = object;
        holders[id].add(object);
        meshes[id].visible = false;
      } else {
        delete external[id];
        meshes[id].visible = true;
      }
    },
    animateEdge(t, loud, hold) {
      if (!loud || hold) return false;
      let moved = false;
      const toy = holders.toy_rolling;
      if (toy.visible) {
        const span = 1.6;
        const u = (Math.sin(t * 0.55) + 1) / 2;
        const home = PROP_HOME.toy_rolling;
        toy.position.set(home.x, home.y, home.z - span / 2 + u * span);
        toy.rotation.x = (toy.position.z / 0.07) % (Math.PI * 2);
        moved = true;
      }
      const leaf = holders.leaf;
      if (leaf.visible) {
        const cycle = 7;
        const k = (t % cycle) / cycle;
        const home = PROP_HOME.leaf;
        leaf.position.set(home.x + Math.sin(t * 1.3) * 0.25, home.y * (1 - k) + 0.02, home.z + k * 1.1);
        leaf.rotation.set(Math.sin(t * 2.1) * 0.5, t * 0.7, Math.cos(t * 1.7) * 0.4);
        moved = true;
      }
      return moved;
    },
    triangles() {
      return tri;
    },
    dispose() {
      for (const id of CARE_PROP_IDS) disposeMesh(meshes[id]);
    },
  };
  return api;
}

/** Holder of a care prop (the object to move). */
export function propHolder(props: PropsSet, id: CarePropId): Object3D {
  return props.meshes[id].parent as Object3D;
}
