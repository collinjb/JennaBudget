import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { historyState, isSilentPop, silentBackThen } from './history';

/** history.state key marking the entry an open dialog adds, so Back closes just the dialog (not what's under it). */
const DIALOG_STATE_KEY = 'budgetDialog';
import { useModalLayer } from './modal';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button (delete, erase). */
  destructive?: boolean;
  /** Just a message with a single OK button (no Cancel). */
  alert?: boolean;
}

interface ConfirmDialogProps extends ConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

/** iOS-style alert. Never use window.confirm/alert. Focus starts on Cancel (the safe choice). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive,
  alert,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const msgId = useId();
  useModalLayer(ref, onCancel, alert ? okRef : cancelRef);
  return createPortal(
    <div className="dialog-overlay">
      <div className="dialog-backdrop" aria-hidden="true" onClick={onCancel} />
      <div
        ref={ref}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? msgId : undefined}
        tabIndex={-1}
      >
        <div className="dialog__content">
          <h2 className="dialog__title" id={titleId}>
            {title}
          </h2>
          {message && (
            <div className="dialog__message" id={msgId}>
              {message}
            </div>
          )}
        </div>
        <div className={`dialog__buttons${alert ? ' dialog__buttons--one' : ''}`}>
          {!alert && (
            <button ref={cancelRef} type="button" className="dialog__btn" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            ref={okRef}
            type="button"
            className={`dialog__btn dialog__btn--confirm${destructive ? ' dialog__btn--danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Provides `useConfirm()`: `if (await confirm({ title: 'Delete Rent?' })) { ... }`
 * A new request cancels one that's still open, and Back / swipe-back cancels the open dialog.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; key: number } | null>(null);
  const pending = useRef<((v: boolean) => void) | null>(null);
  const counter = useRef(0);

  const finish = useCallback((value: boolean, fromHistory = false) => {
    const resolve = pending.current;
    pending.current = null;
    setState(null);
    // Take our history entry back off (unless Back already did), and only answer once that's done, so whatever the
    // caller does next (e.g. leave the page) starts from the right history entry.
    if (!fromHistory && historyState()[DIALOG_STATE_KEY] === counter.current) silentBackThen(() => resolve?.(value));
    else resolve?.(value);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        pending.current?.(false);
        pending.current = resolve;
        counter.current += 1;
        // One history entry per open dialog: a newer request takes over the entry of one that's still open.
        const entry = { ...historyState(), [DIALOG_STATE_KEY]: counter.current };
        if (historyState()[DIALOG_STATE_KEY] !== undefined) window.history.replaceState(entry, '');
        else window.history.pushState(entry, '');
        setState({ opts, key: counter.current });
      }),
    [],
  );

  // Back / swipe-back while a dialog is open cancels it (it must never float over the next screen).
  const open = state !== null;
  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      if (isSilentPop() || historyState()[DIALOG_STATE_KEY] === counter.current) return;
      finish(false, true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, finish]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog key={state.key} {...state.opts} onConfirm={() => finish(true)} onCancel={() => finish(false)} />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return fn;
}
