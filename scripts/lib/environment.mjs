/**
 * Static environment and props (no skin), v2 (WP-I, CREATIVE_PLAN F6).
 * Everything is vertex-coloured and merged per named mesh so each GLB stays at one draw call.
 *
 * Layout follows the renderer's stage positions (src/render/objects/SchoolScene.ts, Props.ts):
 * camera on +Z looking towards -Z, 7 × 7 m, origin at the centre.
 *   training circle   centre (0, 0.2), r ≈ 1.9 (stage center/left/right)
 *   shelter           back, centre-left: x −1.5…0.75, z −3.3…−1.8; food bowl zone (−1.1, −2.3) at its open left end
 *   rest deck         centre (−2.5, −1.5) 1.5 × 1.4, top 0.095; stage rest (−2.3, −1.5) sits on its right half,
 *                     blanket prop at y 0.1; deck east edge −1.75 leaves 0.2 m to the shelter's front-left post
 *   sniff corner      (2.3, −1.7): planters at (2.8, −2.4) and (3.05, −1.5)
 *   water slab        (1.8, 0.7) r 0.46, 0.06 high (water prop sits at y 0.06)
 *   gate              front-left gap x −2.55…−0.85
 * Upgrade nodes carry their stage translation so the renderer can add them as-is.
 */
import { BoxGeometry, CylinderGeometry, DodecahedronGeometry, LatheGeometry, PlaneGeometry, Vector2 } from 'three';
import { PartSet, superEllipsoid, ellipsoid, sphere, torus, smooth, deform, hexToLinear, mixColor, shade, smoothstep, clamp } from './geometry.mjs';

export const STAGE = {
  rest: [-2.3, 0, -1.5],
  sniff: [2.3, 0, -1.7],
  circle: { x: 0, z: 0.2, r: 1.9 },
  shelter: { x0: -1.5, x1: 0.75, z0: -3.3, z1: -1.8 },
  deck: { x: -2.5, z: -1.5, w: 1.5, d: 1.4, top: 0.095 },
  water: { x: 1.8, z: 0.7, r: 0.46, h: 0.06 },
  food: { x: -1.1, z: -2.3 },
  planters: [
    { x: 2.8, z: -2.4, w: 1.2, d: 0.5 },
    { x: 3.05, z: -1.5, w: 0.5, d: 1.1 },
  ],
};

const COL = {
  sand: hexToLinear('#E8DEC9'),
  sandWarm: hexToLinear('#DCCDB1'),
  sandWorn: hexToLinear('#CDBFA6'),
  lawn: hexToLinear('#AFC6AE'),
  lawnDark: hexToLinear('#8FA98A'),
  lawnDeep: hexToLinear('#7B9478'),
  wood: hexToLinear('#D9B98A'),
  woodLight: hexToLinear('#E6CCA3'),
  woodDark: hexToLinear('#B8966A'),
  woodDeep: hexToLinear('#8E6F4C'),
  roof: hexToLinear('#8C6B4A'),
  roofDark: hexToLinear('#6F5339'),
  stone: hexToLinear('#BDB7AA'),
  stoneLight: hexToLinear('#D2CCBF'),
  stoneDark: hexToLinear('#8F8A7E'),
  water: hexToLinear('#9DBBC9'),
  waterLight: hexToLinear('#C3D8E0'),
  soil: hexToLinear('#6E5A48'),
  soilDark: hexToLinear('#4F4034'),
  ceramic: hexToLinear('#D9C9B0'),
  ceramicLight: hexToLinear('#EADFCB'),
  ceramicDark: hexToLinear('#A58E72'),
  ceramicInner: hexToLinear('#8F7A60'),
  kibble: hexToLinear('#8A5A33'),
  kibbleDark: hexToLinear('#6A4426'),
  blanket: hexToLinear('#C9A98F'),
  blanketDark: hexToLinear('#AE8C72'),
  blanketEdge: hexToLinear('#8F6F58'),
  cushion: hexToLinear('#8FA98A'),
  ball: hexToLinear('#E4A67B'),
  ballSeam: hexToLinear('#B9775A'),
  toy: hexToLinear('#326B58'),
  toyLight: hexToLinear('#AFC6AE'),
  toyDark: hexToLinear('#234B3E'),
  leaf: hexToLinear('#7E9B6A'),
  leafDark: hexToLinear('#5F7A4F'),
  leafLight: hexToLinear('#9DB58A'),
  lavender: hexToLinear('#9A8CC2'),
  lavenderDark: hexToLinear('#7D6DA8'),
  lavenderLeaf: hexToLinear('#8FA48A'),
  stem: hexToLinear('#7A9A74'),
  mat: hexToLinear('#C8B59A'),
  matDark: hexToLinear('#A8937A'),
  shadeCloth: hexToLinear('#EFE7D6'),
  terracotta: hexToLinear('#C9825F'),
  terracottaDark: hexToLinear('#A3674A'),
  lantern: hexToLinear('#D1AE62'),
  lanternGlass: hexToLinear('#F2E6C4'),
  chalk: hexToLinear('#F4F0E8'),
};

// ---------------------------------------------------------------- deterministic noise
function hash2(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function vnoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z, octaves = 3) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(x * f + 7.3 * i, z * f - 3.1 * i);
    amp *= 0.5;
    f *= 2.1;
  }
  return v / (1 - amp * 2);
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- distance helpers
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Signed-ish distance outside an axis-aligned rectangle (0 inside). */
function rectDist(x, z, x0, x1, z0, z1) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  return Math.hypot(dx, dz);
}

function soft(d, inner, outer) {
  return 1 - smoothstep(inner, outer, d);
}

function boxAt(parts, w, h, d, x, y, z, color, rotY = 0, rotX = 0) {
  const g = new BoxGeometry(w, h, d);
  if (rotX) g.rotateX(rotX);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  parts.add(g, { color });
  return g;
}

