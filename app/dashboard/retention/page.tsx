'use client';

import React, { useState } from 'react';
import {
  Calendar,
  Filter,
  Users,
  TrendingUp,
  Info,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AreaChart } from '@/components/charts/AreaChart';
import { RETENTION_COHORTS, getTimeseriesData } from '@/lib/dummy-data';
import { RetentionCohort } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function RetentionPage() {
  const [cohorts, setCohorts] = useState<RetentionCohort[]>(RETENTION_COHORTS);
  const [cohortPeriod, setCohortPeriod] = useState<'weekly' | 'daily' | 'monthly'>('weekly');
  const [retentionMetric, setRetentionMetric] = useState<'any_event' | 'core_action'>('any_event');
  const [hoveredCell, setHoveredCell] = useState<{
    cohortIndex: number;
    weekIndex: number;
    val: number | null;
  } | null>(null);

  const timeseries = getTimeseriesData('30d');
  const retentionCurve = timeseries.map((pt, i) => ({
    date: pt.date,
    label: pt.label,
    value: Math.max(30, Math.round(85 - i * 3.8 + ((i * 3) % 4))),
  }));

  const weekHeaders = ['Week 0', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7'];

  // Helper for heatmap cell color intensity
  const getCellBg = (pct: number | null) => {
    if (pct === null) return 'bg-slate-900/30 text-slate-700';
    if (pct >= 80) return 'bg-indigo-600 text-white font-bold';
    if (pct >= 65) return 'bg-indigo-700/80 text-indigo-100 font-semibold';
    if (pct >= 50) return 'bg-indigo-800/60 text-indigo-200';
    if (pct >= 35) return 'bg-indigo-950/80 text-indigo-300 border border-indigo-900/40';
    return 'bg-slate-800/60 text-slate-400';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Retention Cohort Analysis</h1>
          <p className="mt-1 text-xs text-slate-400">
            Track user return rates over time to measure long-term platform stickiness and product engagement.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2">
          <select
            value={cohortPeriod}
            onChange={(e) => setCohortPeriod(e.target.value as 'weekly' | 'daily' | 'monthly')}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white focus:outline-none"
          >
            <option value="weekly">Cohort: Weekly</option>
            <option value="daily">Cohort: Daily</option>
            <option value="monthly">Cohort: Monthly</option>
          </select>

          <select
            value={retentionMetric}
            onChange={(e) => setRetentionMetric(e.target.value as 'any_event' | 'core_action')}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white focus:outline-none"
          >
            <option value="any_event">Event: Any Ingested Event</option>
            <option value="core_action">Event: Core HRMS Action</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Day 1 Retention</span>
          <div className="text-2xl font-bold text-white mt-1">87.2%</div>
          <div className="text-[11px] text-emerald-400 mt-1 font-semibold">+4.2% vs baseline</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Week 1 Retention</span>
          <div className="text-2xl font-bold text-white mt-1">79.5%</div>
          <div className="text-[11px] text-emerald-400 mt-1 font-semibold">+2.8% vs last month</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Week 4 Retention</span>
          <div className="text-2xl font-bold text-indigo-400 mt-1">52.4%</div>
          <div className="text-[11px] text-slate-400 mt-1">Top quartile benchmark</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Average Cohort Size</span>
          <div className="text-2xl font-bold text-white mt-1">4,635 users</div>
          <div className="text-[11px] text-slate-400 mt-1">8 active weekly cohorts</div>
        </Card>
      </div>

      {/* Retention Curve Chart */}
      <Card className="p-6">
        <CardHeader>
          <div>
            <CardTitle>Cohort Retention Decay Curve</CardTitle>
            <CardDescription>Aggregate retention percentage across 30 days of user activity</CardDescription>
          </div>
          <Badge variant="neutral">Median Cohort</Badge>
        </CardHeader>
        <div className="pt-4">
          <AreaChart
            data={retentionCurve}
            color="#6366f1"
            height={220}
            valueFormatter={(v) => `${v}%`}
          />
        </div>
      </Card>

      {/* Weekly Retention Heatmap Matrix */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Weekly Retention Heatmap</h3>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Darker shade = Higher retention rate</span>
          </div>
        </div>

        {/* Heatmap Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-mono">
              <tr>
                <th className="py-3 px-4 font-semibold font-sans">Cohort Signup Week</th>
                <th className="py-3 px-4 font-semibold text-right">Users</th>
                {weekHeaders.map((hdr) => (
                  <th key={hdr} className="py-3 px-3 font-semibold text-center min-w-[70px]">
                    {hdr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {cohorts.map((cohort, cIdx) => (
                <tr key={cohort.cohortDate} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-sans font-medium text-slate-200 whitespace-nowrap">
                    {cohort.cohortDate}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">
                    {cohort.totalUsers.toLocaleString()}
                  </td>
                  {cohort.periods.map((pct, pIdx) => {
                    const isHovered =
                      hoveredCell?.cohortIndex === cIdx && hoveredCell?.weekIndex === pIdx;

                    return (
                      <td
                        key={pIdx}
                        className="py-1.5 px-1.5 text-center"
                        onMouseEnter={() =>
                          setHoveredCell({ cohortIndex: cIdx, weekIndex: pIdx, val: pct })
                        }
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div
                          className={cn(
                            'py-2 rounded transition-all cursor-pointer text-xs',
                            getCellBg(pct),
                            isHovered ? 'ring-2 ring-white scale-105 z-10 relative' : ''
                          )}
                        >
                          {pct !== null ? `${pct}%` : '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Floating Cell Tooltip / Info */}
        {hoveredCell && hoveredCell.val !== null && (
          <div className="p-3 bg-slate-900/90 border-t border-slate-800 text-xs flex items-center justify-between text-slate-300">
            <div>
              <span className="font-semibold text-white">
                {cohorts[hoveredCell.cohortIndex].cohortDate}
              </span>{' '}
              • Week {hoveredCell.weekIndex}:{' '}
              <span className="font-bold text-indigo-400">{hoveredCell.val}% retained</span> (
              {Math.round(
                (cohorts[hoveredCell.cohortIndex].totalUsers * hoveredCell.val) / 100
              ).toLocaleString()}{' '}
              active users)
            </div>
            <span className="text-[11px] text-slate-400">
              Total Cohort Size: {cohorts[hoveredCell.cohortIndex].totalUsers.toLocaleString()}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

