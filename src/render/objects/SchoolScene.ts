/**
 * The school (06): a compact fenced courtyard with a wooden shelter, training area, rest place
 * (always present), sniff corner with planter boxes (sniff props appear with the upgrade), water
 * place, a few plants. Static geometry is merged: one draw call for the yard, one per toggle group.
 *
 * World: metres, +Y up, the camera sits on the +Z side. Stage positions are fixed yard coordinates.
 */
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';
import type { EnvironmentId, StagePosition, UpgradeId } from '../../simulation/types';
import { PALETTE, standardMaterial } from '../materials/palette';
import { StaticBuilder, disposeMesh } from './staticBuilder';

export const YARD = { width: 8, depth: 7 } as const;

/** Fixed yard coordinates per StagePosition (x, z). */
export const STAGE_POSITIONS: Record<StagePosition, Vector3> = {
  center: new Vector3(0, 0, 0.2),
  left: new Vector3(-1.25, 0, 0.35),
  right: new Vector3(1.25, 0, 0.35),
  rest: new Vector3(-2.3, 0, -1.5),
  sniff: new Vector3(2.3, 0, -1.7),
  edge: new Vector3(2.95, 0, -2.6),
};

/** Where the camera looks for zone environments. */
export const ZONE_FOCUS: Record<'rest_place' | 'sniff_corner', Vector3> = {
  rest_place: STAGE_POSITIONS.rest,
  sniff_corner: STAGE_POSITIONS.sniff,
};

export interface SchoolScene {
  group: Group;
  /** Static yard geometry (always visible). */
  yard: Mesh;
  /** Busier edge for courtyard_loud. */
  loudEdge: Mesh;
  upgradeMeshes: Record<UpgradeId, Mesh>;
  setEnvironment(env: EnvironmentId): void;
  setUpgrades(upgrades: readonly UpgradeId[]): void;
  /** Replace the procedural yard by a loaded environment GLB (keeps stage positions). */
  setExternalEnvironment(object: Object3D | null): void;
  /** Replace a procedural upgrade group by a node from the upgrades GLB. */
  setExternalUpgrade(id: UpgradeId, object: Object3D | null): void;
  triangles(): number;
  dispose(): void;
}

const HALF_PI = Math.PI / 2;

