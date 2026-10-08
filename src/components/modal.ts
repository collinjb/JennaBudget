import { useEffect, useRef, type RefObject } from 'react';

// A tiny modal stack shared by bottom sheets and dialogs:
// only the top-most layer reacts to Escape / traps Tab, and the app behind is made inert
// (VoiceOver and keyboard can't wander behind an open sheet).

const stack: symbol[] = [];

function syncInert() {
  const root = document.getElementById('root');
  if (!root) return;
  if (stack.length > 0) root.setAttribute('inert', '');
  else root.removeAttribute('inert');
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (n) => !n.hasAttribute('inert') && n.offsetParent !== null,
  );
}

/**
 * Register a modal layer while mounted: Escape calls `onEscape`, Tab stays inside `ref`,
 * focus moves in (to `initialFocus` or the container) and returns to the opener on close.
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
    const token = Symbol('modal');
    stack.push(token);
    syncInert();
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = ref.current;
    const first = initialFocus?.current ?? el;
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token || !el) return;
      if (e.key === 'Escape') {
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
      const i = stack.indexOf(token);
      if (i !== -1) stack.splice(i, 1);
      syncInert();
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref, initialFocus]);
}

/** True when the person asked the phone to reduce motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
