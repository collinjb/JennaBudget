import accessConfig from '../access.json';

// The 4-digit access code. Each new phone or browser has to enter it once; after that the device is remembered.
// Only a salted, repeatedly-hashed version of the code ships with the app (set with `npm run set-code`).
// This keeps casual visitors out. It isn't strong security (a static site can't have that), and the budget itself
// never leaves the phone either way.

export interface AccessConfig {
  salt: string;
  iterations: number;
  /** null = no code set, so the app opens without asking. */
  hash: string | null;
}

export const ACCESS: AccessConfig = accessConfig as AccessConfig;
export const CODE_LENGTH = 4;
/** Wrong codes allowed before a short wait. */
export const MAX_TRIES = 5;
export const WAIT_MS = 30_000;

const DEVICE_KEY = 'budget.device';
const TRIES_KEY = 'budget.codeTries';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/**
 * SHA-256 of a string's UTF-8 bytes, as lowercase hex. Plain JavaScript on purpose: the browser's built-in crypto
 * only exists on https pages, and the code check must also work on the http test copy on the home network.
 */
export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len << 3) >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/**
 * The stored form of a code: sha256("salt:code"), then re-hashed with the salt `iterations - 1` more times.
 * `scripts/set-code.mjs` computes exactly the same thing with Node's crypto.
 */
export function hashCode(code: string, salt: string, iterations: number): string {
  let h = sha256Hex(`${salt}:${code}`);
  for (let i = 1; i < iterations; i++) h = sha256Hex(h + salt);
  return h;
}

export function isCodeSet(config: AccessConfig = ACCESS): boolean {
  return typeof config.hash === 'string' && config.hash.length > 0;
}

export function isCorrectCode(code: string, config: AccessConfig = ACCESS): boolean {
  if (!isCodeSet(config)) return true;
  return hashCode(code, config.salt, config.iterations) === config.hash;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** This device already entered the current code (a new code asks every device again). */
export function isDeviceUnlocked(config: AccessConfig = ACCESS): boolean {
  if (!isCodeSet(config)) return true;
  try {
    return storage()?.getItem(DEVICE_KEY) === config.hash;
  } catch {
    return false;
  }
}

export function rememberDevice(config: AccessConfig = ACCESS): void {
  try {
    if (config.hash) storage()?.setItem(DEVICE_KEY, config.hash);
    storage()?.removeItem(TRIES_KEY);
  } catch {
    /* private mode: they'll just be asked again next time */
  }
}

interface Tries {
  count: number;
  until: number;
}

function readTries(): Tries {
  try {
    const raw = storage()?.getItem(TRIES_KEY);
    const t = raw ? (JSON.parse(raw) as Partial<Tries>) : {};
    return { count: Number(t.count) || 0, until: Number(t.until) || 0 };
  } catch {
    return { count: 0, until: 0 };
  }
}

/** When the short wait after too many wrong codes ends (ms timestamp), or 0 if there's no wait. */
export function waitUntil(now: number = Date.now()): number {
  const { until } = readTries();
  return until > now ? until : 0;
}

/** Count a wrong code. Returns the end of the wait if this one used up the tries, else 0. */
export function recordWrongCode(now: number = Date.now()): number {
  const t = readTries();
  const count = t.until > now ? t.count : t.count + 1;
  const next: Tries = count >= MAX_TRIES ? { count: 0, until: now + WAIT_MS } : { count, until: 0 };
  try {
    storage()?.setItem(TRIES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next.until;
}
