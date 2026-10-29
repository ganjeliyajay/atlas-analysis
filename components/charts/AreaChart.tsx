
'use client';

import React, { useState } from 'react';

export interface AreaChartPoint {
  date: string;
  label: string;
  value: number;
}

interface AreaChartProps {
  data: AreaChartPoint[];
  color?: string;
  height?: number;
  valueFormatter?: (v: number) => string;
}

export function AreaChart({
  data,
  color = '#6366f1',
  height = 240,
  valueFormatter = (v) => v.toLocaleString(),
}: AreaChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Remove invalid values to prevent NaN SVG coordinates
  const safeData = (data ?? []).filter(
    (item) =>
      item &&
      typeof item.value === 'number' &&
      Number.isFinite(item.value)
  );

  if (safeData.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-slate-500"
      >
        No timeseries data available
      </div>
    );
  }

  const values = safeData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  const paddingBottom = 24;
  const paddingTop = 16;
  const paddingLeft = 40;
  const paddingRight = 16;

  const chartHeight = Math.max(height - paddingBottom - paddingTop, 1);
  const chartWidth = 600;

  const range = maxVal - minVal || 1;

  const points = safeData.map((d, i) => {
    // Prevent division by zero when there is only one data point
    const x =
      safeData.length === 1
        ? (paddingLeft + chartWidth - paddingRight) / 2
        : paddingLeft +
          (i / (safeData.length - 1)) *
            (chartWidth - paddingLeft - paddingRight);

    const y =
      paddingTop +
      chartHeight -
      ((d.value - minVal) / range) * chartHeight;

    return {
      x: Number.isFinite(x) ? x : paddingLeft,
      y: Number.isFinite(y) ? y : paddingTop + chartHeight / 2,
      ...d,
    };
  });

  const pathD = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;

    const prev = points[i - 1];
    const cpX = (prev.x + pt.x) / 2;

    return `${acc} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
  }, '');

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  const areaD =
    `${pathD} L ${lastPoint.x} ${paddingTop + chartHeight}` +
    ` L ${firstPoint.x} ${paddingTop + chartHeight} Z`;

  const gridTicks = [0, 0.33, 0.66, 1];

  return (
    <div className="relative w-full select-none" style={{ height }}>
      <svg
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient
            id={`gradient-${color.replace('#', '')}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {gridTicks.map((pct, idx) => {
          const y = paddingTop + chartHeight * (1 - pct);
          const tickVal = Math.round(minVal + range * pct);

          return (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="#1e293b"
                strokeDasharray="3 3"
                strokeWidth="1"
              />

              <text
                x={paddingLeft - 8}
                y={y + 3}
                fill="#64748b"
                fontSize="10"
                textAnchor="end"
                fontFamily="sans-serif"
              >
                {valueFormatter(tickVal)}
              </text>
            </g>
          );
        })}

        {/* Shaded Area */}
        <path
          d={areaD}
          fill={`url(#gradient-${color.replace('#', '')})`}
        />

        {/* Main Line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive hover targets and dots */}
        {points.map((pt, i) => {
          const isHovered = hoverIndex === i;

          return (
            <g key={i}>
              {/* Hover capture circle */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={24}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(i)}
              />

              {/* Data point */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5 : 3}
                fill={isHovered ? '#ffffff' : color}
                stroke={color}
                strokeWidth={isHovered ? 2 : 1}
                className="transition-all duration-150"
              />

              {/* Vertical guideline on hover */}
              {isHovered && (
                <line
                  x1={pt.x}
                  y1={paddingTop}
                  x2={pt.x}
                  y2={paddingTop + chartHeight}
                  stroke="#94a3b8"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
              )}

              {/* Bottom date labels */}
              {(
                i === 0 ||
                i === Math.floor(points.length / 2) ||
                i === points.length - 1
              ) && (
                <text
                  x={pt.x}
                  y={height - 6}
                  fill="#64748b"
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {pt.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          className="pointer-events-none absolute -top-2 z-20 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all"
          style={{
            left:
              points.length === 1
                ? '50%'
                : `${
                    ((points[hoverIndex].x - paddingLeft) /
                      (chartWidth - paddingLeft - paddingRight)) *
                    100
                  }%`,
          }}
        >
          <div className="text-[11px] font-medium text-slate-400">
            {points[hoverIndex].label}
          </div>

          <div className="text-sm font-semibold text-white">
            {valueFormatter(points[hoverIndex].value)}
          </div>
        </div>
      )}
    </div>
  );
}
