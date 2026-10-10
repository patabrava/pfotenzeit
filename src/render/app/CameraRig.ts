/**
 * CameraRig (06, D-034): fixed elevated three-quarter orthographic view, three framings computed
 * from the focus dog's measured skinned bounds so the dog fills a target share of the viewport
 * height: closeup 55–65 %, lesson 40–50 %, school ≥ 18 % (Nala lower-middle third, the core yard
 * around her as far as the aspect allows). Elevation: 25° closeup, 30° lesson, 35° school.
 * Azimuth: front three-quarter on the side where the handler stands; the offset from the dog's nose
 * axis is itself bounds-driven (45° down to 12°) because a side-on puppy is wider than tall and
 * cannot fill 55 % of a 9:19.5 portrait at 45°. Moves are 250–400 ms eased
 * (instant with reduced motion). No OrbitControls. A decision accent pushes the frustum in by a
 * few percent and releases again (D-035).
 */
import { OrthographicCamera, Vector3 } from 'three';
import type { CameraView } from '../../simulation/types';

export const CAMERA_AZIMUTH = (32 * Math.PI) / 180;
export const CAMERA_ELEVATION = (35 * Math.PI) / 180;
const CAMERA_DISTANCE = 24;
const MOVE_SECONDS = 0.32;
const ACCENT_SECONDS = 0.3;

/** D-034 targets and bands (share of viewport height filled by the dog). */
export const FRAMING_TARGETS = {
  closeup: { share: 0.6, min: 0.55, max: 0.65, margin: 0.06, elevationDeg: 25, maxElevationDeg: 28 },
  lesson: { share: 0.45, min: 0.4, max: 0.5, margin: 0.06, elevationDeg: 30, maxElevationDeg: 34 },
  /** D-039: the school shows the place; Nala keeps ≥ 10 % (portrait) / ≥ 14 % (landscape) in the lower-middle third. */
  school: { share: 0.12, min: 0.1, max: 1, margin: 0.03, elevationDeg: 35, maxElevationDeg: 35, landscapeShare: 0.16, landscapeMin: 0.14 },
  /** D-041 yard: follow camera framing handler + dog, dog ≥ 12 % in both aspects, slight lead in the walking direction. */
  yard: { share: 0.15, min: 0.12, max: 1, margin: 0.05, elevationDeg: 35, maxElevationDeg: 35 },
} as const;

/** School share band by aspect (D-039). */
export function schoolShare(aspect: number): { share: number; min: number } {
  const t = FRAMING_TARGETS.school;
  return aspect >= 1 ? { share: t.landscapeShare, min: t.landscapeMin } : { share: t.share, min: t.min };
}

/** NDC y where the school view places the dog's centre (lower-middle third). */
const SCHOOL_DOG_Y = -0.4;
/** Max NDC |x| offset of the dog from the centre while the frame slides toward the landmarks. */
const SCHOOL_DOG_X = 0.33;

/** Half width (metres) that shows the training circle, shelter front and rest deck. */
const SCHOOL_CORE_HALF_WIDTH = 3.4;
/** Candidate azimuth offsets from the dog's nose axis, widest three-quarter first. */
const AZIMUTH_OFFSETS_DEG = [45, 38, 30, 24, 18, 12, 8] as const;
/** Never look from behind the shelter (−z): keep the camera in the front hemisphere. */
const MAX_AZIMUTH = (75 * Math.PI) / 180;

export interface Framing {
  target: Vector3;
  halfWidth: number;
  halfHeight: number;
  /** Camera elevation in radians. */
  elevation: number;
  /** Camera azimuth in radians (sign = side of the handler). */
  azimuth: number;
}

