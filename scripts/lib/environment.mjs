/**
 * Static environment and props (no skin): school courtyard, care props, upgrade props.
 * Everything is vertex-coloured and merged per named mesh so each GLB stays at a few draw calls.
 * Courtyard layout (camera at +Z looking towards -Z): shelter back-left (-X, -Z), sniff corner
 * back-right (+X, -Z), rest platform right (+X), water zone front-left.
 */
import { BoxGeometry, CylinderGeometry, DodecahedronGeometry, IcosahedronGeometry, LatheGeometry, Vector2 } from 'three';
import { PartSet, superEllipsoid, ellipsoid, sphere, torus, smooth, hexToLinear, mixColor, smoothstep } from './geometry.mjs';

const COL = {
  sand: hexToLinear('#E6DCC8'),
  sandDark: hexToLinear('#D9CDB6'),
  lawn: hexToLinear('#AFC6AE'),
  lawnDark: hexToLinear('#8FA98A'),
  wood: hexToLinear('#D9B98A'),
  woodDark: hexToLinear('#B8966A'),
  roof: hexToLinear('#8C6B4A'),
  stone: hexToLinear('#B9B4A8'),
  stoneDark: hexToLinear('#8F8A7E'),
  water: hexToLinear('#9DBBC9'),
  waterRing: hexToLinear('#C8D6DB'),
  soil: hexToLinear('#6E5A48'),
  ceramic: hexToLinear('#D9C9B0'),
  ceramicDark: hexToLinear('#B49F82'),
  kibble: hexToLinear('#8A5A33'),
  blanket: hexToLinear('#C9A98F'),
  blanketDark: hexToLinear('#B08C72'),
  cushion: hexToLinear('#8FA98A'),
  ball: hexToLinear('#E4A67B'),
  ballDark: hexToLinear('#C98557'),
  toy: hexToLinear('#326B58'),
  toyLight: hexToLinear('#AFC6AE'),
  leaf: hexToLinear('#7E9B6A'),
  leafDark: hexToLinear('#5F7A4F'),
  lavender: hexToLinear('#9A8CC2'),
  lavenderStem: hexToLinear('#7A9A74'),
  mat: hexToLinear('#C8B59A'),
  matDark: hexToLinear('#A8937A'),
  shade: hexToLinear('#E8DFCB'),
};

function boxAt(parts, w, h, d, x, y, z, color, rotY = 0) {
  const g = new BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  parts.add(g, { color });
}

