// Tiny hand-drawn charts. No chart library.

export type Tone = 'bills' | 'debt' | 'savings' | 'fun' | 'left' | 'over';

export interface BarSegment {
  key: string;
  value: number;
  tone: Tone;
}

/**
 * One horizontal stacked bar. Decorative for screen readers when a legend with the same numbers
 * sits next to it (pass `ariaLabel` to make it an image with a summary instead).
 */
export function StackedBar({ segments, ariaLabel }: { segments: BarSegment[]; ariaLabel?: string }) {
  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((a, s) => a + s.value, 0);
  return (
    <div
      className="stackbar"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {total === 0 ? (
        <div className="stackbar__empty" />
      ) : (
        visible.map((s) => (
          <div
            key={s.key}
            className={`stackbar__seg fill-${s.tone}`}
            style={{ flexGrow: s.value, flexBasis: 0 }}
            data-key={s.key}
          />
        ))
      )}
    </div>
  );
}

interface LineChartProps {
  /** Values over time (e.g. total debt balance each month). */
  values: number[];
  /** Accessible summary, e.g. "Your debt goes from $23,450 now to $0 in March 2029." */
  ariaLabel: string;
  /** Formats the top of the y-axis (the highest value in `values`). */
  formatTop: (max: number) => string;
  startLabel: string;
  endLabel: string;
  tone?: Tone;
}

const W = 320;
const H = 140;

/** Simple falling line (with a soft area underneath). Labels are HTML so they never stretch. */
export function LineChart({ values, ariaLabel, formatTop, startLabel, endLabel, tone = 'debt' }: LineChartProps) {
  const pts = downsample(values, 120);
  // Scale and label by the true peak (downsampling can skip it).
  const max = values.reduce((m, v) => Math.max(m, v), 1);
  const n = pts.length;
  const xy = pts.map((v, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * W;
    const y = 6 + (1 - v / max) * (H - 12);
    return [x, y] as const;
  });
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H - 6} L0 ${H - 6} Z`;
  return (
    <figure className="linechart" role="img" aria-label={ariaLabel}>
      <div className="linechart__plot" aria-hidden="true">
        <div className="linechart__main">
          <div className="linechart__canvas">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`linechart__svg tone-${tone}`}>
            <line x1="0" y1={H - 6} x2={W} y2={H - 6} className="linechart__base" />
            <line x1="0" y1={6} x2={W} y2={6} className="linechart__grid" />
            <path d={area} className="linechart__area" />
            <path d={line} className="linechart__line" vectorEffect="non-scaling-stroke" />
          </svg>
          </div>
          <div className="linechart__x">
            <span>{startLabel}</span>
            <span>{endLabel}</span>
          </div>
        </div>
        <div className="linechart__y">
          <span>{formatTop(max)}</span>
          <span>$0</span>
        </div>
      </div>
    </figure>
  );
}

function downsample(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values.length ? values : [0];
  const out: number[] = [];
  const step = (values.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) out.push(values[Math.round(i * step)]);
  return out;
}
