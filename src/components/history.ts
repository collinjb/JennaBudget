// Browser history helpers for things layered over a screen (pages, sheets, dialogs), so iOS swipe-back and the
// browser Back button close the top-most thing instead of leaving the app.

let silentPops = 0;
let silentNow = false;

if (typeof window !== 'undefined') {
  // Capture phase on window: runs before every other popstate listener, so they can ask isSilentPop().
  window.addEventListener(
    'popstate',
    () => {
      if (silentPops <= 0) return;
      silentPops--;
      silentNow = true;
      window.setTimeout(() => (silentNow = false), 0);
    },
    true,
  );
}

/** Go back one entry because the app itself closed something (listeners can tell via isSilentPop()). */
export function silentBack(): void {
  silentPops++;
  // If the browser never fires popstate (nothing to go back to), don't swallow a later real Back.
  window.setTimeout(() => (silentPops = Math.max(0, silentPops - 1)), 1500);
  window.history.back();
}

/**
 * silentBack(), then run `then` once the browser has really gone back (or shortly after, if it never does). Use it when
 * the next step may navigate again: two back() calls in a row can collapse into one.
 */
export function silentBackThen(then: () => void): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', finish);
    window.clearTimeout(timer);
    then();
  };
  window.addEventListener('popstate', finish);
  const timer = window.setTimeout(finish, 400);
  silentBack();
}

/** True inside popstate listeners when the pop came from silentBack(), not from the person pressing Back. */
export function isSilentPop(): boolean {
  return silentNow;
}

/** The current history.state as a plain object (never null). */
export function historyState(): Record<string, unknown> {
  const s: unknown = window.history.state;
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
}