function cylAt(parts, rTop, rBottom, h, x, y, z, color, radial = 10) {
  const g = new CylinderGeometry(rTop, rBottom, h, radial);
  g.translate(x, y, z);
  parts.add(smooth(g), { color });
  return g;
}

// ---------------------------------------------------------------- yard layout data
const LAWNS = [
  { x: -2.7, z: 0.9, rx: 0.75, rz: 1.15 },
  { x: 2.55, z: 2.45, rx: 0.8, rz: 0.75 },
];
const GATE = { x0: -2.55, x1: -0.85 };
const PATH = [
  [[-1.7, 3.3], [-1.2, 1.95]], // gate → circle
  [[-0.5, -1.55], [-0.6, -1.85]], // circle → shelter front
  [[-1.3, -0.95], [-1.7, -1.1]], // circle → rest deck
];
const SHRUBS = [
  { x: 3.0, z: 2.95, r: 0.4, seed: 11 },
  { x: -2.95, z: 0.35, r: 0.34, seed: 23 },
  { x: 3.05, z: -0.3, r: 0.3, seed: 37 },
  { x: -3.1, z: 2.95, r: 0.3, seed: 41 },
];
const TREE = { x: -2.75, z: -3.0, trunkH: 1.95, canopyY: 2.45 };
const STONES = [
  { x: 0.7, z: -2.85, r: 0.2, seed: 5 },
  { x: 1.15, z: -3.0, r: 0.14, seed: 9 },
  { x: 2.35, z: 1.45, r: 0.16, seed: 13 },
];
const POT = { x: 0.45, z: 3.05 };

