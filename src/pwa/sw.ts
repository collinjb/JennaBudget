// Small service-worker helpers shared by the update banner and the error screen. All are no-ops
// (and never throw) where service workers aren't available: dev server, plain http, old browsers.

function swContainer(): ServiceWorkerContainer | null {
  try {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  } catch {
    return null;
  }
}

/** Ask the browser to look for a new version now (quietly ignored offline or without a service worker). */
export async function checkForUpdate(): Promise<void> {
  const sw = swContainer();
  if (!sw || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  try {
    const reg = await sw.getRegistration();
    if (reg && !reg.installing) await reg.update();
  } catch {
    /* offline, or the server is unreachable: try again later */
  }
}

/**
 * Reload the page, switching to a newer version first if one is already downloaded and waiting.
 * This is what "Reload" on the error screen does, so a crash that's fixed in a new version can't
 * keep the user stuck on the old one.
 */
export async function reloadToLatest(): Promise<void> {
  const sw = swContainer();
  try {
    const reg = sw ? await sw.getRegistration() : undefined;
    const waiting = reg?.waiting;
    if (sw && waiting) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 3000);
        sw.addEventListener(
          'controllerchange',
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    }
  } catch {
    /* fall through to a plain reload */
  }
  window.location.reload();
}
