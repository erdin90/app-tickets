'use client';

export default function DonutChart({
  values,
  labels,
  colors,
  size = 140,
  stroke = 16,
  showCenter = true,
  showPercent = true,
}: {
  values: number[];
  labels?: string[];
  colors?: string[];
  size?: number;
  stroke?: number;
  showCenter?: boolean;
  showPercent?: boolean;
}) {
  const total = Math.max(1, values.reduce((a, b) => a + b, 0));
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segs = values.map((v, i) => {
    const frac = v / total;
    const dash = frac * circumference;
    const seg = (
      <circle
        key={i}
        r={radius}
        cx={cx}
        cy={cy}
        fill="transparent"
        stroke={colors?.[i] ?? 'var(--accent)'}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={-offset}
        style={{ transition: 'stroke-dasharray 300ms ease, stroke-dashoffset 300ms ease' }}
      />
    );
    offset += dash;
    return seg;
  });

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle r={radius} cx={cx} cy={cy} fill="transparent" stroke="#eef2ff" strokeWidth={stroke} />
        {segs}
        {showCenter && (
          <g>
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontWeight={800} fill="var(--fg)">
              {values.reduce((a,b)=>a+b,0)}
            </text>
          </g>
        )}
      </svg>
      {!!labels?.length && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, color: '#4b5563' }}>
          {labels.map((l, i) => {
            const v = values[i] ?? 0;
            const pct = Math.round((v / total) * 100);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: colors?.[i] ?? 'var(--accent)' }} />
                <span>
                  {l} ({v}{showPercent ? ` · ${pct}%` : ''})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
