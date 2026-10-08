import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { clearData, loadPreviousData, markOnboardedIfFilled, saveData } from '../storage/storage';
import { saveCopyMessage, saveCopyOfData } from './saveCopy';
import { checkForUpdate, reloadToLatest } from './sw';
import './pwa.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level safety net: if anything in the app throws while rendering, show a friendly screen
 * instead of a blank one. Saved data lives in storage and isn't touched by a crash.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Maybe this is already fixed in a newer version: start downloading it so "Reload" can switch to it.
    void checkForUpdate();
  }

  override render(): ReactNode {
    if (this.state.error) return <CrashScreen />;
    return this.props.children;
  }
}

type Pending = 'previous' | 'fresh' | null;

/**
 * The crash screen never leaves the person stuck: reload, save a copy, go back to the last good copy of the data
 * (if the newest change is what breaks the app), or start fresh. The last two ask first, right here (this screen
 * runs without the app's dialogs).
 */
function CrashScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [previous] = useState(() => loadPreviousData());
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  const reload = () => {
    setBusy(true);
    void reloadToLatest();
  };

  const saveCopy = async () => {
    try {
      setMessage(saveCopyMessage(await saveCopyOfData()));
    } catch {
      setMessage("Sorry, the copy couldn't be saved.");
    }
  };

  const confirm = () => {
    if (pending === 'previous') {
      if (!previous) return;
      const res = saveData(markOnboardedIfFilled(previous));
      if (!res.ok) {
        setMessage(res.error);
        setPending(null);
        return;
      }
    } else if (pending === 'fresh') {
      clearData();
    }
    setBusy(true);
    window.location.reload();
  };

  return (
    <main className="pwa-screen">
      <div className="pwa-screen__inner pwa-screen__inner--center">
        <div className="pwa-hero" aria-hidden="true">
          😕
        </div>
        <div role="alert">
          <h1 className="pwa-title">Something went wrong.</h1>
          <p className="pwa-text">
            Your data is safe. It's still saved on this phone. Reloading the app usually fixes this.
          </p>
        </div>
        <div className="pwa-actions">
          <button type="button" className="pwa-btn pwa-btn--primary" onClick={reload} disabled={busy}>
            {busy ? 'Reloading…' : 'Reload'}
          </button>
          <button type="button" className="pwa-btn pwa-btn--secondary" onClick={() => void saveCopy()}>
            Save a copy of my data
          </button>
        </div>
        {message && (
          <p className="pwa-note" role="status">
            {message}
          </p>
        )}

        {pending ? (
          <div
            ref={confirmRef}
            className="pwa-confirm pwa-card"
            role="group"
            aria-labelledby="pwa-crash-q"
            tabIndex={-1}
          >
            <p className="pwa-text pwa-text--strong" id="pwa-crash-q">
              {pending === 'previous'
                ? 'Go back to the copy from just before your last change? That last change will be lost.'
                : "Erase everything and start over? This can't be undone. Save a copy first if you might need it."}
            </p>
            <div className="pwa-actions">
              <button
                type="button"
                className={`pwa-btn ${pending === 'fresh' ? 'pwa-btn--danger-solid' : 'pwa-btn--primary'}`}
                onClick={confirm}
                disabled={busy}
              >
                {pending === 'previous' ? 'Yes, restore it' : 'Yes, erase and start fresh'}
              </button>
              <button type="button" className="pwa-btn pwa-btn--secondary" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="pwa-actions pwa-actions--more">
            <p className="pwa-note">Still not working after a reload?</p>
            {previous && (
              <button type="button" className="pwa-btn pwa-btn--secondary" onClick={() => setPending('previous')}>
                Restore the last good copy
              </button>
            )}
            <button type="button" className="pwa-btn pwa-btn--danger" onClick={() => setPending('fresh')}>
              Start fresh
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
