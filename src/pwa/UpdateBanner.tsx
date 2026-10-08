import { Component, useEffect, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './pwa.css';

const HOUR = 60 * 60 * 1000;
/** Coming back to the app repeatedly shouldn't hammer the server. */
const MIN_GAP_BETWEEN_CHECKS = 60 * 1000;
/** If the new version hasn't taken over by then, reload anyway. */
const REFRESH_FALLBACK_MS = 4000;

function UpdateBannerInner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // immediate: register right away instead of waiting for the window "load" event.
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      if (reg) setRegistration(reg);
    },
    onRegisterError() {
      // No service worker (private browsing, http, unsupported). The app still works while online.
    },
  });

  // Look for a new version on startup, whenever the app comes back to the foreground, when the
  // connection returns, and every hour while it stays open.
  useEffect(() => {
    if (!registration) return;
    let lastCheck = 0;
    const check = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine || registration.installing) return;
      const now = Date.now();
      if (now - lastCheck < MIN_GAP_BETWEEN_CHECKS) return;
      lastCheck = now;
      registration.update().catch(() => {
        /* offline or server unreachable: the next check will try again */
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', check);
    const timer = window.setInterval(check, HOUR);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', check);
      window.clearInterval(timer);
    };
  }, [registration]);

  // "Not now" hides the banner for this session only. The waiting version still takes over the next
  // time the app is fully closed and reopened, so nobody gets stuck on an old version.
  if (!needRefresh || dismissed) return null;

  const refresh = () => {
    setRefreshing(true);
    // Tells the waiting service worker to take over; the page reloads when it does.
    void updateServiceWorker(true);
    window.setTimeout(() => window.location.reload(), REFRESH_FALLBACK_MS);
  };

  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <span className="pwa-update__icon" aria-hidden="true">
        ✨
      </span>
      <p className="pwa-update__text">A new version is ready</p>
      <button type="button" className="pwa-btn pwa-btn--primary pwa-update__refresh" onClick={refresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      {!refreshing && (
        <button type="button" className="pwa-update__close" aria-label="Not now" onClick={() => setDismissed(true)}>
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}

/** The banner must never take the app down with it: if it fails, it simply doesn't show. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Registers the service worker and shows "A new version is ready · Refresh" when an update is waiting.
 * Render it once, outside the app's error boundary, so an update can still be applied if the app crashes.
 * Harmless where service workers aren't supported (dev server, http): it renders nothing.
 */
export function UpdateBanner() {
  return (
    <Quiet>
      <UpdateBannerInner />
    </Quiet>
  );
}
