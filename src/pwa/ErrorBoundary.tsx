import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
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

function CrashScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <main className="pwa-screen" role="alert">
      <div className="pwa-screen__inner pwa-screen__inner--center">
        <div className="pwa-hero" aria-hidden="true">
          😕
        </div>
        <h1 className="pwa-title">Something went wrong.</h1>
        <p className="pwa-text">
          Your data is safe. It's still saved on this phone. Reloading the app usually fixes this.
        </p>
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
      </div>
    </main>
  );
}
