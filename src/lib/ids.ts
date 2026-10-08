/** Unique id for items. crypto.randomUUID only exists in secure contexts, so fall back gracefully. */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const rand = Math.random().toString(36).slice(2, 10);
  return `id-${Date.now().toString(36)}-${rand}`;
}
