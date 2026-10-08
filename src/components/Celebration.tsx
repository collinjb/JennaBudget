import { useEffect, useRef, type CSSProperties } from 'react';
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

interface CelebrationProps {
  title: string;
  message?: string;
  onDone: () => void;
}

/** "You did it!" moment: a big check plus confetti (just the check with reduced motion). Tap to close. */
export function Celebration({ title, message, onDone }: CelebrationProps) {
  const btn = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useModalLayer(wrap, () => doneRef.current(), btn);
  useEffect(() => {
    const t = window.setTimeout(() => doneRef.current(), 3800);
    return () => window.clearTimeout(t);
  }, []);
  const motion = !prefersReducedMotion();
  return createPortal(
    <div ref={wrap} className="celebrate" role="alert">
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
      <button ref={btn} type="button" className="celebrate__card" onClick={() => onDone()}>
        <span className="celebrate__check" aria-hidden="true">
          <IconCheck size={44} />
        </span>
        <span className="celebrate__title">{title}</span>
        {message && <span className="celebrate__msg">{message}</span>}
        <span className="celebrate__hint">Tap to close</span>
      </button>
    </div>,
    document.body,
  );
}
