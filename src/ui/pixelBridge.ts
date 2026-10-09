/**
 * Loads WP-B's `createPixelDog` from src/ui/pixel/ when it exists; otherwise draws a clearly
 * labelled placeholder so the profile stays usable. Uses import.meta.glob so a missing module is
 * not a build error.
 */
import type { GrowthStage, PixelState } from '../simulation/types';

export interface PixelDogHandle {
  render(state: PixelState, growth: GrowthStage, frame?: number): void;
  dispose(): void;
}

export type PixelDogFactory = (canvas: HTMLCanvasElement) => PixelDogHandle;

interface PixelModule {
  createPixelDog?: PixelDogFactory;
}

const pixelModules = import.meta.glob<PixelModule>('./pixel/index.ts');

export async function loadPixelDogFactory(): Promise<{ factory: PixelDogFactory; placeholder: boolean }> {
  const loader = pixelModules['./pixel/index.ts'];
  if (loader) {
    try {
      const mod = await loader();
      if (typeof mod.createPixelDog === 'function') return { factory: mod.createPixelDog, placeholder: false };
    } catch (error) {
      console.warn('[ui] pixel module failed to load, using placeholder', error);
    }
  }
  return { factory: createPlaceholderPixelDog, placeholder: true };
}

const PALETTE = {
  honey: '#C9955A',
  honeyShade: '#A9763F',
  cream: '#F1E3C8',
  sage: '#8FA98A',
  nose: '#3B2A22',
  eye: '#3A2518',
  frame: '#AFC6AE',
  chalk: '#F4F0E8',
};

/**
 * Placeholder: 32×32 logical grid, integer scaled, nearest neighbour. Simple dog head reading
 * the state through eyes/ears. Labelled as placeholder in the UI (not final art).
 */
export function createPlaceholderPixelDog(canvas: HTMLCanvasElement): PixelDogHandle {
  const GRID = 32;
  const ctx = canvas.getContext('2d');

  function px(x: number, y: number, w: number, h: number, color: string, scale: number, ox: number, oy: number): void {
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.fillRect(ox + x * scale, oy + y * scale, w * scale, h * scale);
  }

  return {
    render(state, growth) {
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const cssSize = Math.max(32, Math.floor(Math.min(rect.width || canvas.width, rect.height || canvas.height)));
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      const target = cssSize * dpr;
      if (canvas.width !== target || canvas.height !== target) {
        canvas.width = target;
        canvas.height = target;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.max(1, Math.floor(target / GRID));
      const ox = Math.floor((target - scale * GRID) / 2);
      const oy = Math.floor((target - scale * GRID) / 2);

      if (state === 'memorial') {
        px(2, 2, 28, 28, PALETTE.frame, scale, ox, oy);
        px(4, 4, 24, 24, PALETTE.chalk, scale, ox, oy);
        // paw print
        px(13, 15, 6, 6, PALETTE.sage, scale, ox, oy);
        px(11, 11, 3, 3, PALETTE.sage, scale, ox, oy);
        px(15, 9, 3, 3, PALETTE.sage, scale, ox, oy);
        px(19, 11, 3, 3, PALETTE.sage, scale, ox, oy);
        return;
      }

      const headY = growth === 'arriving' ? 8 : 7;
      const headH = growth === 'arriving' ? 16 : 15;
      const earDrop = state === 'tired' || state === 'exhausted' || state === 'resting' ? 2 : 0;
      // ears
      px(4, headY + earDrop, 5, 10, PALETTE.honeyShade, scale, ox, oy);
      px(23, headY + earDrop, 5, 10, PALETTE.honeyShade, scale, ox, oy);
      // head
      px(8, headY, 16, headH, PALETTE.honey, scale, ox, oy);
      // forehead stripe
      px(15, headY, 2, 5, PALETTE.cream, scale, ox, oy);
      // muzzle
      px(11, headY + 9, 10, 6, PALETTE.cream, scale, ox, oy);
      px(14, headY + 9, 4, 2, PALETTE.nose, scale, ox, oy);
      // eyes
      const eyeY = headY + 5;
      if (state === 'resting' || state === 'exhausted') {
        px(10, eyeY + 1, 4, 1, PALETTE.eye, scale, ox, oy);
        px(18, eyeY + 1, 4, 1, PALETTE.eye, scale, ox, oy);
      } else if (state === 'tired') {
        px(10, eyeY, 4, 2, PALETTE.eye, scale, ox, oy);
        px(18, eyeY, 4, 2, PALETTE.eye, scale, ox, oy);
      } else {
        px(10, eyeY, 3, 3, PALETTE.eye, scale, ox, oy);
        px(19, eyeY, 3, 3, PALETTE.eye, scale, ox, oy);
      }
      // harness hint below head
      px(10, headY + headH, 12, 3, PALETTE.sage, scale, ox, oy);
      // mouth: playful = open
      if (state === 'playful') px(15, headY + 13, 2, 2, PALETTE.nose, scale, ox, oy);
      // hungry: small bowl
      if (state === 'hungry') {
        px(22, 26, 8, 3, PALETTE.nose, scale, ox, oy);
        px(23, 25, 6, 1, PALETTE.cream, scale, ox, oy);
      }
    },
    dispose() {
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
