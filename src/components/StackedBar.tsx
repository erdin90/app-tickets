'use client';

export default function StackedBar({
  labels,
  a,
  b,
  height = 150,
  colors = ['#60a5fa', '#93c5fd'],
}: {
  labels: string[];
  a: number[]; // serie 1 (ej. creados)
  b: number[]; // serie 2 (ej. cerrados)
  height?: number;
  colors?: [string, string] | string[];
}) {
  const n = Math.min(labels.length, a.length, b.length);
  const data = Array.from({ length: n }, (_, i) => ({ label: labels[i], a: a[i] ?? 0, b: b[i] ?? 0 }));
  const gap = 8;
  const barW = 18;
  const max = Math.max(1, ...data.map(d => d.a + d.b));
  const width = n * barW + (n - 1) * gap;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: Math.max(width, 360), height, display: 'block' }}>
        {data.map((d, i) => {
          const totalH = Math.round(((d.a + d.b) / max) * (height - 24));
          const aH = Math.round((d.a / Math.max(1, d.a + d.b)) * totalH);
          const bH = totalH - aH;
          const x = i * (barW + gap);
          const y = height - totalH - 6;
          return (
            <g key={i}>
              {/* base (serie A) */}
              <rect x={x} y={y} width={barW} height={aH} rx={4} fill={colors[0]} />
              {/* stacked (serie B) */}
              <rect x={x} y={y + aH} width={barW} height={bH} rx={bH ? 4 : 0} fill={colors[1]} />
              <title>{`${d.label}: A=${d.a}, B=${d.b}`}</title>
            </g>
          );
        })}
      </svg>
      {/* leyenda simple */}
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: '#4b5563' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: colors[0], borderRadius: 2 }} /> Creados
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: colors[1], borderRadius: 2 }} /> Cerrados
        </span>
      </div>
    </div>
  );
}
