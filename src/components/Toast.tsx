import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck } from './Icons';

export interface ToastOptions {
  message: string;
  /** e.g. "Undo" */
  actionLabel?: string;
  onAction?: () => void;
  /** ms, default 5000 */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Small message above the tab bar, with an optional Undo. Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);

  const show = useCallback((opts: ToastOptions) => {
    counter.current += 1;
    setToast({ ...opts, id: counter.current });
  }, []);
  const hide = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.duration ?? 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
          {toast && (
            <div className="toast" key={toast.id}>
              <IconCheck size={18} />
              <span className="toast__msg">{toast.message}</span>
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  className="toast__action"
                  onClick={() => {
                    toast.onAction?.();
                    setToast(null);
                  }}
                >
                  {toast.actionLabel}
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
