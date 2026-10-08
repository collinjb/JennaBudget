import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useBudget } from '../state/store';
import { IconCheck } from './Icons';
import { moveFocus } from './modal';

export interface ToastOptions {
  message: string;
  /** e.g. "Undo" */
  actionLabel?: string;
  onAction?: () => void;
  /** ms. Default 5000, or 7000 when there is an action (time to read it and reach the button). */
  duration?: number;
  /**
   * Close the toast as soon as anything else in the budget changes. For an Undo that puts back a whole copy of the
   * data (Smart Plan, example budget, restore): after any other edit, that Undo would silently throw the edit away.
   */
  dismissOnChange?: boolean;
}

interface ToastItem extends ToastOptions {
  id: number;
  /** Has been on screen with the budget data as it was right after the toast was shown. */
  armed: boolean;
}

interface ToastApi {
  show: (opts: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);
/** At most this many toasts stack up (newest at the bottom); older ones drop off first. */
const MAX_TOASTS = 3;

/**
 * Small messages above the tab bar, each with an optional Undo, announced politely to screen readers.
 * A second toast stacks under the first instead of replacing it, so an earlier Undo isn't lost.
 * A toast never times out while it has focus or a finger/pointer is on it, and focus goes back where it came
 * from when it closes.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { data } = useBudget();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [seenData, setSeenData] = useState(data);
  const counter = useRef(0);
  const regionRef = useRef<HTMLDivElement>(null);
  /** Where focus was before it moved into a toast. */
  const returnFocus = useRef<HTMLElement | null>(null);

  // Drop "dismissOnChange" toasts once the budget changes after they appeared; arm new toasts.
  // (Adjusting state while rendering: no extra commit with a stale Undo on screen.)
  let next = toasts;
  if (data !== seenData) {
    setSeenData(data);
    next = next.filter((t) => !(t.dismissOnChange && t.armed));
  }
  if (next.some((t) => !t.armed)) next = next.map((t) => (t.armed ? t : { ...t, armed: true }));
  if (next !== toasts) setToasts(next);

  const show = useCallback((opts: ToastOptions) => {
    counter.current += 1;
    const item: ToastItem = { ...opts, id: counter.current, armed: false };
    setToasts((cur) => [...cur, item].slice(-MAX_TOASTS));
  }, []);

  /** `byPerson`: closed with its own button (Safari may already have dropped focus to the page then). */
  const dismiss = useCallback((id: number, byPerson = false) => {
    const el = regionRef.current?.querySelector(`[data-toast-id="${id}"]`);
    const focusInToast = !!el && el.contains(document.activeElement);
    const focusLost = byPerson && (!document.activeElement || document.activeElement === document.body);
    if (focusInToast || focusLost) {
      const back = returnFocus.current;
      if (back && back.isConnected && !back.closest('[inert]')) moveFocus(back);
      else moveFocus(document.querySelector<HTMLElement>('main h1[tabindex]'));
    }
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const hide = useCallback(() => setToasts([]), []);
  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          ref={regionRef}
          className="toast-region"
          role="status"
          aria-live="polite"
          aria-atomic="false"
          onFocus={(e) => {
            const from = e.relatedTarget;
            if (from instanceof HTMLElement && !regionRef.current?.contains(from)) returnFocus.current = from;
          }}
        >
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} onDone={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: ToastItem; onDone: (id: number, byPerson?: boolean) => void }) {
  const hasAction = !!(toast.actionLabel && toast.onAction);
  const remaining = useRef(toast.duration ?? (hasAction ? 7000 : 5000));
  const [focused, setFocused] = useState(false);
  const [pointer, setPointer] = useState(false);
  const paused = focused || pointer;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const t = window.setTimeout(() => onDone(toast.id), Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - started;
    };
  }, [paused, onDone, toast.id]);

  return (
    <div
      className="toast"
      data-toast-id={toast.id}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPointer(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setPointer(false)}
      onTouchStart={() => setPointer(true)}
      onTouchEnd={() => setPointer(false)}
      onTouchCancel={() => setPointer(false)}
    >
      <IconCheck size={18} />
      <span className="toast__msg">{toast.message}</span>
      {hasAction && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.onAction?.();
            onDone(toast.id, true);
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
