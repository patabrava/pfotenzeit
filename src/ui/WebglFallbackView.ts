/**
 * Scene-strip fallback (lives inside the scene container, so it follows the D-032 strip measurement):
 * loading text, WebGL unavailable (pixel dog + the same one-line pose description the lesson uses),
 * or context lost (text + reload). Profile and lesson stay fully usable as text.
 */
import { getPixelState } from '../simulation/selectors';
import { button, el, icon, secondary, text } from './components';
import type { UiContext, View } from './context';
import { getFocusPose } from './LessonView';
import type { PixelDogHandle } from './pixelBridge';
import { poseLine, t } from './strings';
import { createView } from './view';

export function createWebglFallbackView(ctx: UiContext): View {
  const root = el('div', { class: 'scene-fallback', dataset: { view: 'sceneFallback' } });
  const canvas = el('canvas', { class: 'pixel-canvas scene-fallback-pixel', attrs: { width: 128, height: 128, 'aria-hidden': 'true' } });
  let pixel: PixelDogHandle | null = null;

  const view = createView({
    root,
    derive(snapshot) {
      const focus = getFocusPose(snapshot, ctx);
      return {
        status: snapshot.app.rendererStatus,
        pixel: snapshot.app.route === 'lesson' ? null : getPixelState(snapshot.save),
        stage: snapshot.save.dog.growthStage,
        route: snapshot.app.route,
        pose: focus ? `${focus.name}:${focus.pose}` : null,
      };
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
      const focus = getFocusPose(snapshot, ctx);
      const inLesson = snapshot.app.route === 'lesson';
      return [
        el('div', { class: 'stack stack--tight scene-fallback-body' }, [
          canvas,
          focus ? el('p', { class: 'pose-line pose-line--scene' }, [icon('eye', 'pose-line-icon'), el('span', { text: poseLine(focus.name, focus.pose) })]) : null,
          inLesson ? null : text(t.webgl.failed),
          inLesson ? null : secondary(t.profile.pixelNote),
        ]),
      ];
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
