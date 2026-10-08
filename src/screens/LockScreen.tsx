import { useEffect, useRef, useState } from 'react';
import { IconDelete } from '../components/Icons';
import { CODE_LENGTH, isCorrectCode, recordWrongCode, rememberDevice, waitUntil } from '../lib/access';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/**
 * Shown once on each new phone or browser: enter the 4-digit code, then the device is remembered and the app opens
 * straight to the budget. Number pad like the iPhone lock screen; a physical keyboard works too.
 */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState('');
  /** Current digits, updated right away so fast typing never loses a digit between renders. */
  const digitsRef = useRef('');
  const setCode = (value: string) => {
    digitsRef.current = value;
    setDigits(value);
  };
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(() => waitUntil());
  const [now, setNow] = useState(() => Date.now());
  const checking = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const blocked = blockedUntil > now;
  const secondsLeft = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Count down while waiting after too many wrong codes.
  useEffect(() => {
    if (!blocked) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [blocked]);

  const check = (code: string) => {
    checking.current = true;
    // Let the last dot show before the (short) check runs.
    window.setTimeout(() => {
      checking.current = false;
      if (isCorrectCode(code)) {
        rememberDevice();
        onUnlock();
        return;
      }
      const until = recordWrongCode();
      setCode('');
      setShake((n) => n + 1);
      setNow(Date.now());
      if (until) {
        setBlockedUntil(until);
        setError('Too many tries. Please wait a moment, then try again.');
      } else {
        setError("That's not the code. Try again.");
      }
    }, 120);
  };

  const press = (key: string) => {
    if (blocked || checking.current) return;
    if (key === 'del') {
      setCode(digitsRef.current.slice(0, -1));
      return;
    }
    if (digitsRef.current.length >= CODE_LENGTH) return;
    const next = digitsRef.current + key;
    setCode(next);
    if (error) setError(null);
    if (next.length === CODE_LENGTH) check(next);
  };
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });

  // A physical keyboard (or a test) can type the code too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === 'Backspace') pressRef.current('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="lock" aria-labelledby="lock-title">
      <div className="lock__top">
        <img className="lock__logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={72} height={72} />
        <h1 className="lock__title" id="lock-title" ref={titleRef} tabIndex={-1}>
          Enter your code
        </h1>
        <p className="lock__lead">You only need it once on this phone.</p>
      </div>

      <div key={shake} className={`lock__dots${shake ? ' lock__dots--shake' : ''}`} aria-hidden="true">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span key={i} className={`lock__dot${i < digits.length ? ' is-filled' : ''}`} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {digits.length} of {CODE_LENGTH} digits entered
      </p>
      <p className="lock__error" role="alert">
        {blocked ? `Too many tries. Try again in ${secondsLeft} seconds.` : error}
      </p>

      <div className="lock__pad" role="group" aria-label="Number pad">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={`gap-${i}`} aria-hidden="true" />
          ) : (
            <button
              key={k}
              type="button"
              className={`lock__key${k === 'del' ? ' lock__key--del' : ''}`}
              onClick={() => press(k)}
              disabled={blocked || (k === 'del' && digits.length === 0)}
              aria-label={k === 'del' ? 'Delete' : k}
            >
              {k === 'del' ? <IconDelete size={28} /> : k}
            </button>
          ),
        )}
      </div>
    </main>
  );
}