export interface FramingRequest {
  view: CameraView;
  /** Optional clear courtyard viewing side for lesson staging. */
  azimuth?: number;
  /** World-space surface samples of the focus dog (skinned, current pose). */
  points: readonly Vector3[];
  /** Ground point of the subject. */
  ground: Vector3;
  /** Optional zone focus (rest place / sniff corner) used by the school view. */
  zone: Vector3 | null;
  /** World yaw of the dog's nose in radians (0 = +z). */
  facing: number;
  /** Handler position (ground) → the camera takes the three-quarter on that side; null = default side. */
  handler: Vector3 | null;
  /** School view: required landmarks (always fitted) and optional ones (fitted when the share allows). */
  yard?: { required: readonly Vector3[]; optional: readonly Vector3[] };
  /** Yard view (D-041): points that must stay in frame with the dog (handler marker, lead point). */
  companions?: readonly Vector3[];
}

export interface FramingReport {
  view: CameraView;
  /** Share of the viewport height the dog fills. */
  heightShare: number;
  widthShare: number;
  /** Smallest distance of the dog's silhouette to a frame edge, as a share of that dimension. */
  minMargin: number;
  /** NDC centre of the dog. */
  centreY: number;
  centreX: number;
  /** Camera azimuth in degrees and its offset from the dog's nose axis. */
  azimuthDeg: number;
  noseOffsetDeg: number;
}

export interface CameraRig {
  camera: OrthographicCamera;
  setViewport(width: number, height: number): void;
  /** Last viewport in CSS pixels (pick fallback when no canvas exists). */
  viewport(): { width: number; height: number };
  /** Request a framing; returns true if the camera will move. */
  frame(request: FramingRequest, instant: boolean): boolean;
  /** Advance moves; returns true while moving. */
  update(dt: number): boolean;
  isMoving(): boolean;
  current(): Framing;
  /** World point → normalized device coordinates. */
  project(point: Vector3, out?: Vector3): Vector3;
  /** Measure how the given points sit in the current frame. */
  report(points: readonly Vector3[], view: CameraView): FramingReport;
  /** Decision accent (D-035): push in by `amount` (0.03–0.05) over ~300 ms; release() eases back. */
  pushIn(amount: number): void;
  release(): void;
  lastRequest(): FramingRequest | null;
  /** Review harness: pin the camera to a fixed framing (frame() is ignored until unlocked with null). */
  lock(framing: Framing | null): void;
}

const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function viewDirection(elevation: number, azimuth: number, out = new Vector3()): Vector3 {
  return out.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).normalize();
}

export function viewAxes(elevation: number, azimuth: number): { dir: Vector3; up: Vector3; right: Vector3 } {
  const dir = viewDirection(elevation, azimuth);
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
  const up = new Vector3().crossVectors(dir, right).normalize();
  return { dir, up, right };
}

interface Extents {
  minUp: number;
  maxUp: number;
  minRight: number;
  maxRight: number;
}

function extentsOf(points: readonly Vector3[], up: Vector3, right: Vector3): Extents {
  let minUp = Infinity;
  let maxUp = -Infinity;
  let minRight = Infinity;
  let maxRight = -Infinity;
  for (const p of points) {
    const u = p.dot(up);
    const r = p.dot(right);
    if (u < minUp) minUp = u;
    if (u > maxUp) maxUp = u;
    if (r < minRight) minRight = r;
    if (r > maxRight) maxRight = r;
  }
  if (!Number.isFinite(minUp)) return { minUp: 0, maxUp: 0, minRight: 0, maxRight: 0 };
  return { minUp, maxUp, minRight, maxRight };
}

interface Fit {
  halfWidth: number;
  halfHeight: number;
  share: number;
  e: Extents;
  axes: { dir: Vector3; up: Vector3; right: Vector3 };
}

