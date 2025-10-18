'use client';

import React from 'react';

/**
 * Simple responsive area comparison chart (A vs B) optimized for mobile.
 * - Inputs: labels (length N), series a and b (length >= N)
 * - Renders two translucent areas with subtle stroke for readability.
 */
export default function AreaCompare({
  labels,
  a,
  b,
  height = 160,
  colors = ['#3b82f6', '#22c55e'],
}: {
  labels: string[];
  a: number[];
  b: number[];
  height?: number;
  colors?: [string, string] | string[];
}) {
  const n = Math.min(labels.length, a.length, b.length);
  const data = Array.from({ length: n }, (_, i) => ({
    x: i,
    a: a[i] ?? 0,
    b: b[i] ?? 0,
    label: labels[i],
  }));
  const max = Math.max(1, ...data.map(d => Math.max(d.a, d.b)));

  // Layout
  const pad = 8; // inner padding
  const step = 28; // px per point
  const width = (n - 1) * step + pad * 2;
  const h = height;
  const chartH = h - pad * 2;

  const yScale = (v: number) => pad + (chartH - (v / max) * chartH);
  const xScale = (i: number) => pad + i * step;

  const buildPath = (key: 'a' | 'b') => {
    if (data.length === 0) return '';
    const top = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.x)} ${yScale(d[key])}`).join(' ');
    // Close area to bottom
    const lastX = xScale(data[data.length - 1].x);
    const firstX = xScale(data[0].x);
    const bottom = `L ${lastX} ${pad + chartH} L ${firstX} ${pad + chartH} Z`;
    return `${top} ${bottom}`;
  };

  const strokePath = (key: 'a' | 'b') => {
    if (data.length === 0) return '';
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.x)} ${yScale(d[key])}`).join(' ');
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${h}`} style={{ width: Math.max(width, 360), height: h, display: 'block' }}>
        <defs>
          <linearGradient id="ac-a" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={String(colors[0])} stopOpacity={0.35} />
            <stop offset="100%" stopColor={String(colors[0])} stopOpacity={0.06} />
          </linearGradient>
          <linearGradient id="ac-b" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={String(colors[1])} stopOpacity={0.35} />
            <stop offset="100%" stopColor={String(colors[1])} stopOpacity={0.06} />
          </linearGradient>
        </defs>

        {/* gridline baseline */}
        <line x1={pad} x2={width - pad} y1={h - pad} y2={h - pad} stroke="#e5e7eb" strokeOpacity={0.5} />

        {/* filled areas */}
        <path d={buildPath('a')} fill="url(#ac-a)" />
        <path d={buildPath('b')} fill="url(#ac-b)" />

        {/* strokes */}
        <path d={strokePath('a')} fill="none" stroke={String(colors[0])} strokeWidth={2} />
        <path d={strokePath('b')} fill="none" stroke={String(colors[1])} strokeWidth={2} />

        {/* points hover targets (native title tooltips) */}
        {data.map((d) => (
          <g key={d.x}>
            <circle cx={xScale(d.x)} cy={yScale(d.a)} r={3} fill={String(colors[0])}>
              <title>{`${d.label}: Creados ${d.a}`}</title>
            </circle>
            <circle cx={xScale(d.x)} cy={yScale(d.b)} r={3} fill={String(colors[1])}>
              <title>{`${d.label}: Cerrados ${d.b}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      {/* legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: '#4b5563' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: String(colors[0]), borderRadius: 2 }} /> Creados
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: String(colors[1]), borderRadius: 2 }} /> Cerrados
        </span>
      </div>
    </div>
  );
}
