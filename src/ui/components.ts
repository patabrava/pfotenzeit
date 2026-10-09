/**
 * Small DOM component helpers. No domain logic. Everything returns plain elements.
 */
import { bindAction, isolateScrollRegion, markSheetClosed, trapFocus, type ActionHandler, type BindActionOptions } from '../input/actions';
import { t } from './strings';

type Child = Node | string | null | undefined | false;

export interface ElProps {
  class?: string;
  id?: string;
  text?: string;
  html?: never;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  if (props.dataset) {
    for (const [key, value] of Object.entries(props.dataset)) node.dataset[key] = value;
  }
  if (props.style) Object.assign(node.style, props.style);
  append(node, children);
  return node;
}

export function append(parent: HTMLElement, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function replaceChildren(parent: HTMLElement, children: Child[]): void {
  parent.replaceChildren();
  append(parent, children);
}

export function text(content: string, className = ''): HTMLParagraphElement {
  return el('p', { class: className, text: content });
}

export function secondary(content: string): HTMLParagraphElement {
  return el('p', { class: 'text-secondary', text: content });
}

// ---------------------------------------------------------------- icons (inline SVG, decorative)

export type IconName =
  | 'gear'
  | 'school'
  | 'paw'
  | 'back'
  | 'close'
  | 'more'
  | 'chevron'
  | 'warn'
  | 'alert'
  | 'info'
  | 'pause'
  | 'play'
  | 'bowl'
  | 'rest'
  | 'toy'
  | 'calm'
  | 'check'
  | 'eye'
  | 'leaf';

const ICON_PATHS: Record<IconName, string> = {
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4-1.9.6a7.4 7.4 0 0 1-.6 1.5l.9 1.8-1.4 1.4-1.8-.9a7.4 7.4 0 0 1-1.5.6L14 19h-2l-.6-1.9a7.4 7.4 0 0 1-1.5-.6l-1.8.9-1.4-1.4.9-1.8a7.4 7.4 0 0 1-.6-1.5L5 12v-2l1.9-.6a7.4 7.4 0 0 1 .6-1.5l-.9-1.8 1.4-1.4 1.8.9a7.4 7.4 0 0 1 1.5-.6L12 3h2l.6 1.9a7.4 7.4 0 0 1 1.5.6l1.8-.9 1.4 1.4-.9 1.8a7.4 7.4 0 0 1 .6 1.5L21 10v2Z',
  school: 'M3 10 12 5l9 5-9 5-9-5Zm3 3.5V17c0 1.5 3 3 6 3s6-1.5 6-3v-3.5l-6 3.3-6-3.3ZM20 11v5h1.5v-5H20Z',
  paw: 'M7 9.5A2 2 0 1 1 7 5a2 2 0 0 1 0 4.5Zm10 0A2 2 0 1 1 17 5a2 2 0 0 1 0 4.5ZM3.5 13A2 2 0 1 1 3.5 9a2 2 0 0 1 0 4Zm17 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM12 11c3 0 6 3 6 6a3 3 0 0 1-3 3c-1 0-2-.5-3-.5s-2 .5-3 .5a3 3 0 0 1-3-3c0-3 3-6 6-6Z',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  chevron: 'M6 9l6 6 6-6',
  warn: 'M12 3 2 21h20L12 3Zm0 6v6m0 2v2',
  alert: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5v6m0 3v1',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 9v6m0-10v1',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5v14l12-7-12-7Z',
  bowl: 'M4 12h16a8 8 0 0 1-16 0Zm4-3c1-2 3-2 4 0 1-2 3-2 4 0',
  rest: 'M4 16h16v3H4zM6 16c0-3 2-5 6-5s6 2 6 5',
  toy: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-5 3c3 2 7 2 10 0M7 17c3-2 7-2 10 0',
  calm: 'M4 12c3-4 5-4 8 0s5 4 8 0M4 18c3-4 5-4 8 0s5 4 8 0',
  check: 'M5 12l5 5L20 7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  leaf: 'M5 19c0-8 5-13 14-14-1 9-6 14-14 14Zm0 0 8-8',
};

const FILLED: ReadonlySet<IconName> = new Set<IconName>(['gear', 'school', 'paw', 'play', 'toy']);

export function icon(name: IconName, className = 'btn-icon'): HTMLSpanElement {
  const span = el('span', { class: className, attrs: { 'aria-hidden': 'true' } });
  const filled = FILLED.has(name);
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${filled ? 0 : 2}" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[name]}"/></svg>`;
  return span;
}

// ---------------------------------------------------------------- buttons

export interface ButtonProps {
  label: string;
  sub?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'option' | 'accent' | 'plain';
  large?: boolean;
  block?: boolean;
  icon?: IconName;
  iconOnly?: boolean;
  iconLabel?: boolean;
  class?: string;
  ariaLabel?: string;
  /** Explained no-op: focusable, announced as disabled, handler not called. */
  ariaDisabled?: boolean;
  disabled?: boolean;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  key?: string;
  options?: BindActionOptions;
}

export function button(props: ButtonProps, onActivate: ActionHandler): HTMLButtonElement {
  const classes = ['btn'];
  if (props.variant && props.variant !== 'plain') classes.push(`btn--${props.variant}`);
  if (props.large) classes.push('btn--large');
  if (props.block) classes.push('btn--block');
  if (props.iconOnly) classes.push('btn--icon');
  if (props.iconLabel) classes.push('btn--icon-label');
  if (props.class) classes.push(props.class);
  const node = el('button', {
    class: classes.join(' '),
    attrs: {
      type: 'button',
      'aria-label': props.iconOnly ? (props.ariaLabel ?? props.label) : props.ariaLabel,
      'aria-disabled': props.ariaDisabled ? 'true' : undefined,
      ...props.attrs,
    },
  });
  if (props.disabled) node.disabled = true;
  if (props.key) node.dataset.key = props.key;
  if (props.icon) node.append(icon(props.icon));
  if (!props.iconOnly) {
    const label = el('span', { class: 'btn-label', text: props.label });
    if (props.sub) {
      const wrap = el('span', {}, [label, el('span', { class: 'btn-sub', text: props.sub })]);
      node.append(wrap);
    } else {
      node.append(label);
    }
  }
  bindAction(node, onActivate, props.options);
  return node;
}

// ---------------------------------------------------------------- switch & segmented

export function switchControl(
  label: string,
  checked: boolean,
  onToggle: (next: boolean) => void | Promise<void>,
  key?: string,
): HTMLElement {
  const sw = el('button', {
    class: 'switch',
    attrs: { type: 'button', role: 'switch', 'aria-checked': String(checked), 'aria-label': label },
  });
  if (key) sw.dataset.key = key;
  const stateText = el('span', { class: 'switch-text', text: checked ? t.settings.on : t.settings.off, attrs: { 'aria-hidden': 'true' } });
  bindAction(sw, async () => {
    const next = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(next));
    stateText.textContent = next ? t.settings.on : t.settings.off;
    await onToggle(next);
  });
  return el('span', { class: 'switch-wrap' }, [stateText, sw]);
}

export function segmented<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  current: T,
  onSelect: (value: T) => void | Promise<void>,
  keyPrefix = 'seg',
): HTMLElement {
  const group = el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': label } });
  for (const option of options) {
    const btn = button(
      {
        label: option.label,
        variant: 'plain',
        key: `${keyPrefix}-${option.value}`,
        attrs: { 'aria-pressed': String(option.value === current) },
      },
      async () => {
        for (const child of Array.from(group.children)) child.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-pressed', 'true');
        await onSelect(option.value);
      },
    );
    group.append(btn);
  }
  return group;
}

// ---------------------------------------------------------------- need bars

export interface NeedBarProps {
  label: string;
  value: number;
  words: string;
  showValue: boolean;
  low: boolean;
  id: string;
}

export function needBar(props: NeedBarProps): HTMLElement {
  const fill = el('div', { class: `needbar-fill${props.low ? ' is-low' : ''}` });
  fill.style.width = `${Math.max(0, Math.min(100, props.value))}%`;
  const wordsText = props.showValue ? `${props.words} ${t.needs.valueOf(props.value)}` : props.words;
  const wrapper = el(
    'div',
    {
      class: 'needbar',
      attrs: {
        role: 'meter',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(props.value),
        'aria-valuetext': `${props.words}, ${t.needs.valueOf(props.value)}`,
        'aria-labelledby': `${props.id}-label`,
      },
    },
    [
      el('span', { class: 'needbar-label', id: `${props.id}-label`, text: props.label }),
      el('div', { class: 'needbar-track', attrs: { 'aria-hidden': 'true' } }, [fill]),
      el('span', { class: 'needbar-words', text: wordsText, attrs: { 'aria-hidden': 'true' } }),
    ],
  );
  return wrapper;
}

/** Animate an existing need bar to a new value (presentation snapshot → committed end state). */
export function setNeedBarValue(bar: HTMLElement, value: number, words: string, showValue: boolean, low: boolean): void {
  const fill = bar.querySelector<HTMLElement>('.needbar-fill');
  const wordsEl = bar.querySelector<HTMLElement>('.needbar-words');
  if (fill) {
    fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
    fill.classList.toggle('is-low', low);
  }
  if (wordsEl) wordsEl.textContent = showValue ? `${words} ${t.needs.valueOf(value)}` : words;
  bar.setAttribute('aria-valuenow', String(Math.round(value)));
  bar.setAttribute('aria-valuetext', `${words}, ${t.needs.valueOf(value)}`);
}

// ---------------------------------------------------------------- tabs

export function tabs<T extends string>(
  items: { id: T; label: string }[],
  current: T,
  onSelect: (id: T) => void,
  idPrefix: string,
): { list: HTMLElement; panelId: (id: T) => string } {
  const list = el('div', { class: 'tabs', attrs: { role: 'tablist' } });
  const buttons: HTMLButtonElement[] = [];
  items.forEach((item, index) => {
    const selected = item.id === current;
    const tab = el('button', {
      class: 'tab',
      id: `${idPrefix}-tab-${item.id}`,
      text: item.label,
      attrs: {
        type: 'button',
        role: 'tab',
        'aria-selected': String(selected),
        'aria-controls': `${idPrefix}-panel-${item.id}`,
        tabindex: selected ? 0 : -1,
      },
    });
    tab.dataset.key = `tab-${item.id}`;
    bindAction(tab, () => onSelect(item.id));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % items.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      buttons[next]?.focus();
      onSelect(items[next]!.id);
    });
    buttons.push(tab);
    list.append(tab);
  });
  return { list, panelId: (id) => `${idPrefix}-panel-${id}` };
}

// ---------------------------------------------------------------- collapsible

export function collapsible(
  label: string,
  body: HTMLElement,
  open: boolean,
  onToggle: (open: boolean) => void,
  key = 'collapsible',
): HTMLElement {
  const bodyId = `${key}-body`;
  body.id = bodyId;
  body.classList.add('collapsible-body');
  body.hidden = !open;
  const toggle = button(
    {
      label,
      variant: 'secondary',
      class: 'collapsible-toggle',
      key,
      attrs: { 'aria-expanded': String(open), 'aria-controls': bodyId },
    },
    () => {
      const next = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(next));
      body.hidden = !next;
      onToggle(next);
    },
  );
  toggle.append(icon('chevron', 'btn-icon chevron'));
  return el('div', { class: 'collapsible' }, [toggle, body]);
}

// ---------------------------------------------------------------- live region

export interface LiveRegion {
  node: HTMLElement;
  announce(message: string): void;
}

export function createLiveRegion(): LiveRegion {
  const node = el('div', { class: 'sr-only', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' } });
  let timer: number | null = null;
  return {
    node,
    announce(message) {
      // Clear first so identical consecutive messages are re-announced.
      node.textContent = '';
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        node.textContent = message;
        timer = null;
      }, 30);
    },
  };
}

// ---------------------------------------------------------------- sheet & dialog

export interface ModalHandle {
  root: HTMLElement;
  body: HTMLElement;
  close(): void;
  /** True once closed (by any path). */
  isOpen(): boolean;
}

export interface SheetOptions {
  title: string;
  onClose?: () => void;
  /** Element that receives focus first (defaults to first focusable). */
  initialFocus?: HTMLElement | null;
  /** Whether a backdrop press closes the sheet (default true). */
  dismissible?: boolean;
}

export function createSheet(host: HTMLElement, options: SheetOptions, children: Child[]): ModalHandle {
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  const body = el('div', { class: 'sheet-body' });
  isolateScrollRegion(body);
  append(body, children);
  let open = true;

  const closeBtn = button({ label: t.app.close, icon: 'close', iconOnly: true, variant: 'ghost', key: 'sheet-close' }, () => close());
  const panel = el(
    'div',
    { class: 'sheet-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: -1 } },
    [el('div', { class: 'sheet-handle', attrs: { 'aria-hidden': 'true' } }), el('div', { class: 'sheet-head' }, [el('h2', { id: titleId, text: options.title }), closeBtn]), body],
  );
  const backdrop = el('button', { class: 'sheet-backdrop', attrs: { type: 'button', 'aria-label': t.app.close, tabindex: -1 } });
  if (options.dismissible !== false) {
    backdrop.addEventListener('click', () => close());
  }
  const root = el('div', { class: 'sheet' }, [backdrop, panel]);
  host.append(root);
  const trap = trapFocus(panel, () => close(), options.initialFocus ?? panel);

  function close(): void {
    if (!open) return;
    open = false;
    markSheetClosed();
    trap.release();
    root.remove();
    options.onClose?.();
  }

  return { root, body, close, isOpen: () => open };
}

export interface DialogOptions {
  title: string;
  text?: string;
  onClose?: () => void;
  dismissible?: boolean;
}

export function createDialog(host: HTMLElement, options: DialogOptions, actions: HTMLElement[], extra: Child[] = []): ModalHandle {
  const titleId = `dialog-title-${Math.random().toString(36).slice(2, 8)}`;
  const descId = `${titleId}-desc`;
  let open = true;
  const actionWrap = el('div', { class: 'dialog-actions' }, actions);
  const body = el('div', { class: 'stack' }, extra);
  const panel = el(
    'div',
    {
      class: 'dialog-panel',
      attrs: {
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        'aria-describedby': options.text ? descId : undefined,
        tabindex: -1,
      },
    },
    [el('h2', { id: titleId, text: options.title }), options.text ? el('p', { id: descId, text: options.text }) : null, body, actionWrap],
  );
  isolateScrollRegion(panel);
  const backdrop = el('button', { class: 'dialog-backdrop', attrs: { type: 'button', 'aria-label': t.app.close, tabindex: -1 } });
  if (options.dismissible !== false) backdrop.addEventListener('click', () => close());
  const root = el('div', { class: 'dialog' }, [backdrop, panel]);
  host.append(root);
  const trap = trapFocus(panel, () => (options.dismissible === false ? undefined : close()), panel);

  function close(): void {
    if (!open) return;
    open = false;
    markSheetClosed();
    trap.release();
    root.remove();
    options.onClose?.();
  }

  return { root, body, close, isOpen: () => open };
}

/** Confirm dialog helper: resolves true when confirmed. */
export function confirmDialog(
  host: HTMLElement,
  options: { title: string; text: string; confirmLabel: string; cancelLabel?: string; confirmVariant?: 'primary' | 'secondary' },
): Promise<boolean> {
  return new Promise((resolve) => {
    let decided = false;
    const handle = createDialog(
      host,
      {
        title: options.title,
        text: options.text,
        onClose: () => {
          if (!decided) resolve(false);
        },
      },
      [
        button({ label: options.confirmLabel, variant: options.confirmVariant ?? 'primary', block: true, key: 'confirm' }, () => {
          decided = true;
          handle.close();
          resolve(true);
        }),
        button({ label: options.cancelLabel ?? t.app.cancel, variant: 'secondary', block: true, key: 'cancel' }, () => {
          decided = true;
          handle.close();
          resolve(false);
        }),
      ],
    );
  });
}

// ---------------------------------------------------------------- banner

export function banner(
  kind: 'info' | 'warn' | 'crit',
  title: string | null,
  message: string,
  actions: HTMLElement[] = [],
  inline = false,
): HTMLElement {
  const iconName: IconName = kind === 'crit' ? 'alert' : kind === 'warn' ? 'warn' : 'info';
  const textWrap = el('div', { class: 'banner-text' }, [title ? el('strong', { text: title }) : null, el('span', { text: message })]);
  if (actions.length > 0) textWrap.append(el('div', { class: 'banner-actions' }, actions));
  return el(
    'div',
    { class: `banner banner--${kind}${inline ? ' banner--inline' : ''}`, attrs: { role: kind === 'crit' ? 'alert' : 'status' } },
    [icon(iconName, 'banner-icon'), textWrap],
  );
}

// ---------------------------------------------------------------- focus/scroll preservation for re-renders

export interface RenderMemo {
  focusKey: string | null;
  scrolls: { key: string; top: number }[];
}

export function captureRenderMemo(root: HTMLElement): RenderMemo {
  const active = document.activeElement;
  const focusKey = active instanceof HTMLElement && root.contains(active) ? (active.dataset.key ?? null) : null;
  const scrolls: RenderMemo['scrolls'] = [];
  for (const node of root.querySelectorAll<HTMLElement>('[data-scroll-key]')) {
    if (node.scrollTop > 0) scrolls.push({ key: node.dataset.scrollKey!, top: node.scrollTop });
  }
  return { focusKey, scrolls };
}

export function restoreRenderMemo(root: HTMLElement, memo: RenderMemo): void {
  for (const entry of memo.scrolls) {
    const node = root.querySelector<HTMLElement>(`[data-scroll-key="${entry.key}"]`);
    if (node) node.scrollTop = entry.top;
  }
  if (memo.focusKey) {
    const node = root.querySelector<HTMLElement>(`[data-key="${CSS.escape(memo.focusKey)}"]`);
    if (node && !node.hidden) node.focus({ preventScroll: true });
  }
}