function fit(points: readonly Vector3[], view: CameraView, elevation: number, azimuth: number, aspect: number): Fit {
  const t: { share: number; margin: number } = FRAMING_TARGETS[view];
  const axes = viewAxes(elevation, azimuth);
  const e = extentsOf(points, axes.up, axes.right);
  const dogUp = Math.max(0.05, e.maxUp - e.minUp);
  const dogRight = Math.max(0.05, e.maxRight - e.minRight);
  // Height from the share target; width and height must keep the margin (plus 1 % slack for breathing).
  let halfHeight = dogUp / (2 * t.share);
  let halfWidth = halfHeight * aspect;
  const minHalfWidth = dogRight / (2 * (1 - 2 * (t.margin + 0.01)));
  if (halfWidth < minHalfWidth) {
    halfWidth = minHalfWidth;
    halfHeight = halfWidth / aspect;
  }
  const minHalfHeight = dogUp / (2 * (1 - 2 * (t.margin + 0.01)));
  if (halfHeight < minHalfHeight) {
    halfHeight = minHalfHeight;
    halfWidth = halfHeight * aspect;
  }
  return { halfWidth, halfHeight, share: dogUp / (2 * halfHeight), e, axes };
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Body axis from the sample cloud (horizontal principal axis), oriented toward the root facing so
 * yawed poses (turn_away, curled rest) are framed from their actual front, not the root's.
 */
export function bodyAxis(points: readonly Vector3[], facing: number): number {
  if (points.length < 3) return facing;
  let mx = 0;
  let mz = 0;
  for (const p of points) {
    mx += p.x;
    mz += p.z;
  }
  mx /= points.length;
  mz /= points.length;
  let sxx = 0;
  let sxz = 0;
  let szz = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dz = p.z - mz;
    sxx += dx * dx;
    sxz += dx * dz;
    szz += dz * dz;
  }
  // Principal direction (x, z) → yaw with 0 = +z, as the actors' facing.
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const yaw = Math.atan2(Math.cos(theta), Math.sin(theta));
  return Math.abs(wrap(yaw - facing)) <= Math.PI / 2 ? yaw : wrap(yaw + Math.PI);
}

/** Which three-quarter side: toward the handler, else the side nearer the fixed school azimuth. */
function sideFor(request: FramingRequest, axis: number): 1 | -1 {
  const ref = request.handler ? Math.atan2(request.handler.x - request.ground.x, request.handler.z - request.ground.z) : CAMERA_AZIMUTH;
  const plus = Math.abs(wrap(axis + Math.PI / 4 - ref));
  const minus = Math.abs(wrap(axis - Math.PI / 4 - ref));
  return plus <= minus ? 1 : -1;
}

export function computeFraming(request: FramingRequest, aspect: number): Framing {
  const t = FRAMING_TARGETS[request.view];
  let elevation = (t.elevationDeg * Math.PI) / 180;
  const points = request.points.length > 0 ? request.points : [request.ground];
  let azimuth = CAMERA_AZIMUTH;
  let best: Fit | null = null;
  if (request.view === 'school') {
    return schoolFraming(request, points, aspect);
  } else if (request.view === 'yard') {
    return yardFraming(request, points, aspect);
  } else if (request.azimuth !== undefined) {
    azimuth = request.azimuth;
    best = fit(points, request.view, elevation, azimuth, aspect);
  } else {
    // Bounds-driven azimuth: the widest three-quarter on the handler's side that reaches the band,
    // measured from the body axis of the sampled silhouette; the elevation may rise within the
    // view's band (closeup 25→28°, lesson 30→34°) before a narrower offset is accepted.
    const axis = bodyAxis(points, request.facing);
    const side = sideFor(request, axis);
    const elevations: number[] = [t.elevationDeg];
    if (t.maxElevationDeg > t.elevationDeg) elevations.push(t.maxElevationDeg);
    let fallback: { fit: Fit; azimuth: number; elevation: number } | null = null;
    search: for (const offsetDeg of AZIMUTH_OFFSETS_DEG) {
      for (const elDeg of elevations) {
        const el = (elDeg * Math.PI) / 180;
        const a = Math.max(-MAX_AZIMUTH, Math.min(MAX_AZIMUTH, wrap(axis + (side * offsetDeg * Math.PI) / 180)));
        const f = fit(points, request.view, el, a, aspect);
        if (!fallback || f.share > fallback.fit.share + 1e-6) fallback = { fit: f, azimuth: a, elevation: el };
        // Accept a little above the floor so idle sway/breathing cannot flap the share out of the band.
        if (f.share >= t.min + 0.012) {
          best = f;
          azimuth = a;
          elevation = el;
          break search;
        }
      }
    }
    if (!best && fallback) {
      best = fallback.fit;
      azimuth = fallback.azimuth;
      elevation = fallback.elevation;
    }
  }
  if (!best) best = fit(points, request.view, elevation, azimuth, aspect);
  const { halfWidth, halfHeight } = best;
  const { e, axes } = best;
  const { dir, up, right } = axes;
  const dogUp = Math.max(0.05, e.maxUp - e.minUp);
  const centreUp = (e.minUp + e.maxUp) / 2;
  const centreRight = (e.minRight + e.maxRight) / 2;
  // Lesson sits the dog a little below the centre line so the handler stays visible above;
  // closeup centres it. The offset never eats the margin.
  const wantBelow = request.view === 'closeup' ? 0 : 0.08;
  const maxBelow = Math.max(0, (halfHeight - dogUp / 2) / (2 * halfHeight) - t.margin - 0.01);
  const below = Math.min(wantBelow, maxBelow);
  const target = new Vector3().addScaledVector(up, centreUp + below * 2 * halfHeight).addScaledVector(right, centreRight);
  // Ortho: the depth component only affects near/far; keep it on the subject.
  target.addScaledVector(dir, request.ground.dot(dir) - target.dot(dir));
  return { target, halfWidth, halfHeight, elevation, azimuth };
}

