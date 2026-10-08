import { beforeEach, describe, expect, it } from 'vitest';
import {
  hashCode,
  isCodeSet,
  isCorrectCode,
  isDeviceUnlocked,
  MAX_TRIES,
  recordWrongCode,
  rememberDevice,
  sha256Hex,
  WAIT_MS,
  waitUntil,
  type AccessConfig,
} from './access';

/** Independent SHA-256 from the platform's Web Crypto (the same digest Node's crypto gives scripts/set-code.mjs). */
async function refSha(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Same algorithm as scripts/set-code.mjs, built on the reference SHA-256. */
async function refHashCode(code: string, salt: string, iterations: number): Promise<string> {
  let h = await refSha(`${salt}:${code}`);
  for (let i = 1; i < iterations; i++) h = await refSha(h + salt);
  return h;
}

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const salt = '0123456789abcdef0123456789abcdef';
const config: AccessConfig = { salt, iterations: 50, hash: hashCode('2468', salt, 50) };

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('sha256Hex', () => {
  it('matches known test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches the platform SHA-256 for many lengths (padding edge cases) and non-ASCII text', async () => {
    for (let n = 0; n < 200; n++) {
      const s = 'x'.repeat(n);
      expect(sha256Hex(s)).toBe(await refSha(s));
    }
    for (const s of ['héllo', '💰 budget', '日本語', 'tab\there']) expect(sha256Hex(s)).toBe(await refSha(s));
  });
});

describe('hashCode', () => {
  it('matches the set-code script exactly', async () => {
    for (const code of ['0000', '1234', '2468', '9999']) {
      expect(hashCode(code, salt, 50)).toBe(await refHashCode(code, salt, 50));
    }
    expect(hashCode('1234', salt, 2_000)).toBe(await refHashCode('1234', salt, 2_000));
  });
});

describe('code check', () => {
  it('accepts only the right code', () => {
    expect(isCorrectCode('2468', config)).toBe(true);
    expect(isCorrectCode('2469', config)).toBe(false);
    expect(isCorrectCode('', config)).toBe(false);
  });

  it('no code set: nothing to check, every device is unlocked', () => {
    const off: AccessConfig = { salt: '', iterations: 10_000, hash: null };
    expect(isCodeSet(off)).toBe(false);
    expect(isCorrectCode('0000', off)).toBe(true);
    expect(isDeviceUnlocked(off)).toBe(true);
  });
});

describe('remembered devices', () => {
  it('a device is remembered after the right code, and asked again when the code changes', () => {
    expect(isDeviceUnlocked(config)).toBe(false);
    rememberDevice(config);
    expect(isDeviceUnlocked(config)).toBe(true);
    const changed: AccessConfig = { ...config, hash: hashCode('1357', salt, 50) };
    expect(isDeviceUnlocked(changed)).toBe(false);
  });

  it('never throws when storage is blocked', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    expect(isDeviceUnlocked(config)).toBe(false);
    expect(() => rememberDevice(config)).not.toThrow();
    expect(() => recordWrongCode(0)).not.toThrow();
    expect(waitUntil(0)).toBe(0);
  });
});

describe('too many wrong codes', () => {
  it(`waits ${WAIT_MS / 1000} s after ${MAX_TRIES} wrong codes, then allows tries again`, () => {
    const t0 = 1_000_000;
    for (let i = 1; i < MAX_TRIES; i++) expect(recordWrongCode(t0 + i)).toBe(0);
    const until = recordWrongCode(t0 + MAX_TRIES);
    expect(until).toBe(t0 + MAX_TRIES + WAIT_MS);
    expect(waitUntil(t0 + MAX_TRIES + 1)).toBe(until);
    expect(waitUntil(until + 1)).toBe(0);
    // A fresh set of tries after the wait.
    expect(recordWrongCode(until + 2)).toBe(0);
  });

  it('the right code clears the count', () => {
    for (let i = 0; i < MAX_TRIES - 1; i++) recordWrongCode(i);
    rememberDevice(config);
    expect(recordWrongCode(10)).toBe(0);
  });
});
