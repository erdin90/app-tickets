'use client';

export default function BarChart({
  data,
  labels,
  height = 120,
  colors,
  showValues = false,
}: {
  data: number[];
  labels?: string[];
  height?: number;
  colors?: string[]; // optional per-bar colors
  showValues?: boolean;
}) {
  const gap = 6;
  const barW = 14;
  const max = Math.max(1, ...data);
  const width = data.length * barW + (data.length - 1) * gap;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        role="img"
        aria-label="chart"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: Math.max(width, 360),
          height,
          display: 'block',
        }}
      >
        {/* baseline */}
        <line x1={0} x2={width} y1={height - 2} y2={height - 2} stroke="#e5e7eb" strokeOpacity={0.6} />
        {data.map((v, i) => {
          const h = Math.round((v / max) * (height - 18));
          const x = i * (barW + gap);
          const y = height - h - 6;
          const fill = colors?.[i] ?? 'var(--accent)';
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} rx={5} fill={fill} />
              {showValues && h > 14 && (
                <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={11} fill="#334155">{v}</text>
              )}
              <title>{`${labels?.[i] ?? i + 1}: ${v}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