/**
 * Yard (D-041): fixed 32° / 35° follow camera. The frame grows from the dog's share target until
 * the dog, the handler marker and the lead point fit (when the pair is far apart the share drops
 * below the target so that both stay inside; the report carries the real share); centred on the
 * union, the ground kept at the dog's depth.
 */
function yardFraming(request: FramingRequest, points: readonly Vector3[], aspect: number): Framing {
  const t = FRAMING_TARGETS.yard;
  const elevation = (t.elevationDeg * Math.PI) / 180;
  const azimuth = CAMERA_AZIMUTH;
  const { dir, up, right } = viewAxes(elevation, azimuth);
  const e = extentsOf(points, up, right);
  const dogUp = Math.max(0.05, e.maxUp - e.minUp);
  const m = t.margin;
  const set: Vector3[] = [...points, ...(request.companions ?? [])];
  const u = extentsOf(set, up, right);
  const needed = Math.max((u.maxUp - u.minUp) / (2 * (1 - 2 * m)), (u.maxRight - u.minRight) / (2 * (1 - 2 * m) * aspect));
  const halfHeight = Math.max(dogUp / (2 * t.share), needed);
  const halfWidth = halfHeight * aspect;
  const target = new Vector3().addScaledVector(up, (u.minUp + u.maxUp) / 2).addScaledVector(right, (u.minRight + u.maxRight) / 2);
  target.addScaledVector(dir, request.ground.dot(dir) - target.dot(dir));
  return { target, halfWidth, halfHeight, elevation, azimuth };
}

/**
 * School (D-039): fixed 32° / 35°. The dog sits at NDC y = −0.4; the frame grows from the share
 * target until the required landmarks (circle centre, shelter front, rest deck) fit, never past
 * the share floor; optional landmarks are added when they fit too. Zone focus (rest place / sniff
 * corner environments) centres on the zone instead.
 */