// ---------------------------------------------------------------- courtyard
export function buildCourtyard() {
  const parts = new PartSet();
  const size = 7;
  // ground slab with a faint vertex-colour variation
  const ground = new BoxGeometry(size, 0.08, size, 14, 1, 14);
  ground.translate(0, -0.04, 0);
  parts.add(ground, {
    color: (x, y, z, nx, ny) => (ny > 0.5 ? mixColor(COL.sand, COL.sandDark, 0.5 + 0.5 * Math.sin(x * 2.1) * Math.cos(z * 1.7)) : COL.sandDark),
  });
  // lawn patch (front-left of centre, slightly raised)
  const lawn = superEllipsoid(1.6, 0.02, 1.2, 0.5, 0.55, 4, 20);
  lawn.translate(-1.1, 0.012, 1.0);
  parts.add(lawn, { color: (x, y, z, nx, ny) => mixColor(COL.lawn, COL.lawnDark, 0.3 + 0.3 * Math.sin(x * 5) * Math.cos(z * 4)) });

  // fence: posts and two rails around the perimeter, gap at the front-centre for the entrance
  const half = size / 2 - 0.1;
  const postEvery = 1.0;
  const posts = [];
  for (let i = -3; i <= 3; i++) {
    const p = i * postEvery;
    posts.push([p, -half]); // back
    posts.push([-half, p]); // left
    posts.push([half, p]); // right
    if (Math.abs(p) >= 1.0) posts.push([p, half]); // front with entrance gap
  }
  const seen = new Set();
  for (const [x, z] of posts) {
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    boxAt(parts, 0.1, 1.0, 0.1, x, 0.5, z, COL.woodDark);
    const cap = new BoxGeometry(0.13, 0.04, 0.13);
    cap.translate(x, 1.02, z);
    parts.add(cap, { color: COL.wood });
  }
  const railY = [0.42, 0.82];
  for (const y of railY) {
    boxAt(parts, size - 0.2, 0.06, 0.04, 0, y, -half, COL.wood);
    boxAt(parts, 0.04, 0.06, size - 0.2, -half, y, 0, COL.wood);
    boxAt(parts, 0.04, 0.06, size - 0.2, half, y, 0, COL.wood);
    boxAt(parts, half - 1.0, 0.06, 0.04, -(1.0 + (half - 1.0) / 2), y, half, COL.wood);
    boxAt(parts, half - 1.0, 0.06, 0.04, 1.0 + (half - 1.0) / 2, y, half, COL.wood);
  }

  // shelter back-left: 4 posts, flat sloped roof, low back wall
  const sx = -2.3;
  const sz = -2.3;
  const sw = 1.8;
  const sd = 1.5;
  const heights = [2.1, 2.1, 1.85, 1.85];
  const corners = [[sx - sw / 2, sz - sd / 2], [sx + sw / 2, sz - sd / 2], [sx - sw / 2, sz + sd / 2], [sx + sw / 2, sz + sd / 2]];
  corners.forEach(([x, z], i) => boxAt(parts, 0.12, heights[i], 0.12, x, heights[i] / 2, z, COL.woodDark));
  const roof = new BoxGeometry(sw + 0.4, 0.08, sd + 0.4);
  roof.rotateX(Math.atan2(0.25, sd));
  roof.translate(sx, 2.02, sz);
  parts.add(roof, { color: (x, y, z, nx, ny) => (ny > 0.5 ? COL.roof : COL.woodDark) });
  boxAt(parts, sw, 0.9, 0.05, sx, 0.45, sz - sd / 2 + 0.02, COL.wood);
  // bench inside the shelter
  boxAt(parts, 1.2, 0.06, 0.35, sx, 0.42, sz - 0.3, COL.wood);
  boxAt(parts, 0.08, 0.4, 0.3, sx - 0.5, 0.2, sz - 0.3, COL.woodDark);
  boxAt(parts, 0.08, 0.4, 0.3, sx + 0.5, 0.2, sz - 0.3, COL.woodDark);

  // water bowl zone marker (flat ring on the ground, front-left near the lawn edge)
  const ring = torus(0.32, 0.03, 6, 32);
  ring.rotateX(Math.PI / 2);
  ring.translate(-1.2, 0.012, 0.3);
  parts.add(ring, { color: COL.waterRing });
  const disc = new CylinderGeometry(0.3, 0.3, 0.01, 24);
  disc.translate(-1.2, 0.008, 0.3);
  parts.add(smooth(disc), { color: mixColor(COL.sand, COL.water, 0.35) });

  // rest place at the right: low wooden platform
  const platform = superEllipsoid(0.7, 0.05, 0.5, 0.35, 0.35, 4, 16);
  platform.translate(2.3, 0.05, 0.5);
  parts.add(platform, { color: (x, y, z, nx, ny) => (ny > 0.5 ? COL.wood : COL.woodDark) });
  for (const [dx, dz] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) {
    boxAt(parts, 0.1, 0.05, 0.1, 2.3 + dx, 0.025, 0.5 + dz, COL.woodDark);
  }

  // sniff corner base at the back-right: two empty planter boxes
  for (const [px, pz] of [[2.0, -2.5], [2.8, -2.5]]) {
    const outer = new BoxGeometry(0.7, 0.4, 0.5);
    outer.translate(px, 0.2, pz);
    parts.add(outer, { color: COL.woodDark });
    const soil = new BoxGeometry(0.62, 0.05, 0.42);
    soil.translate(px, 0.395, pz);
    parts.add(soil, { color: COL.soil });
    const rim = new BoxGeometry(0.74, 0.04, 0.54);
    rim.translate(px, 0.41, pz);
    parts.add(rim, { color: COL.wood });
  }

  // two shrubs (sage spheres) and three stones
  for (const [bx, bz, r] of [[-2.9, 1.9, 0.42], [2.9, -1.2, 0.36]]) {
    const shrub = sphere(r, 16, 12);
    shrub.scale(1, 0.8, 1);
    shrub.translate(bx, r * 0.7, bz);
    parts.add(shrub, { color: (x, y, z, nx, ny) => mixColor(COL.lawnDark, COL.lawn, 0.3 + 0.7 * Math.max(0, ny)) });
    const shrub2 = sphere(r * 0.7, 12, 9);
    shrub2.scale(1, 0.8, 1);
    shrub2.translate(bx + r * 0.6, r * 0.5, bz - r * 0.3);
    parts.add(shrub2, { color: (x, y, z, nx, ny) => mixColor(COL.lawnDark, COL.lawn, 0.3 + 0.7 * Math.max(0, ny)) });
  }
  for (const [stx, stz, r] of [[-0.4, -2.6, 0.18], [0.1, -2.75, 0.13], [-2.6, -0.4, 0.15]]) {
    const stone = new DodecahedronGeometry(r, 1);
    stone.scale(1.3, 0.7, 1);
    stone.translate(stx, r * 0.55, stz);
    parts.add(smooth(stone), { color: (x, y, z, nx, ny) => mixColor(COL.stoneDark, COL.stone, 0.4 + 0.6 * Math.max(0, ny)) });
  }

  return parts.merge();
}