function buildYard(): { mesh: Mesh; triangles: number } {
  const b = new StaticBuilder();
  const hw = YARD.width / 2;
  const hd = YARD.depth / 2;

  // Ground: a generous slab so the ortho frame never shows the void, plus the training circle.
  b.add(new BoxGeometry(YARD.width + 4, 0.1, YARD.depth + 4), PALETTE.ground, { position: [0, -0.05, 0] });
  b.add(new CylinderGeometry(2.1, 2.1, 0.02, 40), PALETTE.groundTraining, { position: [0, 0.0, 0.1] });
  // Paths
  b.add(new BoxGeometry(1.1, 0.015, 2.4), PALETTE.gravel, { position: [-2.2, 0.004, 1.9] });
  b.add(new BoxGeometry(2.6, 0.015, 0.9), PALETTE.gravel, { position: [1.3, 0.004, -2.75] });

  // Fence: posts and two rails, gap at the front-left (gate).
  const postH = 0.95;
  const post = (x: number, z: number): void => {
    b.add(new BoxGeometry(0.09, postH, 0.09), PALETTE.woodDark, { position: [x, postH / 2, z] });
  };
  const rail = (x: number, z: number, len: number, alongX: boolean, y: number): void => {
    b.add(new BoxGeometry(alongX ? len : 0.05, 0.07, alongX ? 0.05 : len), PALETTE.fence, { position: [x, y, z] });
  };
  for (let x = -hw; x <= hw + 0.01; x += 1.0) {
    post(x, -hd);
    if (x > -hw + 1.4 || x < -hw + 0.1) post(x, hd);
  }
  for (let z = -hd + 1; z < hd; z += 1.0) {
    post(-hw, z);
    post(hw, z);
  }
  for (const y of [0.35, 0.78]) {
    rail(0, -hd, YARD.width, true, y);
    rail(-hw, 0, YARD.depth, false, y);
    rail(hw, 0, YARD.depth, false, y);
    // front rail with a gate gap on the left
    rail(hw - (YARD.width - 1.4) / 2, hd, YARD.width - 1.4, true, y);
  }
  // Gate (open, leaning in)
  b.add(new BoxGeometry(0.06, 0.8, 1.2), PALETTE.wood, { position: [-hw + 0.75, 0.5, hd - 0.55], rotation: [0, 0.35, 0] });

  // Shelter at the back: four posts, back wall, slanted roof.
  const sx = -0.6;
  const sz = -hd + 0.9;
  for (const [px, pz] of [
    [sx - 1.3, sz - 0.75],
    [sx + 1.3, sz - 0.75],
    [sx - 1.3, sz + 0.75],
    [sx + 1.3, sz + 0.75],
  ] as const) {
    b.add(new BoxGeometry(0.12, 2.2, 0.12), PALETTE.woodDark, { position: [px, 1.1, pz] });
  }
  b.add(new BoxGeometry(2.72, 2.0, 0.08), PALETTE.wood, { position: [sx, 1.0, sz - 0.78] });
  b.add(new BoxGeometry(0.08, 2.0, 1.6), PALETTE.wood, { position: [sx - 1.34, 1.0, sz] });
  b.add(new BoxGeometry(3.1, 0.1, 1.9), PALETTE.woodDark, { position: [sx, 2.3, sz], rotation: [0.12, 0, 0] });
  b.add(new BoxGeometry(2.6, 0.06, 1.5), PALETTE.wood, { position: [sx, 0.03, sz] });
  // A bench inside the shelter
  b.add(new BoxGeometry(1.2, 0.08, 0.4), PALETTE.wood, { position: [sx + 0.5, 0.45, sz - 0.3] });
  b.add(new BoxGeometry(0.08, 0.42, 0.36), PALETTE.woodDark, { position: [sx - 0.05, 0.21, sz - 0.3] });
  b.add(new BoxGeometry(0.08, 0.42, 0.36), PALETTE.woodDark, { position: [sx + 1.05, 0.21, sz - 0.3] });

  // Rest place: low wooden deck with a sage mat (blanket zone, always present), a low side rail.
  const r = STAGE_POSITIONS.rest;
  b.add(new BoxGeometry(1.7, 0.08, 1.4), PALETTE.wood, { position: [r.x, 0.04, r.z] });
  b.add(new BoxGeometry(1.3, 0.025, 1.0), PALETTE.sage, { position: [r.x, 0.093, r.z] });
  b.add(new BoxGeometry(0.06, 0.5, 1.4), PALETTE.woodDark, { position: [r.x - 0.87, 0.33, r.z] });

  // Sniff corner: planter boxes (always present) with low plants.
  const s = STAGE_POSITIONS.sniff;
  for (const [dx, dz, w, d] of [
    [0.5, -0.7, 1.2, 0.5],
    [1.0, 0.2, 0.5, 1.1],
  ] as const) {
    b.add(new BoxGeometry(w, 0.42, d), PALETTE.planter, { position: [s.x + dx, 0.21, s.z + dz] });
    b.add(new BoxGeometry(w - 0.08, 0.04, d - 0.08), '#6B5540', { position: [s.x + dx, 0.43, s.z + dz] });
    for (let i = 0; i < 3; i++) {
      const px = s.x + dx + (w - 0.2) * (i / 2 - 0.5);
      const pz = s.z + dz + (d - 0.2) * ((i % 2) / 2 - 0.25);
      b.add(new SphereGeometry(0.16, 10, 8), i === 1 ? PALETTE.plantDark : PALETTE.plantGreen, {
        position: [px, 0.52, pz],
        scale: [1, 0.8, 1],
      });
    }
  }

  // Water place: stone slab in front right (the bowl itself is the 'water' prop).
  b.add(new CylinderGeometry(0.42, 0.46, 0.06, 18), PALETTE.stone, { position: [1.8, 0.03, 0.7] });

  // Plants: shrubs in corners, a small tree back-left, a pot at the front.
  const shrub = (x: number, z: number, scale: number, dark = false): void => {
    b.add(new SphereGeometry(0.32 * scale, 12, 10), dark ? PALETTE.plantDark : PALETTE.plantGreen, {
      position: [x, 0.28 * scale, z],
      scale: [1.1, 0.85, 1],
    });
    b.add(new SphereGeometry(0.22 * scale, 10, 8), PALETTE.plantGreen, { position: [x + 0.2 * scale, 0.36 * scale, z + 0.15 * scale] });
  };
  shrub(hw - 0.5, hd - 0.6, 1.0);
  shrub(hw - 0.45, -hd + 0.5, 0.9, true);
  shrub(-hw + 0.55, -0.4, 0.8);
  shrub(2.0, -hd + 0.55, 0.7, true);
  b.add(new CylinderGeometry(0.09, 0.12, 1.6, 10), PALETTE.woodDark, { position: [-hw + 0.7, 0.8, -hd + 0.8] });
  b.add(new SphereGeometry(0.85, 14, 12), PALETTE.plantDark, { position: [-hw + 0.7, 2.0, -hd + 0.8], scale: [1.15, 0.9, 1.05] });
  b.add(new SphereGeometry(0.55, 12, 10), PALETTE.plantGreen, { position: [-hw + 1.2, 2.25, -hd + 1.1] });
  b.add(new CylinderGeometry(0.2, 0.15, 0.3, 12), PALETTE.terracotta, { position: [-1.0, 0.15, hd - 0.5] });
  b.add(new SphereGeometry(0.22, 10, 8), PALETTE.plantGreen, { position: [-1.0, 0.42, hd - 0.5], scale: [1, 0.7, 1] });

  const mesh = b.build('school_yard');
  mesh.receiveShadow = true;
  return { mesh, triangles: b.triangles };
}

