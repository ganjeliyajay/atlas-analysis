'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Activity,
  Layers,
  Clock,
  Eye,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sparkline } from '@/components/charts/Sparkline';
import { AreaChart } from '@/components/charts/AreaChart';
import {
  getKpiMetrics,
  getTimeseriesData,
  TOP_EVENTS_DATA,
  TOP_PAGES_DATA,
  INITIAL_LIVE_EVENTS,
} from '@/lib/dummy-data';
import { DateRangeOption } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function OverviewPage() {
  const [range, setRange] = useState<DateRangeOption>('30d');
  const [activeChartMetric, setActiveChartMetric] = useState<
    'activeUsers' | 'eventVolume' | 'sessions' | 'pageViews'
  >('activeUsers');

  const kpis = getKpiMetrics(range);
  const timeseries = getTimeseriesData(range);

  const chartData = timeseries.map((pt) => ({
    date: pt.date,
    label: pt.label,
    value: pt[activeChartMetric],
  }));

  const metricColors = {
    activeUsers: '#6366f1',
    eventVolume: '#3b82f6',
    sessions: '#10b981',
    pageViews: '#8b5cf6',
  };

  const metricTitles = {
    activeUsers: 'Active Users',
    eventVolume: 'Event Volume',
    sessions: 'Total Sessions',
    pageViews: 'Page Views',
  };

  const kpiIcons = [Users, Activity, Layers, Clock, Eye];

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">HRMS Analytics</span>
            <Badge variant="success">Healthy 99.9%</Badge>
            <Badge variant="outline">Production</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Real-time telemetry ingestion active for workspace &ldquo;Jay&apos;s Workspace&rdquo;. Next-generation session aggregation enabled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/live">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Stream</span>
            </Button>
          </Link>
          <Link href="/dashboard/installation">
            <Button size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Integration SDK</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Date Range Quick Filter Pills */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Executive Telemetry Metrics
        </h2>
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1">
          {(['today', '7d', '30d', '90d'] as DateRangeOption[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                range === r
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {r === 'today' ? 'Today' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpiIcons[idx % kpiIcons.length];
          const isUp = kpi.trend === 'up';

          return (
            <Card
              key={kpi.title}
              className="relative overflow-hidden transition-all duration-150 hover:border-slate-700 hover:shadow-lg"
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-medium text-slate-400">{kpi.title}</span>
                <div className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400">
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {kpi.value}
                </div>
                <div
                  className={cn(
                    'flex items-center gap-0.5 text-xs font-semibold',
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  )}
                >
                  {isUp ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  <span>{isUp ? `+${kpi.change}%` : `${kpi.change}%`}</span>
                </div>
              </div>

              {/* Sparkline & Comparison */}
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/60">
                <div className="text-[10px] text-slate-500">
                  vs {kpi.previousPeriodValue} prev
                </div>
                <Sparkline
                  data={kpi.sparkline}
                  color={isUp ? '#10b981' : '#f43f5e'}
                  width={64}
                  height={20}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Main Interactive Chart Card */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div>
            <CardTitle className="text-base text-white">
              Performance & Volume Trends
            </CardTitle>
            <CardDescription>
              Telemetry aggregated over {range === 'today' ? 'the past 24 hours' : `the last ${range}`}.
            </CardDescription>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
            {(
              ['activeUsers', 'eventVolume', 'sessions', 'pageViews'] as const
            ).map((key) => (
              <button
                key={key}
                onClick={() => setActiveChartMetric(key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  activeChartMetric === key
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {metricTitles[key]}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Area Chart */}
        <div className="pt-6">
          <AreaChart
            data={chartData}
            color={metricColors[activeChartMetric]}
            height={260}
          />
        </div>
      </Card>

      {/* Two Column Grid: Top Events & Top Pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Events */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top Ingested Events</CardTitle>
              <CardDescription>Ranked by volume and percentage of total events</CardDescription>
            </div>
            <Link
              href="/dashboard/events"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
            >
              <span>View all</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>

          <div className="space-y-3 mt-2">
            {TOP_EVENTS_DATA.slice(0, 6).map((evt) => (
              <div
                key={evt.name}
                className="group rounded-lg p-2.5 hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-slate-200 group-hover:text-white">
                      {evt.name}
                    </span>
                    <Badge variant="neutral" className="text-[10px] py-0 px-1.5">
                      {evt.category}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white">
                      {evt.count.toLocaleString()}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-semibold',
                        evt.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'
                      )}
                    >
                      {evt.change}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500/80 transition-all duration-300"
                    style={{ width: `${evt.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Pages */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top Visited Routes</CardTitle>
              <CardDescription>Highest traffic pages across the HRMS portal</CardDescription>
            </div>
            <Link
              href="/dashboard/pages"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
            >
              <span>View all</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 font-medium">Page URL</th>
                  <th className="pb-2.5 font-medium text-right">Views</th>
                  <th className="pb-2.5 font-medium text-right">Bounce</th>
                  <th className="pb-2.5 font-medium text-right">Avg Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {TOP_PAGES_DATA.slice(0, 5).map((page) => (
                  <tr
                    key={page.url}
                    className="hover:bg-slate-800/30 transition-colors group"
                  >
                    <td className="py-2.5 pr-2 font-mono text-slate-300 group-hover:text-white truncate max-w-[180px]">
                      {page.url}
                    </td>
                    <td className="py-2.5 text-right font-medium text-white">
                      {page.views.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right text-slate-400">
                      {page.bounceRate}%
                    </td>
                    <td className="py-2.5 text-right text-slate-400 font-mono">
                      {page.avgTimeOnPage}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Bottom Grid: Recent Live Events Feed Preview & User Demographics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Preview Feed */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <CardTitle>Recent Telemetry Stream</CardTitle>
            </div>
            <Link
              href="/dashboard/live"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              <span>Open live stream</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 font-medium">User Identifier</th>
                  <th className="pb-2 font-medium">Project</th>
                  <th className="pb-2 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {INITIAL_LIVE_EVENTS.slice(0, 5).map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/40">
                    <td className="py-2 text-indigo-300 font-semibold">{evt.name}</td>
                    <td className="py-2 text-slate-300">{evt.userId}</td>
                    <td className="py-2 text-slate-400 font-sans">{evt.project}</td>
                    <td className="py-2 text-right text-slate-500">{evt.relativeTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* User Engagement Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>User Composition</CardTitle>
            <CardDescription>Engagement & retention split</CardDescription>
          </CardHeader>

          <div className="space-y-4 mt-2">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">Returning Users</span>
                <span className="font-semibold text-white">68.4% (33,180)</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: '68.4%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">First-time Visitors</span>
                <span className="font-semibold text-white">31.6% (15,340)</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: '31.6%' }} />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Avg Session Duration:</span>
                <span className="font-medium text-slate-200">6m 22s</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Events per Session:</span>
                <span className="font-medium text-slate-200">13.8</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>SDK Version:</span>
                <span className="font-mono text-indigo-400">@atlas/sdk v2.4.1</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

