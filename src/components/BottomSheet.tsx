import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { announce } from './announce';
import { historyState, isSilentPop, silentBack } from './history';
import { prefersReducedMotion, useModalLayer } from './modal';

interface BottomSheetProps {
  title: string;
  /** Called once the sheet has finished sliding away (Cancel, Escape, Back, backdrop, or a successful Save). */
  onClose: () => void;
  /** Save handler. Return false to keep the sheet open (e.g. a field has an error). */
  onSave?: () => boolean | void;
  saveLabel?: string;
  /** Text of the big button at the bottom, e.g. "Save bill" (defaults to saveLabel). */
  bigSaveLabel?: string;
  cancelLabel?: string;
  /** Optional destructive action at the very bottom (e.g. "Delete bill"). Return true to close. */
  onDelete?: () => Promise<boolean> | boolean;
  deleteLabel?: string;
  children: ReactNode;
  testId?: string;
}

const TEXT_INPUT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select';
/** history.state key marking the entry a sheet adds, so Back / swipe-back closes the sheet. */
const SHEET_STATE_KEY = 'budgetSheet';

/**
 * iOS-style bottom sheet: Cancel · Title · Save header, scrolling body, big Save button at the bottom.
 * Stays usable with the iPhone keyboard open: the sheet is sized to the *visual* viewport, so the
 * header Save never hides behind the keyboard, and the focused field is scrolled into view whenever
 * the space for the body actually changes (the keyboard often finishes opening well after the focus).
 * Back / swipe-back closes the sheet (it adds a history entry while open).
 */
export function BottomSheet({
  title,
  onClose,
  onSave,
  saveLabel = 'Save',
  bigSaveLabel,
  cancelLabel = 'Cancel',
  onDelete,
  deleteLabel = 'Delete',
  children,
  testId,
}: BottomSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const sheetKey = useId();
  const pushed = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const close = (fromHistory = false) => {
    if (busy.current) return;
    busy.current = true;
    // Take our history entry back off (unless Back already did).
    if (!fromHistory && historyState()[SHEET_STATE_KEY] === sheetKey) silentBack();
    setClosing(true);
    timer.current = window.setTimeout(() => onCloseRef.current(), prefersReducedMotion() ? 0 : 230);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Back / swipe-back closes the sheet instead of leaving the screen.
  useEffect(() => {
    if (!pushed.current) {
      pushed.current = true;
      window.history.pushState({ ...historyState(), [SHEET_STATE_KEY]: sheetKey }, '');
    }
    const onPop = () => {
      if (isSilentPop() || historyState()[SHEET_STATE_KEY] === sheetKey) return;
      closeRef.current(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sheetKey]);

  useModalLayer(panelRef, () => close());

  // Keep the sheet inside the visible area when the on-screen keyboard opens (iOS doesn't resize the layout),
  // and keep the focused field visible whenever the body's size changes.
  useEffect(() => {
    const vv = window.visualViewport;
    const overlay = overlayRef.current;
    const body = bodyRef.current;
    if (!overlay || !body) return;
    let raf = 0;
    let raf2 = 0;
    const keepFocusedVisible = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !body.contains(active) || !active.matches(TEXT_INPUT)) return;
      const field = (active.closest('.field, .seg-field, .choices') as HTMLElement | null) ?? active;
      const b = body.getBoundingClientRect();
      const f = field.getBoundingClientRect();
      if (b.height <= 0) return;
      if (f.top < b.top + 8) body.scrollTop -= b.top + 8 - f.top;
      else if (f.bottom > b.bottom - 8) body.scrollTop += Math.min(f.bottom - (b.bottom - 8), f.top - (b.top + 8));
    };
    /** Measure after layout has caught up (two frames: the resize lands in the first, layout in the next). */
    const keepVisibleSoon = () => {
      cancelAnimationFrame(raf2);
      raf2 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(keepFocusedVisible);
      });
    };
    const update = () => {
      if (!vv) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        overlay.style.top = `${vv.offsetTop}px`;
        overlay.style.height = `${vv.height}px`;
        overlay.classList.toggle('kb-open', keyboard > 80);
        keepVisibleSoon();
      });
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    // Whenever the body really gets smaller or bigger (keyboard, helper text, errors), re-check the focused field.
    let lastHeight = body.clientHeight;
    const ro =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            const h = body.clientHeight;
            if (h === lastHeight) return;
            lastHeight = h;
            keepVisibleSoon();
          })
        : null;
    ro?.observe(body);
    const focusTimers: number[] = [];
    const onFocusIn = () => {
      keepVisibleSoon();
      // Belt and braces for slow keyboards that resize without a visualViewport event.
      focusTimers.push(window.setTimeout(keepFocusedVisible, 320), window.setTimeout(keepFocusedVisible, 700));
    };
    overlay.addEventListener('focusin', onFocusIn);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      focusTimers.forEach((t) => window.clearTimeout(t));
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      ro?.disconnect();
      overlay.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  const save = () => {
    if (busy.current || !onSave) return;
    const ok = onSave();
    if (ok === false) {
      // Bring the first error into view; its message is read with the field (aria-describedby).
      window.setTimeout(() => {
        const invalid = bodyRef.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') ?? [];
        const err = invalid[0];
        err?.focus({ preventScroll: true });
        err?.closest('.field, .field-group')?.scrollIntoView({
          block: 'center',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
        announce(invalid.length > 1 ? `${invalid.length} fields need a fix.` : 'Please check the highlighted field.');
      }, 0);
      return;
    }
    close();
  };

  const del = async () => {
    if (busy.current || !onDelete) return;
    const ok = await onDelete();
    if (ok) close();
  };

  // "Return"/"Done" on the keyboard just closes the keyboard instead of submitting anything by surprise.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'radio') {
      e.preventDefault();
      t.blur();
    }
  };

  return createPortal(
    <div ref={overlayRef} className={`sheet-overlay${closing ? ' is-closing' : ''}`}>
      <div className="sheet-backdrop" onClick={() => close()} aria-hidden="true" />
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="sheet__grabber" aria-hidden="true" />
        <div className="sheet__header">
          <button type="button" className="sheet__hbtn" onClick={() => close()}>
            {cancelLabel}
          </button>
          <h2 className="sheet__title" id={titleId}>
            {title}
          </h2>
          {onSave ? (
            <button type="button" className="sheet__hbtn sheet__hbtn--save" onClick={save}>
              {saveLabel}
            </button>
          ) : (
            <span className="sheet__hbtn sheet__hbtn--ghost" aria-hidden="true" />
          )}
        </div>
        <div ref={bodyRef} className="sheet__body" onKeyDown={onKeyDown}>
          {children}
          {onSave && (
            <button type="button" className="btn btn--primary btn--block btn--lg sheet__save" onClick={save}>
              {bigSaveLabel ?? saveLabel}
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn btn--danger-plain btn--block" onClick={del}>
              {deleteLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
