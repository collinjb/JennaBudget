// Hand-drawn inline SVG icons (no icon library). All decorative: aria-hidden, the button/label carries the name.
import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
  /** Tab icons: filled when the tab is selected (shape changes too, so it's not color alone). */
  filled?: boolean;
}

function Svg({ size = 24, className, children }: { size?: number; className?: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconHome({ filled, ...p }: IconProps) {
  return (
    <Svg {...p}>
      {filled ? (
        <path
          stroke="none"
          fill="currentColor"
          d="M12 2.55c.37 0 .73.13 1.01.38l7.9 6.9c.68.6.26 1.72-.64 1.72H19.6v8.2c0 .97-.78 1.75-1.75 1.75h-3.6v-5.1a.9.9 0 0 0-.9-.9h-2.7a.9.9 0 0 0-.9.9v5.1h-3.6c-.97 0-1.75-.78-1.75-1.75v-8.2H3.73c-.9 0-1.32-1.12-.64-1.72l7.9-6.9c.28-.25.64-.38 1.01-.38Z"
        />
      ) : (
        <>
          <path d="M3.6 10.6 12 3.4l8.4 7.2" />
          <path d="M5.6 9.2v10.3c0 .6.5 1.1 1.1 1.1h3.6v-5.4h3.4v5.4h3.6c.6 0 1.1-.5 1.1-1.1V9.2" />
        </>
      )}
    </Svg>
  );
}

/** Money In: a banknote. */
export function IconMoneyIn({ filled, ...p }: IconProps) {
  return (
    <Svg {...p}>
      {filled ? (
        <path
          stroke="none"
          fill="currentColor"
          fillRule="evenodd"
          d="M4.6 5.6h14.8a2.6 2.6 0 0 1 2.6 2.6v7.6a2.6 2.6 0 0 1-2.6 2.6H4.6A2.6 2.6 0 0 1 2 15.8V8.2a2.6 2.6 0 0 1 2.6-2.6Zm7.4 3.3a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2ZM5.3 8.4a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm13.4 5.4a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z"
        />
      ) : (
        <>
          <rect x="2.6" y="6.2" width="18.8" height="11.6" rx="2.2" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M5.6 9.4h.01M18.4 14.6h.01" strokeWidth={2.4} />
        </>
      )}
    </Svg>
  );
}

/** Bills: a receipt. */
export function IconBills({ filled, ...p }: IconProps) {
  return (
    <Svg {...p}>
      {filled ? (
        <path
          stroke="none"
          fill="currentColor"
          fillRule="evenodd"
          d="M6.4 2.4h11.2c.77 0 1.4.63 1.4 1.4v17.1c0 .5-.57.79-.97.49l-1.73-1.3-1.9 1.4a.6.6 0 0 1-.71 0L12 20.1l-1.69 1.39a.6.6 0 0 1-.71 0l-1.9-1.4-1.73 1.3a.6.6 0 0 1-.97-.49V3.8c0-.77.63-1.4 1.4-1.4ZM8.8 7.1a.85.85 0 0 0 0 1.7h6.4a.85.85 0 0 0 0-1.7H8.8Zm0 3.8a.85.85 0 0 0 0 1.7h6.4a.85.85 0 0 0 0-1.7H8.8Zm0 3.8a.85.85 0 0 0 0 1.7h3.8a.85.85 0 0 0 0-1.7H8.8Z"
        />
      ) : (
        <>
          <path d="M6 3.2h12v17.4l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5Z" />
          <path d="M9 8h6M9 11.8h6M9 15.6h3.6" />
        </>
      )}
    </Svg>
  );
}

/** Savings & Fun: a piggy bank. */
export function IconSavings({ filled, ...p }: IconProps) {
  const body =
    'M11.6 5.8c2.7 0 5 1.1 6.2 2.9l1.9-.7v3.3l1.3.4v3.1l-1.6.4c-.6 1.3-1.6 2.3-2.9 3V20.6h-2.9v-1.6c-.6.1-1.3.2-2 .2-.6 0-1.2-.1-1.8-.2v1.6H7v-2.3C5.2 17.2 4 15.4 4 13.3c0-4.2 3.4-7.5 7.6-7.5Z';
  return (
    <Svg {...p}>
      {filled ? (
        <>
          <path d={body} fill="currentColor" stroke="currentColor" strokeWidth={1.2} />
          <path d="M4.2 12.4C2.9 12.3 2.2 11.4 2.4 10.3" />
          <path d="M9.6 9.2h3.6" stroke="var(--tab-cutout, #fff)" strokeWidth={1.6} />
          <circle cx="16" cy="11.4" r="1" fill="var(--tab-cutout, #fff)" stroke="none" />
        </>
      ) : (
        <>
          <path d={body} />
          <path d="M4.2 12.4C2.9 12.3 2.2 11.4 2.4 10.3" />
          <path d="M9.6 9.2h3.6" />
          <circle cx="16" cy="11.4" r="0.6" fill="currentColor" stroke="none" />
        </>
      )}
    </Svg>
  );
}

/** Debt: a credit card. */
export function IconDebt({ filled, ...p }: IconProps) {
  return (
    <Svg {...p}>
      {filled ? (
        <path
          stroke="none"
          fill="currentColor"
          fillRule="evenodd"
          d="M4.6 4.6h14.8A2.6 2.6 0 0 1 22 7.2v1.3H2V7.2a2.6 2.6 0 0 1 2.6-2.6ZM2 10.9h20v5.9a2.6 2.6 0 0 1-2.6 2.6H4.6A2.6 2.6 0 0 1 2 16.8v-5.9Zm4 3.5a.9.9 0 0 0 0 1.8h4a.9.9 0 0 0 0-1.8H6Z"
        />
      ) : (
        <>
          <rect x="2.6" y="5.2" width="18.8" height="13.6" rx="2.2" />
          <path d="M2.6 9.6h18.8M6 15.2h4" />
        </>
      )}
    </Svg>
  );
}

// Gear outline, generated once: 8 rounded-ish teeth.
const GEAR_PATH = (() => {
  const teeth = 8;
  const rOut = 9.6;
  const rIn = 7.4;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const w = (Math.PI * 2) / teeth;
    const angles = [a - w * 0.36, a - w * 0.2, a + w * 0.2, a + w * 0.36];
    const radii = [rIn, rOut, rOut, rIn];
    angles.forEach((ang, j) => {
      const x = 12 + radii[j] * Math.cos(ang);
      const y = 12 + radii[j] * Math.sin(ang);
      pts.push(`${pts.length === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
    });
  }
  return pts.join(' ') + 'Z';
})();

export function IconGear(p: IconProps) {
  return (
    <Svg {...p}>
      <path d={GEAR_PATH} />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconChevronRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m9.5 6 6 6-6 6" strokeWidth={2.2} />
    </Svg>
  );
}

export function IconChevronLeft(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" strokeWidth={2.4} />
    </Svg>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" strokeWidth={2.2} />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" strokeWidth={2.4} />
    </Svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" strokeWidth={2.2} />
    </Svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth={2.6} />
    </Svg>
  );
}

export function IconWarning(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.3 4.2 2.9 17.4c-.75 1.33.21 2.98 1.74 2.98h14.72c1.53 0 2.49-1.65 1.74-2.98L13.7 4.2c-.76-1.35-2.64-1.35-3.4 0Z" />
      <path d="M12 9.5v4.2M12 16.9h.01" strokeWidth={2.2} />
    </Svg>
  );
}

export function IconInfo(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6h.01" strokeWidth={2.2} />
    </Svg>
  );
}

export function IconArrowRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5" strokeWidth={2.2} />
    </Svg>
  );
}

export function IconSparkle(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5Z" />
      <path d="M18.5 15.5c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3Z" />
    </Svg>
  );
}

export function IconShare(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 14.5V3.5M8 7.2l4-4 4 4" />
      <path d="M8.5 10.5H6.8c-.9 0-1.6.7-1.6 1.6v7.3c0 .9.7 1.6 1.6 1.6h10.4c.9 0 1.6-.7 1.6-1.6v-7.3c0-.9-.7-1.6-1.6-1.6h-1.7" />
    </Svg>
  );
}

export function IconRestore(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.6 12a7.4 7.4 0 1 0 2.3-5.4" />
      <path d="M4.2 3.6v3.9h3.9" />
      <path d="M12 8.2V12l2.6 1.6" />
    </Svg>
  );
}
