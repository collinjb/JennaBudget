import { useEffect, useRef, type RefObject } from 'react';

// A tiny modal stack shared by bottom sheets, dialogs and the celebration:
// only the top-most layer reacts to Escape / traps Tab, and everything under it is made inert
// (the app behind, and any lower layer such as a sheet under a confirm dialog), so VoiceOver and the
// keyboard can't wander behind the layer on top.

interface Layer {
  token: symbol;
  el: HTMLElement | null;
}

const stack: Layer[] = [];

function syncInert() {
  const root = document.getElementById('root');
  if (root) {
    if (stack.length > 0) root.setAttribute('inert', '');
    else root.removeAttribute('inert');
  }
  stack.forEach((layer, i) => {
    if (!layer.el) return;
    if (i < stack.length - 1) layer.el.setAttribute('inert', '');
    else layer.el.removeAttribute('inert');
  });
}

/** True while any sheet, dialog or celebration is open. */
export function isModalOpen(): boolean {
  return stack.length > 0;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (n) => !n.hasAttribute('inert') && n.offsetParent !== null,
  );
}

// Last way the person interacted: keyboard users get moved focus scrolled into view; touch users keep their place.
let usingKeyboard = false;
// Safari doesn't focus a button when it's tapped, so also remember the last control that was activated.
let lastActivated: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', () => (usingKeyboard = true), true);
  document.addEventListener('pointerdown', () => (usingKeyboard = false), true);
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target instanceof Element ? e.target.closest<HTMLElement>('button, a[href], [role="button"], summary') : null;
      if (t) lastActivated = t;
    },
    true,
  );
}

/**
 * The control that opened whatever is opening now: the focused element, or (Safari doesn't focus tapped buttons)
 * the control that was just activated.
 */
export function currentOpener(): HTMLElement | null {
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body) return a;
  return lastActivated?.isConnected ? lastActivated : null;
}

/** Focus an element that focus is being moved to by the app (not by the person). */
export function moveFocus(el: HTMLElement | null | undefined): void {
  el?.focus({ preventScroll: !usingKeyboard });
}

/**
 * Where focus goes when the element that opened a layer is gone (e.g. the row of an item that was just deleted):
 * the screen's "+ Add" button when there is one, otherwise the screen's title.
 */
export function focusScreenFallback(): void {
  const main = document.querySelector('main');
  moveFocus(main?.querySelector<HTMLElement>('.add-pill') ?? main?.querySelector<HTMLElement>('h1[tabindex]'));
}

/**
 * Register a modal layer while mounted: Escape calls `onEscape`, Tab stays inside `ref`,
 * focus moves in (to `initialFocus` or the container) and returns to the opener on close
 * (or to the screen's Add button / title when the opener no longer exists).
 */
export function useModalLayer(
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const escRef = useRef(onEscape);
  useEffect(() => {
    escRef.current = onEscape;
  });

  useEffect(() => {
    const el = ref.current;
    const layer: Layer = { token: Symbol('modal'), el };
    stack.push(layer);
    syncInert();
    const opener = currentOpener();
    const first = initialFocus?.current ?? el;
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== layer || !el) return;
      if (e.key === 'Escape') {
        // Something inside (e.g. the emoji picker) already handled it.
        if (e.defaultPrevented) return;
        e.preventDefault();
        escRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstItem || active === el)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      } else if (!el.contains(active)) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(layer);
      if (i !== -1) stack.splice(i, 1);
      el?.removeAttribute('inert');
      syncInert();
      // Only the layer that had focus hands it back (a layer closing underneath another one leaves focus alone).
      const active = document.activeElement;
      const hadFocus = !active || active === document.body || (el?.contains(active) ?? false);
      if (!hadFocus) return;
      if (opener && opener.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
      else if (stack.length === 0) focusScreenFallback();
    };
  }, [ref, initialFocus]);
}

/** True when the person asked the phone to reduce motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