function schoolFraming(request: FramingRequest, points: readonly Vector3[], aspect: number): Framing {
  const t = FRAMING_TARGETS.school;
  const { share, min } = schoolShare(aspect);
  const elevation = (t.elevationDeg * Math.PI) / 180;
  const azimuth = CAMERA_AZIMUTH;
  const { dir, up, right } = viewAxes(elevation, azimuth);
  const e = extentsOf(points, up, right);
  const dogUp = Math.max(0.05, e.maxUp - e.minUp);
  const dogCentreUp = (e.minUp + e.maxUp) / 2;
  const dogCentreRight = (e.minRight + e.maxRight) / 2;
  const m = t.margin;
  const cap = dogUp / (2 * min);
  let halfHeight = Math.min(cap, dogUp / (2 * share));
  // Half height needed so that `set` fits with the dog pinned at SCHOOL_DOG_Y and horizontally
  // within ±SCHOOL_DOG_X of the centre.
  const needed = (set: readonly Vector3[]): number => {
    const u = extentsOf([...points, ...set], up, right);
    const above = (u.maxUp - dogCentreUp) / (1 - m - SCHOOL_DOG_Y);
    const belowH = (dogCentreUp - u.minUp) / (1 + SCHOOL_DOG_Y - m);
    const reach = Math.max(u.maxRight - dogCentreRight, dogCentreRight - u.minRight);
    const wide = reach / ((1 + SCHOOL_DOG_X - m) * aspect);
    return Math.max(above, belowH, wide);
  };
  let set: Vector3[] = [];
  if (request.yard) {
    set = [...request.yard.required];
    halfHeight = Math.max(halfHeight, Math.min(cap, needed(set)));
    const all = [...request.yard.required, ...request.yard.optional];
    if (needed(all) <= cap) {
      set = all;
      halfHeight = Math.max(halfHeight, needed(all));
    }
  }
  const halfWidth = halfHeight * aspect;
  const u = extentsOf([...points, ...set], up, right);
  // Horizontal: centre on the set, but keep the dog inside the middle third.
  let rightCentre = (u.minRight + u.maxRight) / 2;
  rightCentre = Math.max(dogCentreRight - SCHOOL_DOG_X * halfWidth, Math.min(dogCentreRight + SCHOOL_DOG_X * halfWidth, rightCentre));
  let target = new Vector3().addScaledVector(up, dogCentreUp - SCHOOL_DOG_Y * halfHeight).addScaledVector(right, rightCentre);
  if (request.zone) target = new Vector3(request.zone.x, 0.2, request.zone.z).addScaledVector(up, 0.06 * 2 * halfHeight);
  target.addScaledVector(dir, request.ground.dot(dir) - target.dot(dir));
  return { target, halfWidth, halfHeight, elevation, azimuth };
}

