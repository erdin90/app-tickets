'use client';

import React from 'react';

/**
 * Horizontal bar chart that adapts well to mobile screens.
 * Shows categories vertically with bars growing to the right.
 */
export default function HBarChart({
  data,
  labels,
  height = undefined,
  barHeight = 18,
  gap = 8,
  colors = ['#2563eb'],
  showValues = true,
}: {
  data: number[];
  labels?: string[];
  height?: number;
  barHeight?: number;
  gap?: number;
  colors?: string[]; // can be one color or per-bar color
  showValues?: boolean;
}) {
  const n = data.length;
  const h = height ?? n * (barHeight + gap) + gap;
  const max = Math.max(1, ...data);
  const leftPad = 6; // small padding; labels rendered outside svg
  const width = 300; // viewBox width; scaled by container width

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <svg
          role="img"
          aria-label="hbar-chart"
          viewBox={`0 0 ${width} ${h}`}
          style={{ width: '100%', height: h, display: 'block' }}
        >
          {/* baseline grid */}
          <line x1={leftPad} x2={width - 4} y1={h - 2} y2={h - 2} stroke="#e5e7eb" strokeOpacity={0.6} />
          {data.map((v, i) => {
            const y = i * (barHeight + gap) + gap / 2;
            const w = Math.max(2, Math.round((v / max) * (width - leftPad - 10)));
            const fill = colors[i] ?? colors[0] ?? '#2563eb';
            return (
              <g key={i}>
                <rect
                  x={leftPad}
                  y={y}
                  width={w}
                  height={barHeight}
                  rx={6}
                  fill={fill}
                  opacity={0.9}
                />
                <title>{`${labels?.[i] ?? ''}: ${v}`}</title>
              </g>
            );
          })}
        </svg>
        {/* values column */}
        <div style={{ display: 'grid', alignContent: 'start', gap: gap, paddingTop: gap / 2 }}>
          {data.map((v, i) => (
            <div key={i} style={{ height: barHeight, display: 'flex', alignItems: 'center', gap: 8 }}>
              {showValues && (
                <span style={{ fontSize: 12, color: '#334155', minWidth: 22, textAlign: 'right' }}>{v}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* labels under chart for better wrapping on mobile */}
      {labels && (
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {labels.map((l, i) => {
            const fill = colors[i] ?? colors[0] ?? '#2563eb';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                <span style={{ width: 10, height: 10, background: fill, borderRadius: 2 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