function buildLoudEdge(): Mesh {
  const b = new StaticBuilder();
  const hw = YARD.width / 2;
  const hd = YARD.depth / 2;
  // Stacked crates, a bucket, a bicycle-ish frame leaning on the fence: a busier edge.
  b.add(new BoxGeometry(0.5, 0.5, 0.5), PALETTE.wood, { position: [hw - 0.6, 0.25, -hd + 1.6] });
  b.add(new BoxGeometry(0.42, 0.42, 0.42), PALETTE.woodDark, { position: [hw - 0.55, 0.71, -hd + 1.55], rotation: [0, 0.3, 0] });
  b.add(new CylinderGeometry(0.16, 0.13, 0.3, 12), '#7F8C8A', { position: [hw - 1.2, 0.15, -hd + 2.3] });
  b.add(new BoxGeometry(0.06, 0.7, 1.4), '#5A6B70', { position: [hw - 0.2, 0.5, -0.4], rotation: [0, 0, 0.25] });
  b.add(new CylinderGeometry(0.33, 0.33, 0.04, 16), '#3B3F42', { position: [hw - 0.25, 0.33, -1.0], rotation: [0, 0, HALF_PI] });
  b.add(new CylinderGeometry(0.33, 0.33, 0.04, 16), '#3B3F42', { position: [hw - 0.25, 0.33, 0.2], rotation: [0, 0, HALF_PI] });
  // Laundry line with two towels
  b.add(new BoxGeometry(3.0, 0.015, 0.015), '#8B8375', { position: [1.0, 1.65, -hd + 0.25] });
  b.add(new BoxGeometry(0.5, 0.6, 0.02), PALETTE.apricot, { position: [0.5, 1.35, -hd + 0.25] });
  b.add(new BoxGeometry(0.5, 0.5, 0.02), PALETTE.sage, { position: [1.6, 1.4, -hd + 0.25] });
  const mesh = b.build('school_loud_edge');
  mesh.visible = false;
  return mesh;
}

function buildRestUpgrade(): Mesh {
  const b = new StaticBuilder();
  const r = STAGE_POSITIONS.rest;
  // Shade frame with a cloth roof, cushion, small lantern and a plant.
  for (const [dx, dz] of [
    [-0.8, -0.65],
    [0.8, -0.65],
    [-0.8, 0.65],
    [0.8, 0.65],
  ] as const) {
    b.add(new BoxGeometry(0.07, 1.6, 0.07), PALETTE.woodDark, { position: [r.x + dx, 0.8, r.z + dz] });
  }
  b.add(new BoxGeometry(1.9, 0.03, 1.6), PALETTE.chalk, { position: [r.x, 1.62, r.z], rotation: [0.06, 0, 0] });
  b.add(new BoxGeometry(0.6, 0.12, 0.5), PALETTE.apricot, { position: [r.x + 0.4, 0.16, r.z + 0.3] });
  b.add(new CylinderGeometry(0.08, 0.1, 0.18, 10), PALETTE.gold, { position: [r.x - 0.6, 0.18, r.z + 0.55] });
  b.add(new CylinderGeometry(0.14, 0.11, 0.26, 10), PALETTE.terracotta, { position: [r.x + 0.75, 0.13, r.z - 0.9] });
  b.add(new SphereGeometry(0.2, 10, 8), PALETTE.plantGreen, { position: [r.x + 0.75, 0.4, r.z - 0.9], scale: [1, 0.8, 1] });
  const mesh = b.build('upgrade_rest_place');
  mesh.visible = false;
  return mesh;
}

