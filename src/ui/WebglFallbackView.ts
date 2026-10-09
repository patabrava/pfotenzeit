/**
 * Scene-layer fallback: while the renderer loads, when WebGL is unavailable (text lesson view;
 * profile fully usable) or when the context is lost. Lives inside the scene container's layer.
 */
import { getPixelState } from '../simulation/selectors';
import { button, el, secondary, text } from './components';
import type { UiContext, View } from './context';
import type { PixelDogHandle } from './pixelBridge';
import { t } from './strings';
import { createView } from './view';

export function createWebglFallbackView(ctx: UiContext): View {
  const root = el('div', { class: 'scene-fallback', dataset: { view: 'sceneFallback' } });
  const canvas = el('canvas', { class: 'pixel-canvas', attrs: { width: 128, height: 128, 'aria-hidden': 'true' } });
  canvas.style.width = 'min(50vw, 192px)';
  canvas.style.height = 'min(50vw, 192px)';
  let pixel: PixelDogHandle | null = null;

  const view = createView({
    root,
    derive(snapshot) {
      return { status: snapshot.app.rendererStatus, pixel: getPixelState(snapshot.save), stage: snapshot.save.dog.growthStage, route: snapshot.app.route };
    },
    render(snapshot) {
      const status = snapshot.app.rendererStatus;
      root.hidden = status === 'ready';
      if (status === 'ready') return [];
      if (status === 'idle' || status === 'loading') {
        return [el('div', { class: 'stack stack--tight' }, [secondary(t.home.sceneLoading)])];
      }
      if (status === 'contextLost') {
        return [
          el('div', { class: 'stack' }, [
            text(t.webgl.contextLost, 'text-lead'),
            button({ label: t.webgl.retry, variant: 'secondary', key: 'reload' }, () => window.location.reload()),
          ]),
        ];
      }
      return [el('div', { class: 'stack' }, [canvas, text(t.webgl.failed), secondary(t.profile.pixelNote)])];
    },
    afterRender(snapshot) {
      if (snapshot.app.rendererStatus !== 'failed') return;
      try {
        if (!pixel) pixel = ctx.getPixelFactory()(canvas);
        pixel.render(getPixelState(snapshot.save), snapshot.save.dog.growthStage);
      } catch (error) {
        console.warn('[ui] fallback pixel failed', error);
      }
    },
    destroy() {
      pixel?.dispose();
      pixel = null;
    },
  });
  return view;
}
