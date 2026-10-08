import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck } from './Icons';
import { prefersReducedMotion, useModalLayer } from './modal';

const COLORS = ['var(--c-savings)', 'var(--c-bills)', 'var(--c-fun)', 'var(--c-debt)', 'var(--c-left)', '#facc15'];

// Deterministic "random" confetti (no Math.random during render).
const PIECES = Array.from({ length: 36 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: Math.round(r(1) * 94),
    delay: Math.round(r(2) * 400),
    duration: 1400 + Math.round(r(3) * 900),
    rotate: Math.round(r(4) * 360),
    drift: Math.round((r(5) - 0.5) * 120),
    color: COLORS[i % COLORS.length],
    w: 6 + Math.round(r(6) * 6),
  };
});

/** Closes on its own after this long, unless someone is using it with a keyboard or has a finger/pointer on it. */
const AUTO_CLOSE_MS = 4000;

interface CelebrationProps {
  title: string;
  /** Short line under the title (decorative emoji should be wrapped in aria-hidden spans). */
  message?: ReactNode;
  onDone: () => void;
}

/**
 * "You did it!" moment: a big check plus confetti (just the check with reduced motion), in a small dialog.
 * Tap anywhere or "Done" to close; focus goes back to where it was.
 */
export function Celebration({ title, message, onDone }: CelebrationProps) {
  const btn = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const msgId = useId();
  const [held, setHeld] = useState(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useModalLayer(wrap, () => doneRef.current(), btn);
  useEffect(() => {
    if (held) return;
    const t = window.setTimeout(() => {
      // Someone tabbing around (keyboard focus ring showing) keeps it open until they choose Done.
      if (btn.current?.matches(':focus-visible')) return;
      doneRef.current();
    }, AUTO_CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [held]);
  const motion = !prefersReducedMotion();
  return createPortal(
    <div
      ref={wrap}
      className="celebrate"
      onClick={() => doneRef.current()}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHeld(true)}
      onTouchStart={() => setHeld(true)}
      onKeyDown={() => setHeld(true)}
    >
      {motion && (
        <div className="celebrate__confetti" aria-hidden="true">
          {PIECES.map((p, i) => (
            <span
              key={i}
              className="confetti"
              style={
                {
                  left: `${p.left}%`,
                  background: p.color,
                  width: p.w,
                  height: p.w * 1.6,
                  animationDelay: `${p.delay}ms`,
                  animationDuration: `${p.duration}ms`,
                  '--rot': `${p.rotate}deg`,
                  '--drift': `${p.drift}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div
        className="celebrate__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? msgId : undefined}
      >
        <span className="celebrate__check" aria-hidden="true">
          <IconCheck size={44} />
        </span>
        <h2 className="celebrate__title" id={titleId}>
          {title}
        </h2>
        {message && (
          <p className="celebrate__msg" id={msgId}>
            {message}
          </p>
        )}
        <button ref={btn} type="button" className="btn btn--primary btn--block celebrate__done">
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
