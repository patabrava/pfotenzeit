/**
 * CameraRig (06): a fixed, elevated three-quarter orthographic view, ~35° down. Three framings:
 * school (yard, Nala lower-middle), lesson (focus dog in the middle of a portrait viewport with
 * paws and tail inside, handler visible), closeup (head + body). Portrait first: the frustum
 * adapts to the aspect so the subject never leaves the frame. Moves are 250–400 ms eased,
 * instant with reduced motion. No OrbitControls.
 */
import { OrthographicCamera, Vector3 } from 'three';
import type { CameraView } from '../../simulation/types';

export const CAMERA_AZIMUTH = (32 * Math.PI) / 180;
/** Default elevation (06: ~35° down). The closeup lowers it so eyes, ears and tail read together. */
export const CAMERA_ELEVATION = (35 * Math.PI) / 180;
const CAMERA_DISTANCE = 24;
const MOVE_SECONDS = 0.32;

export interface Framing {
  target: Vector3;
  halfWidth: number;
  halfHeight: number;
  /** Camera elevation in radians. */
  elevation: number;
}

export interface FramingRequest {
  view: CameraView;
  /** Ground point of the subject (focus dog, or Nala in school view). */
  subject: Vector3;
  /** Length of the subject including tail, metres: scales lesson/closeup framing. */
  subjectExtent: number;
  /** Optional zone focus (rest place / sniff corner) used by the school view. */
  zone: Vector3 | null;
}

export interface CameraRig {
  camera: OrthographicCamera;
  setViewport(width: number, height: number): void;
  /** Request a framing; returns true if the camera will move. */
  frame(request: FramingRequest, instant: boolean): boolean;
  /** Advance the move; returns true while moving. */
  update(dt: number): boolean;
  isMoving(): boolean;
  current(): Framing;
  /** World point → normalized device coordinates (x, y in [-1, 1] when visible). */
  project(point: Vector3, out?: Vector3): Vector3;
}

const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** View direction (from target toward the camera) for an elevation. */
export function viewDirection(elevation: number, out = new Vector3()): Vector3 {
  return out.set(Math.sin(CAMERA_AZIMUTH) * Math.cos(elevation), Math.sin(elevation), Math.cos(CAMERA_AZIMUTH) * Math.cos(elevation)).normalize();
}

/** Camera up vector in world space (perpendicular to the view direction, no roll). */
export function viewUp(elevation: number, out = new Vector3()): Vector3 {
  const dir = viewDirection(elevation);
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
  return out.crossVectors(dir, right).normalize();
}

interface Want {
  width: number;
  height: number;
  /** Fraction of the frustum height by which the subject sits below the screen centre. */
  subjectBelowCentre: number;
  /** Lift of the look-at point above the ground, metres. */
  lift: number;
  elevationDeg: number;
}

/**
 * Framing sizes in metres. school: the core yard around Nala (06: focus on the dog, not the whole
 * courtyard; the fence corners may leave the frame). lesson: dog + handler. closeup: head + body.
 */
function want(request: FramingRequest): Want {
  const e = Math.max(0.6, request.subjectExtent);
  switch (request.view) {
    case 'school':
      return request.zone
        ? { width: 4.6, height: 4.2, subjectBelowCentre: 0.06, lift: 0.2, elevationDeg: 35 }
        : { width: 7.0, height: 6.2, subjectBelowCentre: 0.16, lift: 0.0, elevationDeg: 35 };
    case 'lesson':
      return { width: Math.max(2.3, e * 2.9), height: Math.max(2.4, e * 3.0), subjectBelowCentre: 0.12, lift: 0.16, elevationDeg: 32 };
    case 'closeup':
      return { width: e * 1.7, height: e * 1.45, subjectBelowCentre: 0.0, lift: e * 0.24, elevationDeg: 22 };
  }
}