function fencePosts() {
  const half = 3.4;
  const step = 0.85;
  const posts = [];
  const r = rng(77);
  for (let i = 0; i <= 8; i++) {
    const p = -half + step * i;
    const h = () => 0.97 + 0.07 * r();
    posts.push({ x: p, z: -half, h: h() });
    posts.push({ x: -half, z: p, h: h() });
    posts.push({ x: half, z: p, h: h() });
    if (p <= GATE.x0 + 1e-6 || p >= GATE.x1 - 1e-6) posts.push({ x: p, z: half, h: h() });
  }
  const seen = new Set();
  return posts.filter((p) => {
    const key = `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const POSTS = fencePosts();

// ---------------------------------------------------------------- ground fields
function lawnMask(x, z) {
  let m = 0;
  for (const l of LAWNS) {
    const n = (vnoise(x * 2.3 + 11, z * 2.3 - 5) - 0.5) * 0.22;
    const rho = ((Math.abs(x - l.x) / l.rx) ** 2.6 + (Math.abs(z - l.z) / l.rz) ** 2.6) ** (1 / 2.6) + n;
    m = Math.max(m, 1 - smoothstep(0.82, 1.12, rho));
  }
  return m;
}

function pathMask(x, z) {
  let m = 0;
  for (const [[ax, az], [bx, bz]] of PATH) {
    const d = segDist(x, z, ax, az, bx, bz) + (vnoise(x * 3.1, z * 3.1) - 0.5) * 0.12;
    m = Math.max(m, soft(d, 0.22, 0.5));
  }
  return m;
}

function ringMask(x, z) {
  const c = STAGE.circle;
  const d = Math.abs(Math.hypot(x - c.x, z - c.z) - c.r);
  return soft(d, 0.035, 0.11);
}

function insideCircle(x, z) {
  const c = STAGE.circle;
  return soft(Math.hypot(x - c.x, z - c.z), c.r - 0.15, c.r + 0.05);
}

function foodStoneMask(x, z) {
  const f = STAGE.food;
  const d = ((Math.abs(x - f.x) / 0.32) ** 4 + (Math.abs(z - f.z) / 0.32) ** 4) ** 0.25;
  return 1 - smoothstep(0.9, 1.05, d);
}

/** Baked contact darkening 0..1 from everything that touches the ground. */
function occlusion(x, z) {
  let k = 0;
  const s = STAGE.shelter;
  const inShelter = soft(rectDist(x, z, s.x0, s.x1, s.z0, s.z1), 0.0, 0.35);
  // stronger towards the back and left walls
  const wallBack = soft(Math.abs(z - s.z0), 0.05, 0.6);
  const wallLeft = soft(Math.abs(x - s.x0), 0.05, 0.5);
  k = Math.max(k, inShelter * (0.45 + 0.4 * Math.max(wallBack, wallLeft)));
  const d = STAGE.deck;
  k = Math.max(k, 0.85 * soft(rectDist(x, z, d.x - d.w / 2, d.x + d.w / 2, d.z - d.d / 2, d.z + d.d / 2), 0.0, 0.22));
  for (const p of STAGE.planters) {
    k = Math.max(k, 0.8 * soft(rectDist(x, z, p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2), 0.0, 0.2));
  }
  const w = STAGE.water;
  k = Math.max(k, 0.7 * soft(Math.hypot(x - w.x, z - w.z) - w.r, 0.0, 0.16));
  for (const p of POSTS) k = Math.max(k, 0.6 * soft(Math.hypot(x - p.x, z - p.z), 0.05, 0.2));
  for (const st of STONES) k = Math.max(k, 0.7 * soft(Math.hypot(x - st.x, z - st.z), st.r * 0.8, st.r * 1.5));
  for (const sh of SHRUBS) k = Math.max(k, 0.5 * soft(Math.hypot(x - sh.x, z - sh.z), sh.r * 0.6, sh.r * 1.35));
  k = Math.max(k, 0.65 * soft(Math.hypot(x - TREE.x, z - TREE.z), 0.1, 0.45));
  k = Math.max(k, 0.6 * soft(Math.hypot(x - POT.x, z - POT.z), 0.15, 0.32));
  // bench legs inside the shelter
  for (const bx of [-1.15, 0.05]) k = Math.max(k, 0.5 * soft(Math.hypot(x - bx, z + 2.95), 0.05, 0.2));
  return clamp(k, 0, 1);
}

function groundHeight(x, z) {
  const base = 0.012 * (fbm(x * 0.55 + 3, z * 0.55 - 2) * 2 - 1) + 0.012;
  const lawn = 0.014 * lawnMask(x, z);
  const worn = -0.004 * pathMask(x, z);
  return clamp(base + lawn + worn, 0, 0.03);
}

function groundColor(x, z) {
  const grain = fbm(x * 1.7, z * 1.7);
  const fine = vnoise(x * 9 + 2, z * 9 + 5);
  let c = mixColor(COL.sand, COL.sandWarm, clamp(0.25 + 0.6 * grain + 0.15 * (fine - 0.5), 0, 1));
  const inside = insideCircle(x, z);
  c = mixColor(c, mixColor(COL.sand, COL.sandWarm, 0.3), 0.35 * inside);
  c = mixColor(c, COL.sandWorn, 0.55 * ringMask(x, z));
  c = mixColor(c, COL.sandWorn, 0.5 * pathMask(x, z) * (1 - lawnMask(x, z)));
  const lawn = lawnMask(x, z);
  const lawnTone = mixColor(COL.lawn, COL.lawnDark, clamp(0.25 + 0.5 * vnoise(x * 5.5, z * 5.5) + 0.2 * (fine - 0.5), 0, 1));
  c = mixColor(c, lawnTone, lawn);
  const food = foodStoneMask(x, z);
  c = mixColor(c, mixColor(COL.stone, COL.stoneLight, 0.4 + 0.3 * fine), food);
  return shade(c, 1 - 0.34 * occlusion(x, z));
}

// ---------------------------------------------------------------- plants
function shrub(parts, x, z, r, seed, { lobes = 6, tone = 0 } = {}) {
  const rnd = rng(seed);
  for (let i = 0; i < lobes; i++) {
    const a = rnd() * Math.PI * 2;
    const spread = i === 0 ? 0 : r * (0.35 + 0.35 * rnd());
    const lr = i === 0 ? r : r * (0.5 + 0.3 * rnd());
    const ly = i === 0 ? r * 0.72 : r * (0.35 + 0.55 * rnd());
    const g = ellipsoid(lr * (1 + 0.25 * rnd()), lr * (0.7 + 0.2 * rnd()), lr * (1 + 0.25 * rnd()), 10, 7);
    g.rotateY(rnd() * Math.PI);
    g.translate(x + Math.cos(a) * spread, ly, z + Math.sin(a) * spread);
    const t = tone;
    parts.add(g, {
      color: (px, py, pz, nx, ny) => {
        const up = clamp(0.5 + 0.5 * ny, 0, 1);
        const h = clamp((py - ly + lr) / (2 * lr), 0, 1);
        const base = mixColor(COL.lawnDeep, COL.lawn, 0.2 + 0.55 * up + 0.25 * h + t);
        return mixColor(base, COL.lawnDark, 0.25 * vnoise(px * 14, pz * 14));
      },
    });
  }
}

function lavenderTuft(parts, x, z, baseY, seed, count = 10, spreadX = 0.5, spreadZ = 0.3) {
  const rnd = rng(seed);
  for (let i = 0; i < count; i++) {
    const lx = x + (rnd() - 0.5) * spreadX;
    const lz = z + (rnd() - 0.5) * spreadZ;
    const hgt = 0.16 + rnd() * 0.14;
    const lean = (rnd() - 0.5) * 0.25;
    const stem = new CylinderGeometry(0.005, 0.008, hgt, 5);
    stem.translate(0, hgt / 2, 0);
    stem.rotateZ(lean);
    stem.translate(lx, baseY, lz);
    parts.add(smooth(stem), { color: COL.stem });
    const head = ellipsoid(0.018, 0.045, 0.018, 7, 6);
    head.translate(lx - Math.sin(lean) * hgt, baseY + hgt * Math.cos(lean) + 0.03, lz);
    parts.add(head, { color: (px, py, pz, nx, ny) => mixColor(COL.lavenderDark, COL.lavender, 0.4 + 0.5 * clamp(ny, 0, 1)) });
  }
  // low leafy base
  const leaf = ellipsoid(spreadX * 0.55, 0.06, spreadZ * 0.6, 10, 6);
  leaf.translate(x, baseY + 0.04, z);
  parts.add(leaf, { color: (px, py, pz, nx, ny) => mixColor(COL.lavenderLeaf, COL.lawnDark, 0.5 - 0.5 * ny) });
}

function stone(parts, x, z, r, seed) {
  const rnd = rng(seed);
  const g = new DodecahedronGeometry(r, 1);
  g.scale(1.25 + 0.2 * rnd(), 0.62, 1 + 0.15 * rnd());
  g.rotateY(rnd() * Math.PI);
  g.translate(x, r * 0.5, z);
  // flattened bottom: nothing below the ground
  deform(g, (px, py, pz) => [px, Math.max(py, 0.0), pz]);
  parts.add(smooth(g), {
    color: (px, py, pz, nx, ny) => mixColor(COL.stoneDark, COL.stone, 0.35 + 0.55 * clamp(ny, 0, 1) + 0.1 * vnoise(px * 20, pz * 20)),
  });
}

// ---------------------------------------------------------------- courtyard
export function buildCourtyard() {
  const parts = new PartSet();
  const size = 7;
  const half = size / 2;

  // ground: undulating plane with baked colour, on a thin skirt
  const ground = new PlaneGeometry(size, size, 64, 64);
  ground.rotateX(-Math.PI / 2);
  deform(ground, (x, y, z) => [x, groundHeight(x, z), z]);
  parts.add(ground, { color: (x, y, z) => groundColor(x, z) });
  const skirt = new BoxGeometry(size, 0.08, size);
  skirt.translate(0, -0.04, 0);
  parts.add(skirt, { color: (x, y, z, nx, ny) => (ny > 0.5 ? COL.sandWarm : shade(COL.sandWarm, 0.88)) });

  // fence: posts with caps (varied heights), two rails, gate leaning open at the front-left
  for (const p of POSTS) {
    boxAt(parts, 0.1, p.h, 0.1, p.x, p.h / 2, p.z, (x, y, z, nx, ny) => (ny > 0.5 ? COL.wood : mixColor(COL.woodDark, COL.woodDeep, 0.3 * (1 - y / p.h))));
    const cap = new BoxGeometry(0.14, 0.035, 0.14);
    cap.translate(p.x, p.h + 0.015, p.z);
    parts.add(cap, { color: COL.woodLight });
  }
  const railColor = (x, y, z, nx, ny) => (ny > 0.5 ? COL.woodLight : ny < -0.5 ? COL.woodDark : COL.wood);
  for (const y of [0.38, 0.78]) {
    boxAt(parts, size - 0.2, 0.07, 0.045, 0, y, -half + 0.1, railColor);
    boxAt(parts, 0.045, 0.07, size - 0.2, -half + 0.1, y, 0, railColor);
    boxAt(parts, 0.045, 0.07, size - 0.2, half - 0.1, y, 0, railColor);
    const leftLen = GATE.x0 - (-half + 0.1);
    boxAt(parts, leftLen, 0.07, 0.045, -half + 0.1 + leftLen / 2, y, half - 0.1, railColor);
    const rightLen = half - 0.1 - GATE.x1;
    boxAt(parts, rightLen, 0.07, 0.045, GATE.x1 + rightLen / 2, y, half - 0.1, railColor);
  }
  {
    // gate panel hinged at the left gate post, swung inward
    const gw = GATE.x1 - GATE.x0 - 0.12;
    const swing = 0.6;
    const gate = new PartSet();
    for (const y of [0.3, 0.72]) boxAt(gate, gw, 0.06, 0.035, gw / 2, y, 0, COL.wood);
    for (let i = 0; i < 5; i++) boxAt(gate, 0.07, 0.86, 0.03, 0.08 + (i * (gw - 0.16)) / 4, 0.5, 0.025, COL.woodLight);
    boxAt(gate, gw * 0.95, 0.05, 0.03, gw / 2, 0.5, -0.025, COL.woodDark, 0, 0);
    for (const g of gate.parts) {
      g.rotateY(swing);
      g.translate(GATE.x0 + 0.06, 0.02, half - 0.1);
      const colors = g.getAttribute('color');
      parts.add(g, { color: (x, y, z, nx, ny, nz, i) => [colors.getX(0), colors.getY(0), colors.getZ(0)] });
    }
  }

  // shelter: posts, two slatted walls, bench, beams and a low overhanging roof
  {
    const s = STAGE.shelter;
    const cx = (s.x0 + s.x1) / 2;
    const w = s.x1 - s.x0;
    const d = s.z1 - s.z0;
    const hBack = 2.3;
    const hFront = 2.05;
    const postColor = (x, y, z, nx, ny) => mixColor(COL.woodDeep, COL.woodDark, 0.4 + 0.6 * clamp(y / 2.3, 0, 1));
    for (const [px, pz, ph] of [[s.x0 + 0.08, s.z0 + 0.08, hBack], [s.x1 - 0.08, s.z0 + 0.08, hBack], [s.x0 + 0.08, s.z1 - 0.08, hFront], [s.x1 - 0.08, s.z1 - 0.08, hFront]]) {
      boxAt(parts, 0.13, ph, 0.13, px, ph / 2, pz, postColor);
    }
    // back wall slats (vertical boards with gaps)
    const slatColor = (idx) => (x, y, z, nx, ny, nz) => {
      const base = mixColor(COL.wood, COL.woodLight, 0.5 + 0.5 * Math.sin(idx * 2.3));
      return nz > 0.5 || nx > 0.5 ? base : shade(base, 0.8);
    };
    const boards = 9;
    const bw = (w - 0.3) / boards;
    for (let i = 0; i < boards; i++) {
      const bx = s.x0 + 0.15 + bw * (i + 0.5);
      boxAt(parts, bw - 0.025, 1.9, 0.03, bx, 1.08, s.z0 + 0.18, slatColor(i));
    }
    // left wall slats
    const sideBoards = 5;
    const sw = (d - 0.3) / sideBoards;
    for (let i = 0; i < sideBoards; i++) {
      const bz = s.z0 + 0.15 + sw * (i + 0.5);
      boxAt(parts, 0.03, 1.85, sw - 0.025, s.x0 + 0.18, 1.05, bz, slatColor(i + 3));
    }
    // horizontal battens holding the slats
    boxAt(parts, w - 0.2, 0.06, 0.04, cx, 1.95, s.z0 + 0.22, COL.woodDark);
    boxAt(parts, w - 0.2, 0.06, 0.04, cx, 0.3, s.z0 + 0.22, COL.woodDark);
    boxAt(parts, 0.04, 0.06, d - 0.2, s.x0 + 0.22, 1.9, (s.z0 + s.z1) / 2, COL.woodDark);
    // bench along the back wall
    const benchZ = s.z0 + 0.52;
    boxAt(parts, 1.35, 0.055, 0.4, -0.55, 0.45, benchZ, (x, y, z, nx, ny) => (ny > 0.5 ? COL.woodLight : COL.wood));
    boxAt(parts, 0.07, 0.42, 0.34, -1.15, 0.21, benchZ, COL.woodDark);
    boxAt(parts, 0.07, 0.42, 0.34, 0.05, 0.21, benchZ, COL.woodDark);
    boxAt(parts, 1.2, 0.05, 0.05, -0.55, 0.12, benchZ, COL.woodDark);
    // beams: two across (x), five rafters (z), then the roof slab with overhang and slope to the front
    const slope = Math.atan2(hBack - hFront, d);
    boxAt(parts, w + 0.25, 0.1, 0.12, cx, hBack - 0.02, s.z0 + 0.08, COL.woodDark);
    boxAt(parts, w + 0.25, 0.1, 0.12, cx, hFront - 0.02, s.z1 - 0.08, COL.woodDark);
    for (let i = 0; i < 5; i++) {
      const rx = s.x0 - 0.05 + ((w + 0.1) * i) / 4;
      const rg = new BoxGeometry(0.08, 0.09, d + 0.5);
      rg.rotateX(slope);
      rg.translate(rx, (hBack + hFront) / 2 + 0.07, (s.z0 + s.z1) / 2);
      parts.add(rg, { color: COL.woodDark });
    }
    const roof = new BoxGeometry(w + 0.5, 0.06, d + 0.6, 6, 1, 4);
    roof.rotateX(slope);
    roof.translate(cx, (hBack + hFront) / 2 + 0.16, (s.z0 + s.z1) / 2 - 0.03);
    parts.add(roof, {
      color: (x, y, z, nx, ny) => (ny > 0.3 ? mixColor(COL.roof, COL.roofDark, 0.3 + 0.4 * vnoise(x * 3, z * 6)) : ny < -0.3 ? COL.wood : COL.roofDark),
    });
    // roof ridge board at the back edge
    boxAt(parts, w + 0.5, 0.08, 0.05, cx, hBack + 0.22, s.z0 - 0.3, COL.roofDark);
  }

  // water place: raised stone slab (water prop sits on top at y 0.06)
  {
    const w = STAGE.water;
    const slab = new CylinderGeometry(w.r - 0.03, w.r, w.h, 20);
    slab.translate(w.x, w.h / 2, w.z);
    parts.add(smooth(slab), { color: (x, y, z, nx, ny) => (ny > 0.5 ? mixColor(COL.stone, COL.stoneLight, 0.5 + 0.3 * vnoise(x * 12, z * 12)) : COL.stoneDark) });
  }

  // rest deck: wooden platform with slats, a low side rail, a folded blanket (always present)
  {
    const d = STAGE.deck;
    boxAt(parts, d.w, 0.07, d.d, d.x, 0.045, d.z, COL.woodDark);
    const slats = 9;
    const slatW = (d.w - 0.06) / slats;
    for (let i = 0; i < slats; i++) {
      const sx = d.x - d.w / 2 + 0.03 + slatW * (i + 0.5);
      const tone = 0.35 + 0.65 * hash2(i, 3);
      boxAt(parts, slatW - 0.022, 0.03, d.d - 0.04, sx, d.top - 0.015, d.z, (x, y, z, nx, ny) => (ny > 0.5 ? mixColor(COL.wood, COL.woodLight, tone) : COL.woodDark));
    }
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      boxAt(parts, 0.1, 0.03, 0.1, d.x + dx * (d.w / 2 - 0.1), 0.015, d.z + dz * (d.d / 2 - 0.1), COL.woodDeep);
    }
    // low rail on the left side
    boxAt(parts, 0.05, 0.42, d.d, d.x - d.w / 2 + 0.03, d.top + 0.21, d.z, COL.woodDark);
    boxAt(parts, 0.07, 0.05, d.d + 0.04, d.x - d.w / 2 + 0.03, d.top + 0.43, d.z, COL.woodLight);
    // folded blanket at the back-left corner of the deck
    const bx = d.x - 0.42;
    const bz = d.z - 0.42;
    const foldColor = (x, y, z, nx, ny) => {
      const edge = smoothstep(0.012, 0.03, Math.abs(y - (d.top + 0.035)));
      return mixColor(mixColor(COL.blanket, COL.blanketDark, 0.5 + 0.4 * Math.sin(x * 40) * Math.cos(z * 25)), COL.blanketEdge, 0.3 * (1 - edge));
    };
    const b1 = superEllipsoid(0.26, 0.03, 0.2, 0.45, 0.4, 6, 18);
    deform(b1, (x, y, z) => [x, y + 0.006 * Math.sin(x * 30) * Math.cos(z * 22), z]);
    b1.translate(bx, d.top + 0.03, bz);
    parts.add(b1, { color: foldColor });
    const b2 = superEllipsoid(0.2, 0.028, 0.17, 0.45, 0.4, 6, 16);
    deform(b2, (x, y, z) => [x, y + 0.006 * Math.cos(x * 28) * Math.sin(z * 20), z]);
    b2.rotateY(0.18);
    b2.translate(bx + 0.03, d.top + 0.085, bz + 0.02);
    parts.add(b2, { color: (x, y, z, nx, ny) => mixColor(COL.blanketDark, COL.blanket, 0.4 + 0.5 * clamp(ny, 0, 1)) });
  }

  // sniff corner base: two planters with soil (plants come with the upgrade)
  for (const p of STAGE.planters) {
    boxAt(parts, p.w, 0.4, p.d, p.x, 0.2, p.z, (x, y, z, nx, ny) => mixColor(COL.woodDark, COL.woodDeep, 0.4 * (1 - clamp(y / 0.4, 0, 1))));
    boxAt(parts, p.w - 0.07, 0.04, p.d - 0.07, p.x, 0.39, p.z, (x, y, z) => mixColor(COL.soil, COL.soilDark, 0.5 + 0.5 * vnoise(x * 18, z * 18)));
    boxAt(parts, p.w + 0.05, 0.045, p.d + 0.05, p.x, 0.412, p.z, (x, y, z, nx, ny) => (ny > 0.5 ? COL.woodLight : COL.wood));
  }

  // plants: four layered shrubs, a small tree behind the shelter, a potted plant at the front
  for (const sh of SHRUBS) shrub(parts, sh.x, sh.z, sh.r, sh.seed);
  {
    const t = TREE;
    const trunk = new CylinderGeometry(0.075, 0.12, t.trunkH, 10);
    trunk.translate(t.x, t.trunkH / 2, t.z);
    parts.add(smooth(trunk), { color: (x, y, z, nx) => mixColor(COL.woodDeep, COL.woodDark, 0.5 + 0.5 * nx) });
    const branch = new CylinderGeometry(0.035, 0.06, 0.7, 7);
    branch.rotateZ(0.9);
    branch.translate(t.x + 0.3, t.trunkH - 0.1, t.z + 0.1);
    parts.add(smooth(branch), { color: COL.woodDeep });
    const rnd = rng(99);
    const lobes = [[0, 0, 0, 0.78], [0.45, 0.25, 0.2, 0.55], [-0.35, 0.3, -0.1, 0.5], [0.1, 0.55, 0.3, 0.42], [-0.1, -0.2, 0.45, 0.45]];
    for (const [dx, dy, dz, lr] of lobes) {
      const g = ellipsoid(lr * 1.1, lr * 0.8, lr, 12, 8);
      g.rotateY(rnd() * 3);
      g.translate(t.x + dx, t.canopyY + dy, t.z + dz);
      parts.add(g, {
        color: (px, py, pz, nx, ny) => mixColor(COL.lawnDeep, COL.lawn, 0.15 + 0.55 * clamp(0.5 + 0.5 * ny, 0, 1) + 0.25 * vnoise(px * 6, py * 6)),
      });
    }
  }
  {
    const pot = new LatheGeometry([new Vector2(0, 0), new Vector2(0.13, 0), new Vector2(0.17, 0.28), new Vector2(0.19, 0.3), new Vector2(0.17, 0.32), new Vector2(0.13, 0.3), new Vector2(0.12, 0.24), new Vector2(0, 0.24)], 18);
    pot.translate(POT.x, 0, POT.z);
    parts.add(smooth(pot), { color: (x, y, z, nx, ny) => (y > 0.23 && y < 0.25 && ny > 0.5 ? COL.soil : mixColor(COL.terracottaDark, COL.terracotta, 0.4 + 0.6 * clamp(ny + 0.3, 0, 1))) });
    shrub(parts, POT.x, POT.z, 0.19, 61, { lobes: 5 });
    // lift the pot plant onto the soil level
    const last = parts.parts.slice(-5);
    for (const g of last) g.translate(0, 0.2, 0);
  }
  for (const st of STONES) stone(parts, st.x, st.z, st.r, st.seed);

  return parts.merge();
}

// ---------------------------------------------------------------- care props
function bowl(withWater) {
  const parts = new PartSet();
  // ceramic bowl: outer wall, rolled rim, inner wall, deeper floor
  const pts = [
    [0.0, 0.0], [0.055, 0.0], [0.08, 0.008], [0.098, 0.03], [0.106, 0.058], [0.108, 0.068], [0.104, 0.074], [0.096, 0.074],
    [0.09, 0.068], [0.086, 0.055], [0.078, 0.035], [0.062, 0.022], [0.03, 0.018], [0.0, 0.017],
  ];
  const lathe = new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), 36);
  parts.add(smooth(lathe), {
    color: (x, y, z, nx, ny) => {
      const r = Math.hypot(x, z);
      const inner = r < 0.092 && y > 0.016 && y < 0.072;
      if (inner) return mixColor(COL.ceramicInner, COL.ceramicDark, clamp((y - 0.02) / 0.05, 0, 1));
      if (y > 0.064) return COL.ceramicLight; // rim
      if (y < 0.006) return COL.ceramicDark; // foot
      return mixColor(COL.ceramic, COL.ceramicLight, 0.3 + 0.4 * clamp(ny, 0, 1));
    },
  });
  if (withWater) {
    const water = new CylinderGeometry(0.086, 0.078, 0.004, 28);
    water.translate(0, 0.05, 0);
    parts.add(smooth(water), {
      color: (x, y, z) => {
        const r = Math.hypot(x, z);
        return mixColor(COL.waterLight, COL.water, smoothstep(0.02, 0.085, r) * 0.8 + 0.1 * Math.sin(r * 90));
      },
    });
  } else {
    const rnd = rng(3);
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 0.06;
      const k = ellipsoid(0.012, 0.008, 0.01, 7, 5);
      k.rotateY(rnd() * 3);
      k.translate(Math.cos(a) * rr, 0.026 + 0.012 * (rnd() < 0.3 ? 1 : 0), Math.sin(a) * rr);
      parts.add(k, { color: (x, y, z, nx, ny) => mixColor(COL.kibbleDark, COL.kibble, 0.4 + 0.6 * clamp(ny, 0, 1)) });
    }
  }
  return parts.merge();
}

export function buildCareProps() {
  const meshes = [];
  meshes.push({ name: 'prop_bowl', nodeName: 'bowl', geometry: bowl(false) });
  meshes.push({ name: 'prop_water', nodeName: 'water', geometry: bowl(true) });

  // blanket: soft slab with folds, a turned-over flap and a darker stitched border
  {
    const parts = new PartSet();
    const slab = superEllipsoid(0.32, 0.017, 0.24, 0.45, 0.35, 8, 26);
    deform(slab, (x, y, z) => [x, y + 0.007 * Math.sin(x * 32 + 1) * Math.cos(z * 24) + 0.004 * Math.sin(z * 50), z]);
    slab.translate(0, 0.018, 0);
    parts.add(slab, {
      color: (x, y, z, nx, ny) => {
        const border = 1 - smoothstep(0.0, 0.03, Math.min(0.32 - Math.abs(x), 0.24 - Math.abs(z)));
        const weave = 0.5 + 0.3 * Math.sin(x * 70) * Math.sin(z * 70);
        return mixColor(mixColor(COL.blanket, COL.blanketDark, weave * (0.6 + 0.4 * (1 - clamp(ny, 0, 1)))), COL.blanketEdge, 0.6 * border);
      },
    });
    const flap = superEllipsoid(0.29, 0.013, 0.07, 0.45, 0.5, 5, 18);
    deform(flap, (x, y, z) => [x, y + 0.005 * Math.sin(x * 40), z]);
    flap.rotateX(-0.08);
    flap.translate(0, 0.046, 0.16);
    parts.add(flap, { color: (x, y, z, nx, ny) => mixColor(COL.blanketDark, COL.blanket, 0.3 + 0.5 * clamp(ny, 0, 1)) });
    meshes.push({ name: 'prop_blanket', nodeName: 'blanket', geometry: parts.merge() });
  }
  // ball with a curved seam
  {
    const parts = new PartSet();
    const r = 0.042;
    const b = sphere(r, 24, 16);
    b.translate(0, r, 0);
    parts.add(b, {
      color: (x, y, z, nx, ny, nz) => {
        // two orthogonal great-circle seams, tilted
        const yy = y - r;
        const s1 = Math.abs(0.6 * x + 0.8 * yy) / r;
        const s2 = Math.abs(0.8 * z - 0.6 * yy) / r;
        const seam = Math.min(s1, s2) < 0.08 ? 1 : 0;
        const base = mixColor(COL.ball, shade(COL.ball, 0.9), 0.5 - 0.5 * ny);
        return seam ? COL.ballSeam : base;
      },
    });
    meshes.push({ name: 'prop_ball', nodeName: 'ball', geometry: parts.merge() });
  }
  // rolling treat toy: ridged cylinder on its side, treat opening at one end, cap at the other
  {
    const parts = new PartSet();
    const R = 0.036;
    const body = new CylinderGeometry(R, R, 0.12, 22, 1);
    body.rotateZ(Math.PI / 2);
    body.translate(0, R, 0);
    parts.add(smooth(body), { color: (x, y, z, nx, ny) => mixColor(COL.toyDark, COL.toy, 0.5 + 0.5 * clamp(ny, 0, 1)) });
    for (const dx of [-0.045, -0.015, 0.015, 0.045]) {
      const ridge = torus(R, 0.006, 7, 22);
      ridge.rotateY(Math.PI / 2);
      ridge.translate(dx, R, 0);
      parts.add(ridge, { color: COL.toyLight });
    }
    const cap = sphere(0.031, 14, 10);
    cap.scale(0.6, 1, 1);
    cap.translate(0.062, R, 0);
    parts.add(cap, { color: COL.toyLight });
    const opening = new CylinderGeometry(0.018, 0.018, 0.004, 14);
    opening.rotateZ(Math.PI / 2);
    opening.translate(-0.061, R, 0);
    parts.add(smooth(opening), { color: COL.toyDark });
    const lip = torus(0.022, 0.005, 6, 16);
    lip.rotateY(Math.PI / 2);
    lip.translate(-0.06, R, 0);
    parts.add(lip, { color: COL.toyLight });
    meshes.push({ name: 'prop_toy_rolling', nodeName: 'toy_rolling', geometry: parts.merge() });
  }
  // leaf: curled blade with midrib, lighter veins and a stem
  {
    const parts = new PartSet();
    const blade = ellipsoid(0.036, 0.0035, 0.062, 16, 10);
    deform(blade, (x, y, z) => {
      const curl = 0.012 * (x / 0.036) ** 2 + 0.006 * Math.max(0, z / 0.062) ** 2;
      const rib = 0.003 * Math.exp(-((x / 0.006) ** 2));
      return [x, y + curl + rib, z];
    });
    blade.translate(0, 0.0035, 0);
    parts.add(blade, {
      color: (x, y, z) => {
        const rib = 1 - smoothstep(0.0, 0.004, Math.abs(x));
        const veins = Math.max(0, Math.sin((z + 0.06) * 180 + Math.abs(x) * 60)) > 0.97 ? 1 : 0;
        const base = mixColor(COL.leaf, COL.leafLight, 0.3 + 0.4 * (z / 0.062 + 0.5) * 0.5);
        return mixColor(mixColor(base, COL.leafDark, 0.3 * (1 - rib) * 0.3 + 0.7 * rib), COL.leafLight, 0.5 * veins);
      },
    });
    const stem = new CylinderGeometry(0.0025, 0.0035, 0.034, 6);
    stem.rotateX(Math.PI / 2 + 0.2);
    stem.translate(0, 0.006, -0.072);
    parts.add(smooth(stem), { color: COL.leafDark });
    meshes.push({ name: 'prop_leaf', nodeName: 'leaf', geometry: parts.merge() });
  }
  return meshes;
}

// ---------------------------------------------------------------- upgrades (nodes carry their stage translation)
export function buildUpgrades() {
  const meshes = [];
  // rest place: shade cloth on four posts around the deck, cushion, lantern
  {
    const parts = new PartSet();
    const d = STAGE.deck;
    const top = d.top;
    // deck centre relative to the stage point (node translation = STAGE.rest)
    const ox = d.x - STAGE.rest[0];
    const oz = d.z - STAGE.rest[2];
    const px = d.w / 2 + 0.08;
    const pz = d.d / 2 + 0.08;
    for (const [dx, dz] of [[ox - px, oz - pz], [ox + px, oz - pz], [ox - px, oz + pz], [ox + px, oz + pz]]) {
      const post = new CylinderGeometry(0.03, 0.036, 1.5, 10);
      post.translate(dx, 0.75, dz);
      parts.add(smooth(post), { color: COL.woodDark });
      const foot = new CylinderGeometry(0.06, 0.07, 0.04, 10);
      foot.translate(dx, 0.02, dz);
      parts.add(smooth(foot), { color: COL.woodDeep });
    }
    for (const [ax, az, len, alongX] of [[ox, oz - pz, px * 2, true], [ox, oz + pz, px * 2, true], [ox - px, oz, pz * 2, false], [ox + px, oz, pz * 2, false]]) {
      const bar = new CylinderGeometry(0.018, 0.018, len, 8);
      if (alongX) bar.rotateZ(Math.PI / 2);
      else bar.rotateX(Math.PI / 2);
      bar.translate(ax, 1.5, az);
      parts.add(smooth(bar), { color: COL.woodDark });
    }
    const cloth = new PlaneGeometry(px * 2 + 0.14, pz * 2 + 0.14, 10, 8);
    cloth.rotateX(-Math.PI / 2);
    deform(cloth, (x, y, z) => [x, y - 0.07 * (1 - (x / (px + 0.07)) ** 2) * (1 - (z / (pz + 0.07)) ** 2), z]);
    cloth.translate(ox, 1.56, oz);
    const clothTop = parts.parts.length;
    parts.add(cloth, { color: (x, y, z) => mixColor(COL.shadeCloth, COL.chalk, 0.5 + 0.5 * Math.sin(x * 12)) });
    const clothUnder = cloth.clone();
    // underside faces downward
    const idx = clothUnder.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    clothUnder.computeVertexNormals();
    clothUnder.translate(0, -0.004, 0);
    parts.add(clothUnder, { color: mixColor(COL.shadeCloth, COL.woodDark, 0.25) });
    void clothTop;
    const cushion = superEllipsoid(0.3, 0.065, 0.24, 0.45, 0.5, 8, 18);
    deform(cushion, (x, y, z) => [x, y * (1 - 0.25 * Math.exp(-((x / 0.16) ** 2) - (z / 0.12) ** 2)), z]);
    cushion.translate(ox + 0.35, top + 0.065, oz + 0.25);
    parts.add(cushion, { color: (x, y, z, nx, ny) => mixColor(mixColor(COL.cushion, COL.lawn, 0.4 + 0.5 * clamp(ny, 0, 1)), COL.lawnDark, 0.15 * Math.sin(x * 60)) });
    const piping = torus(0.27, 0.01, 6, 28);
    piping.scale(1, 1, 0.8);
    piping.rotateX(Math.PI / 2);
    piping.translate(ox + 0.35, top + 0.07, oz + 0.25);
    parts.add(piping, { color: COL.lawnDark });
    // lantern on the deck
    const lx = ox - 0.5;
    const lz = oz + 0.5;
    cylAt(parts, 0.07, 0.085, 0.03, lx, top + 0.015, lz, COL.woodDeep, 12);
    const glass = new CylinderGeometry(0.05, 0.055, 0.16, 12);
    glass.translate(lx, top + 0.11, lz);
    parts.add(smooth(glass), { color: (x, y, z, nx, ny) => mixColor(COL.lanternGlass, COL.lantern, 0.3 + 0.4 * (1 - clamp(ny, 0, 1))) });
    cylAt(parts, 0.03, 0.07, 0.04, lx, top + 0.21, lz, COL.woodDeep, 12);
    const handle = torus(0.045, 0.006, 6, 16);
    handle.rotateY(Math.PI / 2);
    handle.translate(lx, top + 0.26, lz);
    parts.add(handle, { color: COL.lantern });
    meshes.push({ name: 'upgrade_rest_place', nodeName: 'rest_place', geometry: parts.merge(), translation: STAGE.rest });
  }
  // sniff corner: lavender in the planters, a snuffle mat, a low lavender hedge along the back fence
  {
    const parts = new PartSet();
    const [sx, , sz] = STAGE.sniff;
    const rel = (x, z) => [x - sx, z - sz];
    const [a, b] = STAGE.planters;
    const [ax, az] = rel(a.x, a.z);
    lavenderTuft(parts, ax - 0.3, az, 0.41, 71, 8, 0.4, 0.3);
    lavenderTuft(parts, ax + 0.3, az, 0.41, 73, 8, 0.4, 0.3);
    const [bx, bz] = rel(b.x, b.z);
    shrub(parts, bx, bz - 0.25, 0.2, 83, { lobes: 5 });
    shrub(parts, bx, bz + 0.25, 0.17, 89, { lobes: 4 });
    const lifted = parts.parts.slice(-9);
    for (const g of lifted) g.translate(0, 0.38, 0);
    // snuffle mat with nubs
    const [mx, mz] = rel(1.95, -1.3);
    const mat = superEllipsoid(0.45, 0.014, 0.3, 0.4, 0.4, 4, 18);
    deform(mat, (x, y, z) => [x, y + 0.004 * Math.sin(x * 30) * Math.cos(z * 30), z]);
    mat.translate(mx, 0.014, mz);
    parts.add(mat, { color: (x, y, z) => mixColor(COL.mat, COL.matDark, 0.5 + 0.3 * Math.sin(x * 50) * Math.sin(z * 50)) });
    const rnd = rng(17);
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 5; j++) {
        const nub = ellipsoid(0.028, 0.03 + 0.01 * rnd(), 0.028, 7, 5);
        nub.translate(mx - 0.36 + i * 0.12 + (rnd() - 0.5) * 0.02, 0.035, mz - 0.22 + j * 0.11 + (rnd() - 0.5) * 0.02);
        const c = (i + j) % 3 === 0 ? COL.cushion : (i + j) % 3 === 1 ? COL.matDark : COL.terracotta;
        parts.add(nub, { color: (x, y, z, nx, ny) => mixColor(shade(c, 0.8), c, 0.4 + 0.6 * clamp(ny, 0, 1)) });
      }
    }
    // low hedge along the back fence between shelter and planter
    const [hx0] = rel(1.0, 0);
    const [hx1, hz] = rel(2.05, -3.1);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = hx0 + ((hx1 - hx0) * (i + 0.5)) / n;
      const g = ellipsoid(0.17, 0.13, 0.15, 10, 7);
      g.translate(x, 0.12, hz + (i % 2) * 0.03);
      parts.add(g, { color: (px, py, pz, nx, ny) => mixColor(COL.lavenderLeaf, COL.lawnDeep, 0.5 - 0.45 * ny) });
      lavenderTuft(parts, x, hz, 0.14, 101 + i, 5, 0.22, 0.16);
    }
    meshes.push({ name: 'upgrade_sniff_corner', nodeName: 'sniff_corner', geometry: parts.merge(), translation: STAGE.sniff });
  }
  return meshes;
}
