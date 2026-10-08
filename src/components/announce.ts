// One polite live region for short, one-off announcements (e.g. "Please check the highlighted field.").
// It is not role="status" so it never competes with the toast region.

let region: HTMLElement | null = null;
let timer: number | undefined;

/** Say `message` politely to screen readers. Repeating the same message is announced again. */
export function announce(message: string): void {
  if (typeof document === 'undefined') return;
  if (!region || !region.isConnected) {
    region = document.createElement('div');
    region.className = 'sr-only';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }
  const el = region;
  el.textContent = '';
  window.clearTimeout(timer);
  // A short gap so the change is noticed even when the text is the same as last time.
  timer = window.setTimeout(() => (el.textContent = message), 60);
}