// ---------------------------------------------------------------- care props
function bowl(withWater) {
  const parts = new PartSet();
  const profile = [];
  const pts = [
    [0.0, 0.0], [0.06, 0.0], [0.085, 0.01], [0.1, 0.03], [0.105, 0.06], [0.1, 0.065],
    [0.09, 0.06], [0.082, 0.045], [0.07, 0.02], [0.0, 0.016],
  ];
  for (const [r, y] of pts) profile.push(new Vector2(r, y));
  const lathe = new LatheGeometry(profile, 32);
  parts.add(smooth(lathe), {
    color: (x, y, z, nx, ny, nz) => {
      const r = Math.hypot(x, z);
      return r < 0.084 && y > 0.014 && ny > 0.2 ? COL.ceramicDark : COL.ceramic;
    },
  });
  if (withWater) {
    const water = new CylinderGeometry(0.078, 0.07, 0.006, 24);
    water.translate(0, 0.04, 0);
    parts.add(smooth(water), { color: COL.water });
  } else {
    // kibble: a few small spheres in the bowl
    const seeds = [[0.0, 0.0], [0.03, 0.02], [-0.025, 0.03], [0.02, -0.035], [-0.03, -0.02], [0.045, -0.005], [-0.045, 0.005], [0.0, 0.045], [0.005, -0.048]];
    for (const [kx, kz] of seeds) {
      const k = sphere(0.011, 8, 6);
      k.translate(kx, 0.028, kz);
      parts.add(k, { color: COL.kibble });
    }
  }
  return parts.merge();
}

export function buildCareProps() {
  const meshes = [];
  meshes.push({ name: 'prop_bowl', nodeName: 'bowl', geometry: bowl(false) });
  meshes.push({ name: 'prop_water', nodeName: 'water', geometry: bowl(true) });

  // blanket: a soft rounded slab with folded edge
  {
    const parts = new PartSet();
    const slab = superEllipsoid(0.32, 0.018, 0.24, 0.5, 0.35, 6, 20);
    slab.translate(0, 0.018, 0);
    parts.add(slab, { color: (x, y, z, nx, ny) => mixColor(COL.blanket, COL.blanketDark, 0.5 + 0.5 * Math.sin(x * 40) * 0.6) });
    const fold = superEllipsoid(0.3, 0.014, 0.05, 0.5, 0.5, 4, 14);
    fold.translate(0, 0.045, 0.17);
    parts.add(fold, { color: COL.blanketDark });
    meshes.push({ name: 'prop_blanket', nodeName: 'blanket', geometry: parts.merge() });
  }
  // ball
  {
    const parts = new PartSet();
    const b = sphere(0.042, 20, 14);
    b.translate(0, 0.042, 0);
    parts.add(b, { color: (x, y, z, nx, ny) => (Math.abs(y - 0.042) < 0.006 ? COL.ballDark : COL.ball) });
    meshes.push({ name: 'prop_ball', nodeName: 'ball', geometry: parts.merge() });
  }
  // rolling toy: a ridged cylinder lying on its side, treat opening at one end
  {
    const parts = new PartSet();
    const body = new CylinderGeometry(0.035, 0.035, 0.12, 18, 1);
    body.rotateZ(Math.PI / 2);
    body.translate(0, 0.035, 0);
    parts.add(smooth(body), { color: COL.toy });
    for (const dx of [-0.04, 0, 0.04]) {
      const ridge = torus(0.035, 0.006, 6, 18);
      ridge.rotateY(Math.PI / 2);
      ridge.translate(dx, 0.035, 0);
      parts.add(ridge, { color: COL.toyLight });
    }
    const cap = sphere(0.03, 12, 8);
    cap.translate(0.06, 0.035, 0);
    parts.add(cap, { color: COL.toyLight });
    meshes.push({ name: 'prop_toy_rolling', nodeName: 'toy_rolling', geometry: parts.merge() });
  }
  // leaf: flat ellipse with a midrib and short stem
  {
    const parts = new PartSet();
    const blade = ellipsoid(0.035, 0.004, 0.06, 14, 8);
    blade.translate(0, 0.004, 0);
    parts.add(blade, { color: (x, y, z) => mixColor(COL.leaf, COL.leafDark, smoothstep(0.004, 0.0, Math.abs(x))) });
    const stem = new CylinderGeometry(0.003, 0.004, 0.035, 6);
    stem.rotateX(Math.PI / 2);
    stem.translate(0, 0.004, -0.07);
    parts.add(smooth(stem), { color: COL.leafDark });
    meshes.push({ name: 'prop_leaf', nodeName: 'leaf', geometry: parts.merge() });
  }
  return meshes;
}