export function computeFraming(request: FramingRequest, aspect: number): Framing {
  const w = want(request);
  const halfWidth = Math.max(w.width / 2, (w.height / 2) * aspect);
  const halfHeight = halfWidth / aspect;
  const subject = request.view === 'school' && request.zone ? request.zone : request.subject;
  const elevation = (w.elevationDeg * Math.PI) / 180;
  const target = new Vector3(subject.x, subject.y + w.lift, subject.z);
  target.addScaledVector(viewUp(elevation), w.subjectBelowCentre * 2 * halfHeight);
  return { target, halfWidth, halfHeight, elevation };
}

export function createCameraRig(): CameraRig {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
  camera.name = 'school_camera';
  let aspect = 9 / 16;
  const current: Framing = { target: new Vector3(0, 0, 0), halfWidth: 3, halfHeight: 3 / aspect, elevation: CAMERA_ELEVATION };
  const from: Framing = { target: new Vector3(), halfWidth: 1, halfHeight: 1, elevation: CAMERA_ELEVATION };
  const to: Framing = { target: new Vector3(), halfWidth: 1, halfHeight: 1, elevation: CAMERA_ELEVATION };
  const direction = new Vector3();
  let lastRequest: FramingRequest | null = null;
  let moveT = 1;

  const applyCamera = (): void => {
    camera.left = -current.halfWidth;
    camera.right = current.halfWidth;
    camera.top = current.halfHeight;
    camera.bottom = -current.halfHeight;
    camera.position.copy(current.target).addScaledVector(viewDirection(current.elevation, direction), CAMERA_DISTANCE);
    camera.up.set(0, 1, 0);
    camera.lookAt(current.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  applyCamera();

  const rig: CameraRig = {
    camera,
    setViewport(width, height) {
      aspect = Math.max(0.2, width / Math.max(1, height));
      if (lastRequest) {
        // Re-fit without animating: a resize is not a camera move.
        const f = computeFraming(lastRequest, aspect);
        if (moveT >= 1) {
          current.target.copy(f.target);
          current.halfWidth = f.halfWidth;
          current.halfHeight = f.halfHeight;
          current.elevation = f.elevation;
        } else {
          to.target.copy(f.target);
          to.halfWidth = f.halfWidth;
          to.halfHeight = f.halfHeight;
          to.elevation = f.elevation;
        }
      }
      applyCamera();
    },
    frame(request, instant) {
      lastRequest = { ...request, subject: request.subject.clone(), zone: request.zone ? request.zone.clone() : null };
      const f = computeFraming(request, aspect);
      const same =
        f.target.distanceToSquared(moveT < 1 ? to.target : current.target) < 1e-6 &&
        Math.abs(f.halfWidth - (moveT < 1 ? to.halfWidth : current.halfWidth)) < 1e-4;
      if (same) return moveT < 1;
      if (instant) {
        current.target.copy(f.target);
        current.halfWidth = f.halfWidth;
        current.halfHeight = f.halfHeight;
        current.elevation = f.elevation;
        moveT = 1;
        applyCamera();
        return false;
      }
      from.target.copy(current.target);
      from.halfWidth = current.halfWidth;
      from.halfHeight = current.halfHeight;
      from.elevation = current.elevation;
      to.target.copy(f.target);
      to.halfWidth = f.halfWidth;
      to.halfHeight = f.halfHeight;
      to.elevation = f.elevation;
      moveT = 0;
      return true;
    },
    update(dt) {
      if (moveT >= 1) return false;
      moveT = Math.min(1, moveT + dt / MOVE_SECONDS);
      const k = easeInOut(moveT);
      current.target.lerpVectors(from.target, to.target, k);
      current.halfWidth = from.halfWidth + (to.halfWidth - from.halfWidth) * k;
      current.halfHeight = from.halfHeight + (to.halfHeight - from.halfHeight) * k;
      current.elevation = from.elevation + (to.elevation - from.elevation) * k;
      applyCamera();
      return moveT < 1;
    },
    isMoving() {
      return moveT < 1;
    },
    current() {
      return { target: current.target.clone(), halfWidth: current.halfWidth, halfHeight: current.halfHeight, elevation: current.elevation };
    },
    project(point, out = new Vector3()) {
      return out.copy(point).project(camera);
    },
  };
  return rig;
}
