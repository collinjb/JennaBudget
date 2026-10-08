/** True when running as the installed home-screen app (no Safari address bar). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches
    );
  } catch {
    return false;
  }
}

/** True on iPhone / iPad (iPadOS reports itself as a Mac, so also check for touch). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
}

/**
 * Which "how to install" help to show:
 * - 'installed': already running from the home screen
 * - 'ios-safari': iPhone in Safari → Share → Add to Home Screen
 * - 'ios-other-browser': iPhone in Chrome/Firefox/etc. (newer iOS can add from these too, but Safari is the sure path)
 * - 'other': not an iPhone (e.g. testing on a computer)
 */
export function installContext(): 'installed' | 'ios-safari' | 'ios-other-browser' | 'other' {
  if (isStandalone()) return 'installed';
  if (!isIOS()) return 'other';
  const ua = navigator.userAgent || '';
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua) ? 'ios-other-browser' : 'ios-safari';
}