// ---------------------------------------------------------------- upgrades
export function buildUpgrades() {
  const meshes = [];
  // rest place: blanket + cushion + small shade on two posts (pivot at the base, centred)
  {
    const parts = new PartSet();
    const blanket = superEllipsoid(0.5, 0.02, 0.4, 0.5, 0.4, 6, 20);
    blanket.translate(0, 0.02, 0);
    parts.add(blanket, { color: (x, y, z) => mixColor(COL.blanket, COL.blanketDark, 0.5 + 0.3 * Math.sin(z * 30)) });
    const cushion = superEllipsoid(0.28, 0.07, 0.22, 0.45, 0.5, 8, 18);
    cushion.translate(0, 0.1, -0.05);
    parts.add(cushion, { color: (x, y, z, nx, ny) => mixColor(COL.cushion, COL.lawn, 0.5 + 0.5 * Math.max(0, ny)) });
    for (const px of [-0.45, 0.45]) {
      const post = new CylinderGeometry(0.025, 0.03, 1.1, 10);
      post.translate(px, 0.55, -0.35);
      parts.add(smooth(post), { color: COL.woodDark });
    }
    const shade = superEllipsoid(0.62, 0.012, 0.5, 0.4, 0.4, 4, 18);
    shade.rotateX(-0.12);
    shade.translate(0, 1.1, -0.1);
    parts.add(shade, { color: (x, y, z, nx, ny) => (ny > 0 ? COL.shade : mixColor(COL.shade, COL.woodDark, 0.3)) });
    const bar = new CylinderGeometry(0.015, 0.015, 0.9, 8);
    bar.rotateZ(Math.PI / 2);
    bar.translate(0, 1.08, -0.35);
    parts.add(smooth(bar), { color: COL.woodDark });
    meshes.push({ name: 'upgrade_rest_place', nodeName: 'rest_place', geometry: parts.merge() });
  }
  // sniff corner: two planters filled with lavender tufts + a sniff mat in front
  {
    const parts = new PartSet();
    for (const px of [-0.4, 0.4]) {
      const outer = new BoxGeometry(0.7, 0.4, 0.5);
      outer.translate(px, 0.2, -0.3);
      parts.add(outer, { color: COL.woodDark });
      const soil = new BoxGeometry(0.62, 0.05, 0.42);
      soil.translate(px, 0.395, -0.3);
      parts.add(soil, { color: COL.soil });
      const rim = new BoxGeometry(0.74, 0.04, 0.54);
      rim.translate(px, 0.41, -0.3);
      parts.add(rim, { color: COL.wood });
      // lavender tufts: stems + purple heads
      let seed = px * 10;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < 14; i++) {
        const lx = px + (rnd() - 0.5) * 0.56;
        const lz = -0.3 + (rnd() - 0.5) * 0.36;
        const hgt = 0.18 + rnd() * 0.14;
        const stem = new CylinderGeometry(0.006, 0.008, hgt, 5);
        stem.translate(lx, 0.4 + hgt / 2, lz);
        parts.add(smooth(stem), { color: COL.lavenderStem });
        const head = ellipsoid(0.02, 0.05, 0.02, 7, 6);
        head.translate(lx, 0.4 + hgt + 0.03, lz);
        parts.add(head, { color: (x, y, z, nx, ny) => mixColor(COL.lavender, hexToLinear('#7D6DA8'), 0.5 - 0.5 * ny) });
      }
    }
    // sniff mat with nubs
    const mat = superEllipsoid(0.45, 0.015, 0.3, 0.4, 0.4, 4, 16);
    mat.translate(0, 0.015, 0.35);
    parts.add(mat, { color: COL.mat });
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const nub = sphere(0.025, 7, 5);
        nub.translate(-0.3 + i * 0.12, 0.04, 0.2 + j * 0.1);
        parts.add(nub, { color: (i + j) % 2 ? COL.matDark : COL.cushion });
      }
    }
    meshes.push({ name: 'upgrade_sniff_corner', nodeName: 'sniff_corner', geometry: parts.merge() });
  }
  return meshes;
}
