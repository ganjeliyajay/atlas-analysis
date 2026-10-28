'use client';

import React, { useState } from 'react';

interface BarChartItem {
  label: string;
  value: number;
  secondary?: string;
}

interface BarChartProps {
  data: BarChartItem[];
  color?: string;
  height?: number;
  valueFormatter?: (v: number) => string;
}

export function BarChart({
  data,
  color = '#6366f1',
  height = 200,
  valueFormatter = (v) => v.toLocaleString(),
}: BarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex h-full flex-col justify-end gap-2 pt-4" style={{ height }}>
      <div className="flex flex-1 items-end gap-3 px-2">
        {data.map((item, idx) => {
          const heightPct = Math.max(8, (item.value / maxVal) * 100);
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={idx}
              className="group relative flex flex-1 flex-col items-center justify-end h-full cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="pointer-events-none absolute -top-10 z-20 whitespace-nowrap rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white shadow-lg">
                  <span className="font-semibold">{item.label}:</span>{' '}
                  {valueFormatter(item.value)}
                </div>
              )}

              {/* Bar */}
              <div
                className="w-full rounded-t transition-all duration-200"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: isHovered ? '#818cf8' : color,
                }}
              />
              <span className="mt-2 block truncate text-[11px] text-slate-400 group-hover:text-slate-200">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

