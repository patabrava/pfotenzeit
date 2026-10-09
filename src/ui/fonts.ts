/**
 * Injects the @font-face rules for Atkinson Hyperlegible (self-hosted, SIL OFL 1.1; licence in
 * public/assets/fonts/LICENSE-OFL.txt). `font-display: swap` keeps text visible on the system
 * fallback stack (see fonts.css) until the files arrive. Failures are silent: the fallback stack is fine.
 */
const FACES: Array<{ file: string; weight: number; style: 'normal' | 'italic' }> = [
  { file: 'AtkinsonHyperlegible-Regular.woff2', weight: 400, style: 'normal' },
  { file: 'AtkinsonHyperlegible-Italic.woff2', weight: 400, style: 'italic' },
  { file: 'AtkinsonHyperlegible-Bold.woff2', weight: 700, style: 'normal' },
  { file: 'AtkinsonHyperlegible-BoldItalic.woff2', weight: 700, style: 'italic' },
];

let injected = false;

export function installFonts(baseUrl: string = import.meta.env.BASE_URL): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const css = FACES.map(
    (face) =>
      `@font-face{font-family:'Atkinson Hyperlegible';font-style:${face.style};font-weight:${face.weight};font-display:swap;src:url('${base}assets/fonts/${face.file}') format('woff2');}`,
  ).join('\n');
  try {
    const style = document.createElement('style');
    style.setAttribute('data-pfotenzeit-fonts', '');
    style.textContent = css;
    document.head.append(style);
  } catch (error) {
    console.warn('[ui] font injection failed, using system stack', error);
  }
}