function buildSniffUpgrade(): Mesh {
  const b = new StaticBuilder();
  const s = STAGE_POSITIONS.sniff;
  // Digging box with sand, snuffle mat, tall grasses, a log to explore.
  b.add(new BoxGeometry(1.0, 0.25, 0.8), PALETTE.wood, { position: [s.x - 0.75, 0.125, s.z + 0.6] });
  b.add(new BoxGeometry(0.9, 0.04, 0.7), '#E6D7B2', { position: [s.x - 0.75, 0.26, s.z + 0.6] });
  b.add(new BoxGeometry(0.7, 0.05, 0.5), PALETTE.forest, { position: [s.x - 0.2, 0.025, s.z - 0.2] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(new CylinderGeometry(0.015, 0.03, 0.55, 6), PALETTE.plantDark, {
      position: [s.x + 0.95 + Math.cos(a) * 0.12, 0.3, s.z + 0.95 + Math.sin(a) * 0.12],
      rotation: [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2],
    });
  }
  b.add(new CylinderGeometry(0.12, 0.14, 0.9, 10), PALETTE.woodDark, { position: [s.x + 0.1, 0.12, s.z + 1.1], rotation: [0, 0.4, HALF_PI] });
  const mesh = b.build('upgrade_sniff_corner');
  mesh.visible = false;
  return mesh;
}

export function createSchoolScene(): SchoolScene {
  const group = new Group();
  group.name = 'school';
  const yardBuilt = buildYard();
  const yard = yardBuilt.mesh;
  const loudEdge = buildLoudEdge();
  const upgradeMeshes: Record<UpgradeId, Mesh> = { rest_place: buildRestUpgrade(), sniff_corner: buildSniffUpgrade() };
  group.add(yard, loudEdge, upgradeMeshes.rest_place, upgradeMeshes.sniff_corner);
  let external: Object3D | null = null;
  const externalUpgrades: Partial<Record<UpgradeId, Object3D>> = {};
  let owned: readonly UpgradeId[] = [];
  let tri = yardBuilt.triangles;

  const applyUpgrades = (): void => {
    for (const id of ['rest_place', 'sniff_corner'] as const) {
      const on = owned.includes(id);
      const ext = externalUpgrades[id];
      upgradeMeshes[id].visible = on && !ext;
      if (ext) ext.visible = on;
    }
  };

  return {
    group,
    yard,
    loudEdge,
    upgradeMeshes,
    setEnvironment(env) {
      loudEdge.visible = env === 'courtyard_loud';
    },
    setUpgrades(upgrades) {
      owned = [...upgrades];
      applyUpgrades();
    },
    setExternalUpgrade(id, object) {
      const previous = externalUpgrades[id];
      if (previous) group.remove(previous);
      if (object) {
        externalUpgrades[id] = object;
        group.add(object);
      } else {
        delete externalUpgrades[id];
      }
      applyUpgrades();
    },
    setExternalEnvironment(object) {
      if (external) group.remove(external);
      external = object;
      if (object) group.add(object);
      yard.visible = !object;
    },
    triangles() {
      return tri;
    },
    dispose() {
      disposeMesh(yard);
      disposeMesh(loudEdge);
      disposeMesh(upgradeMeshes.rest_place);
      disposeMesh(upgradeMeshes.sniff_corner);
      tri = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Contact shadow blob (baked-looking contact shading on every tier)
// ---------------------------------------------------------------------------

let blobTexture: DataTexture | null = null;

function getBlobTexture(): DataTexture {
  if (blobTexture) return blobTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - d, 1.6);
      const o = (y * size + x) * 4;
      data[o] = 58;
      data[o + 1] = 58;
      data[o + 2] = 48;
      data[o + 3] = Math.round(a * 255);
    }
  }
  blobTexture = new DataTexture(data, size, size, RGBAFormat);
  blobTexture.colorSpace = SRGBColorSpace;
  blobTexture.magFilter = LinearFilter;
  blobTexture.minFilter = LinearFilter;
  blobTexture.needsUpdate = true;
  return blobTexture;
}

let blobMaterial: MeshBasicMaterial | null = null;

export function createContactShadow(radius: number): Mesh {
  if (!blobMaterial) {
    blobMaterial = new MeshBasicMaterial({ map: getBlobTexture(), transparent: true, opacity: 0.42, depthWrite: false });
    blobMaterial.name = 'mat_contact_shadow';
  }
  const mesh = new Mesh(new CircleGeometry(radius, 24), blobMaterial);
  mesh.rotation.x = -HALF_PI;
  mesh.position.y = 0.012;
  mesh.renderOrder = 1;
  mesh.name = 'contact_shadow';
  return mesh;
}

export function contactShadowBytes(): number {
  return blobTexture ? 64 * 64 * 4 : 0;
}

export function disposeContactShadows(): void {
  blobMaterial?.dispose();
  blobMaterial = null;
  blobTexture?.dispose();
  blobTexture = null;
}

/** A simple 1-unit plane in the chalk colour used behind the yard on wide landscape frames. */
export function createBackdrop(): Mesh {
  const mesh = new Mesh(new PlaneGeometry(60, 60), standardMaterial(PALETTE.ground, { roughness: 1 }));
  mesh.rotation.x = -HALF_PI;
  mesh.position.y = -0.11;
  mesh.name = 'backdrop';
  return mesh;
}