export function createCameraRig(): CameraRig {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
  camera.name = 'school_camera';
  let aspect = 9 / 16;
  let viewportSize = { width: 9, height: 16 };
  const current: Framing = { target: new Vector3(0, 0, 0), halfWidth: 3, halfHeight: 3 / aspect, elevation: CAMERA_ELEVATION, azimuth: CAMERA_AZIMUTH };
  const from: Framing = { ...current, target: new Vector3() };
  const to: Framing = { ...current, target: new Vector3() };
  const direction = new Vector3();
  let request: FramingRequest | null = null;
  let moveT = 1;
  let locked = false;
  let zoom = 1;
  let zoomFrom = 1;
  let zoomTo = 1;
  let zoomT = 1;

  const applyCamera = (): void => {
    camera.left = -current.halfWidth * zoom;
    camera.right = current.halfWidth * zoom;
    camera.top = current.halfHeight * zoom;
    camera.bottom = -current.halfHeight * zoom;
    camera.position.copy(current.target).addScaledVector(viewDirection(current.elevation, current.azimuth, direction), CAMERA_DISTANCE);
    camera.up.set(0, 1, 0);
    camera.lookAt(current.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  applyCamera();

  const copyInto = (dst: Framing, src: Framing): void => {
    dst.target.copy(src.target);
    dst.halfWidth = src.halfWidth;
    dst.halfHeight = src.halfHeight;
    dst.elevation = src.elevation;
    dst.azimuth = src.azimuth;
  };

  const rig: CameraRig = {
    camera,
    setViewport(width, height) {
      viewportSize = { width, height };
      aspect = Math.max(0.2, width / Math.max(1, height));
      if (request) {
        // Re-fit without animating: a resize is not a camera move.
        copyInto(moveT >= 1 ? current : to, computeFraming(request, aspect));
      }
      applyCamera();
    },
    frame(req, instant) {
      if (locked) return false;
      request = { ...req, points: req.points.map((p) => p.clone()), ground: req.ground.clone(), zone: req.zone ? req.zone.clone() : null, handler: req.handler ? req.handler.clone() : null, yard: req.yard, companions: req.companions?.map((p) => p.clone()) };
      const f = computeFraming(req, aspect);
      const ref = moveT < 1 ? to : current;
      const same =
        f.target.distanceToSquared(ref.target) < 1e-6 &&
        Math.abs(f.halfWidth - ref.halfWidth) < 1e-4 &&
        Math.abs(f.elevation - ref.elevation) < 1e-5 &&
        Math.abs(f.azimuth - ref.azimuth) < 1e-5;
      if (same) return moveT < 1;
      if (instant) {
        copyInto(current, f);
        moveT = 1;
        applyCamera();
        return false;
      }
      copyInto(from, current);
      copyInto(to, f);
      moveT = 0;
      return true;
    },
    update(dt) {
      let moving = false;
      if (moveT < 1) {
        moveT = Math.min(1, moveT + dt / MOVE_SECONDS);
        const k = easeInOut(moveT);
        current.target.lerpVectors(from.target, to.target, k);
        current.halfWidth = from.halfWidth + (to.halfWidth - from.halfWidth) * k;
        current.halfHeight = from.halfHeight + (to.halfHeight - from.halfHeight) * k;
        current.elevation = from.elevation + (to.elevation - from.elevation) * k;
        current.azimuth = from.azimuth + (to.azimuth - from.azimuth) * k;
        moving = true;
      }
      if (zoomT < 1) {
        zoomT = Math.min(1, zoomT + dt / ACCENT_SECONDS);
        zoom = zoomFrom + (zoomTo - zoomFrom) * easeInOut(zoomT);
        moving = true;
      }
      if (moving) applyCamera();
      return moveT < 1 || zoomT < 1;
    },
    isMoving() {
      return moveT < 1 || zoomT < 1;
    },
    viewport: () => ({ ...viewportSize }),
    current() {
      return { target: current.target.clone(), halfWidth: current.halfWidth * zoom, halfHeight: current.halfHeight * zoom, elevation: current.elevation, azimuth: current.azimuth };
    },
    project(point, out = new Vector3()) {
      return out.copy(point).project(camera);
    },
    report(points, view) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      const v = new Vector3();
      for (const p of points) {
        v.copy(p).project(camera);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      const azimuthDeg = (current.azimuth * 180) / Math.PI;
      const noseOffsetDeg = request ? Math.abs((wrap(current.azimuth - request.facing) * 180) / Math.PI) : 0;
      if (!Number.isFinite(minX)) return { view, heightShare: 0, widthShare: 0, minMargin: 0, centreY: 0, centreX: 0, azimuthDeg, noseOffsetDeg };
      const minMargin = Math.min((1 + minX) / 2, (1 - maxX) / 2, (1 + minY) / 2, (1 - maxY) / 2);
      return { view, heightShare: (maxY - minY) / 2, widthShare: (maxX - minX) / 2, minMargin, centreY: (minY + maxY) / 2, centreX: (minX + maxX) / 2, azimuthDeg, noseOffsetDeg };
    },
    pushIn(amount) {
      zoomFrom = zoom;
      zoomTo = 1 - Math.min(0.08, Math.max(0, amount));
      zoomT = 0;
    },
    release() {
      if (zoomTo === 1 && zoomT >= 1) return;
      zoomFrom = zoom;
      zoomTo = 1;
      zoomT = 0;
    },
    lastRequest: () => request,
    lock(framing) {
      locked = framing !== null;
      if (framing) {
        copyInto(current, framing);
        moveT = 1;
        zoomT = 1;
        zoom = 1;
        applyCamera();
      }
    },
  };
  return rig;
}
