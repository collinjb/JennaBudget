import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion, useModalLayer } from './modal';

interface BottomSheetProps {
  title: string;
  /** Called once the sheet has finished sliding away (Cancel, Escape, backdrop, or a successful Save). */
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

/**
 * iOS-style bottom sheet: Cancel · Title · Save header, scrolling body, big Save button at the bottom.
 * Stays usable with the iPhone keyboard open: the sheet is sized to the *visual* viewport, so the
 * header Save never hides behind the keyboard, and the focused field is scrolled into view.
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
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const close = () => {
    if (busy.current) return;
    busy.current = true;
    setClosing(true);
    timer.current = window.setTimeout(() => onCloseRef.current(), prefersReducedMotion() ? 0 : 230);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useModalLayer(panelRef, close);

  // Keep the sheet inside the visible area when the on-screen keyboard opens (iOS doesn't resize the layout).
  useEffect(() => {
    const vv = window.visualViewport;
    const overlay = overlayRef.current;
    if (!vv || !overlay) return;
    let raf = 0;
    const keepFocusedVisible = () => {
      const active = document.activeElement;
      const body = bodyRef.current;
      if (!(active instanceof HTMLElement) || !body || !body.contains(active) || !active.matches(TEXT_INPUT)) return;
      const field = (active.closest('.field, .seg-field, .choices') as HTMLElement | null) ?? active;
      const b = body.getBoundingClientRect();
      const f = field.getBoundingClientRect();
      if (f.top < b.top + 8) body.scrollTop -= b.top + 8 - f.top;
      else if (f.bottom > b.bottom - 8) body.scrollTop += Math.min(f.bottom - (b.bottom - 8), f.top - (b.top + 8));
    };
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        overlay.style.top = `${vv.offsetTop}px`;
        overlay.style.height = `${vv.height}px`;
        overlay.classList.toggle('kb-open', keyboard > 80);
        keepFocusedVisible();
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    const onFocusIn = () => window.setTimeout(keepFocusedVisible, 320);
    overlay.addEventListener('focusin', onFocusIn);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      overlay.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  const save = () => {
    if (busy.current || !onSave) return;
    const ok = onSave();
    if (ok === false) {
      // Bring the first error into view.
      window.setTimeout(() => {
        const err = bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        err?.focus({ preventScroll: true });
        err?.closest('.field')?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
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
      <div className="sheet-backdrop" onClick={close} aria-hidden="true" />
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
          <button type="button" className="sheet__hbtn" onClick={close}>
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
