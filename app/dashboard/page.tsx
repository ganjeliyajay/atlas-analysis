'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sparkline } from '@/components/charts/Sparkline';
import { AreaChart } from '@/components/charts/AreaChart';
import { DateRangeOption } from '@/types/analytics';
import { cn } from '@/lib/utils';

type ChartMetric = 'activeUsers' | 'eventVolume' | 'sessions' | 'pageViews';

type DashboardData = {
  range: DateRangeOption;
  kpis: {
    totalEvents: number;
    activeUsers: number;
  };
  changes: {
    totalEvents: number;
    activeUsers: number;
  };
  topEvents: {
    name: string;
    count: number;
    percentage: number;
  }[];
  eventsOverTime: {
    date: string;
    eventVolume: number;
  }[];
  activeUsersOverTime: {
    date: string;
    activeUsers: number;
  }[];
  recentEvents: {
    id: string;
    name: string;
    userId: string | null;
    projectName: string;
    timestamp: string;
    relativeTime: string;
  }[];
};

type KpiCardData = {
  title: string;
  value: string;
  change: number | null;
  trend: 'up' | 'down' | 'neutral';
  previousPeriodValue: string;
  sparkline: number[];
  tracked: boolean;
};

const metricColors: Record<ChartMetric, string> = {
  activeUsers: '#6366f1',
  eventVolume: '#3b82f6',
  sessions: '#10b981',
  pageViews: '#8b5cf6',
};

const metricTitles: Record<ChartMetric, string> = {
  activeUsers: 'Active Users',
  eventVolume: 'Event Volume',
  sessions: 'Total Sessions',
  pageViews: 'Page Views',
};

const kpiIcons = [Activity, Users, Layers, Clock, Eye];

function formatChange(change: number | null) {
  if (change === null) return '—';
  return `${change > 0 ? '+' : ''}${change}%`;
}

export default function OverviewPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');

  const [range, setRange] = useState<DateRangeOption>('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [appliedCustomStartDate, setAppliedCustomStartDate] = useState('');
  const [appliedCustomEndDate, setAppliedCustomEndDate] = useState('');
  const [customDateError, setCustomDateError] = useState('');
  const [activeChartMetric, setActiveChartMetric] =
    useState<ChartMetric>('eventVolume');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter input states
  const [eventNameFilter, setEventNameFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');

  // Applied filter states
  const [appliedEventName, setAppliedEventName] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function fetchDashboard() {
      setIsLoading(true);
      setError(null);

      try {
        const hasCustomRange = Boolean(appliedCustomStartDate && appliedCustomEndDate);
        const params = new URLSearchParams({
          range: hasCustomRange ? 'custom' : range,
        });

        if (hasCustomRange) {
          params.set('startDate', appliedCustomStartDate);
          params.set('endDate', appliedCustomEndDate);
        }

        if (projectId && projectId !== 'All') {
          params.set('projectId', projectId);
        }

        if (appliedEventName) {
          params.set('eventName', appliedEventName);
        }

        if (appliedUserId) {
          params.set('userId', appliedUserId);
        }

        const response = await fetch(`/api/dashboard?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            body?.error || `Unable to load dashboard (HTTP ${response.status})`,
          );
        }

        const data = (await response.json()) as DashboardData;
        setDashboardData(data);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchDashboard();

    return () => controller.abort();
  }, [range, projectId, appliedEventName, appliedUserId, appliedCustomStartDate, appliedCustomEndDate]);

  const totalEvents = dashboardData?.kpis.totalEvents ?? 0;
  const activeUsers = dashboardData?.kpis.activeUsers ?? 0;
  const totalEventsChange = dashboardData?.changes.totalEvents ?? 0;
  const activeUsersChange = dashboardData?.changes.activeUsers ?? 0;

  const kpis: KpiCardData[] = [
    {
      title: 'Total Events',
      value: isLoading && !dashboardData ? '—' : totalEvents.toLocaleString(),
      change: dashboardData ? totalEventsChange : null,
      trend:
        totalEventsChange > 0
          ? 'up'
          : totalEventsChange < 0
            ? 'down'
            : 'neutral',
      previousPeriodValue: 'vs previous period',
      sparkline: [],
      tracked: true,
    },
    {
      title: 'Active Users',
      value: isLoading && !dashboardData ? '—' : activeUsers.toLocaleString(),
      change: dashboardData ? activeUsersChange : null,
      trend:
        activeUsersChange > 0
          ? 'up'
          : activeUsersChange < 0
            ? 'down'
            : 'neutral',
      previousPeriodValue: 'vs previous period',
      sparkline: [],
      tracked: true,
    },
    {
      title: 'Total Sessions',
      value: 'Not tracked',
      change: null,
      trend: 'neutral',
      previousPeriodValue: 'SDK support required',
      sparkline: [],
      tracked: false,
    },
    {
      title: 'Page Views',
      value: 'Not tracked',
      change: null,
      trend: 'neutral',
      previousPeriodValue: 'SDK support required',
      sparkline: [],
      tracked: false,
    },
    {
      title: 'Total Events',
      value: isLoading && !dashboardData ? '—' : totalEvents.toLocaleString(),
      change: dashboardData ? totalEventsChange : null,
      trend:
        totalEventsChange > 0
          ? 'up'
          : totalEventsChange < 0
            ? 'down'
            : 'neutral',
      previousPeriodValue: 'vs previous period',
      sparkline: [],
      tracked: true,
    },
  ];

  const chartData =
    dashboardData?.eventsOverTime.map((point) => {
      const activeUsersPoint = dashboardData.activeUsersOverTime.find(
        (userPoint) => userPoint.date === point.date,
      );

      return {
        date: point.date,
        label: new Date(`${point.date}T00:00:00`).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        }),
        value:
          activeChartMetric === 'activeUsers'
            ? activeUsersPoint?.activeUsers ?? 0
            : point.eventVolume,
      };
    }) ?? [];

  const unsupportedMetric =
    activeChartMetric === 'sessions' || activeChartMetric === 'pageViews';

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300"
        >
          {error}
        </div>
      )}

      {isLoading && (
        <div
          role="status"
          className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-400"
        >
          Loading analytics...
        </div>
      )}

      {/* Welcome banner */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:flex-row sm:items-center sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">
              ATLAS Analytics
            </span>
            <Badge variant="outline">Analytics dashboard</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Analytics from events received by your organization&apos;s projects.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/live">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
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

      {/* Date range filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Executive Telemetry Metrics
        </h2>

        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1">
          {(['today', '7d', '30d', '90d'] as DateRangeOption[]).map(
            (option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setAppliedCustomStartDate('');
                  setAppliedCustomEndDate('');
                  setCustomDateError('');
                  setRange(option);
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  range === option
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {option === 'today' ? 'Today' : option.toUpperCase()}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Custom date range */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-100">Custom Date Range</h3>
          <p className="mt-1 text-xs text-slate-400">Choose a start and end date to view analytics for a specific period.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="customStartDate" className="mb-1.5 block text-xs font-medium text-slate-400">Start Date</label>
            <input id="customStartDate" type="date" value={customStartDate} max={customEndDate || undefined}
              onChange={(e) => { setCustomStartDate(e.target.value); setCustomDateError(''); }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label htmlFor="customEndDate" className="mb-1.5 block text-xs font-medium text-slate-400">End Date</label>
            <input id="customEndDate" type="date" value={customEndDate} min={customStartDate || undefined}
              onChange={(e) => { setCustomEndDate(e.target.value); setCustomDateError(''); }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => {
              if (!customStartDate || !customEndDate) {
                setCustomDateError('Please select both a start date and an end date.');
                return;
              }
              if (customStartDate > customEndDate) {
                setCustomDateError('Start date must be on or before the end date.');
                return;
              }
              setCustomDateError('');
              setAppliedCustomStartDate(customStartDate);
              setAppliedCustomEndDate(customEndDate);
            }}>Apply Range</Button>
            <Button variant="secondary" onClick={() => {
              setCustomStartDate('');
              setCustomEndDate('');
              setAppliedCustomStartDate('');
              setAppliedCustomEndDate('');
              setCustomDateError('');
              setRange('30d');
            }}>Clear</Button>
          </div>
        </div>
        {customDateError && <p role="alert" className="mt-2 text-xs text-rose-400">{customDateError}</p>}
        {appliedCustomStartDate && appliedCustomEndDate && (
          <p className="mt-3 text-xs text-indigo-300">Active range: {appliedCustomStartDate} – {appliedCustomEndDate}</p>
        )}
      </div>

      {/* Dashboard filters */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Dashboard Filters
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Filter analytics by event name or user ID.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="eventNameFilter"
              className="mb-2 block text-xs font-medium text-slate-400"
            >
              Event Name
            </label>
            <input
              id="eventNameFilter"
              type="text"
              value={eventNameFilter}
              onChange={(e) => setEventNameFilter(e.target.value)}
              placeholder="e.g. button_clicked"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="userIdFilter"
              className="mb-2 block text-xs font-medium text-slate-400"
            >
              User ID
            </label>
            <input
              id="userIdFilter"
              type="text"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              placeholder="Enter user ID"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setAppliedEventName(eventNameFilter.trim());
              setAppliedUserId(userIdFilter.trim());
            }}
          >
            Apply Filters
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setEventNameFilter('');
              setUserIdFilter('');
              setAppliedEventName('');
              setAppliedUserId('');
            }}
          >
            Clear Filters
          </Button>
        </div>

        {(appliedEventName || appliedUserId) && (
          <div className="mt-3 text-xs text-slate-400">
            Active filters:
            {appliedEventName && (
              <span className="ml-2 text-indigo-300">
                Event: {appliedEventName}
              </span>
            )}
            {appliedUserId && (
              <span className="ml-2 text-indigo-300">
                User: {appliedUserId}
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 sm:gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpiIcons[index % kpiIcons.length] ?? Activity;
          const isUp = kpi.trend === 'up';
          const isDown = kpi.trend === 'down';

          return (
            <Card
              key={`${kpi.title}-${index}`}
              className="relative overflow-hidden transition-all duration-150 hover:border-slate-700 hover:shadow-lg"
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-medium text-slate-400">
                  {kpi.title}
                </span>
                <div className="rounded-lg bg-slate-800/80 p-1.5 text-slate-400">
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="mt-1 flex items-baseline justify-between gap-2">
                <div className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {kpi.value}
                </div>

                {kpi.change !== null && (
                  <div
                    className={cn(
                      'flex items-center gap-0.5 text-xs font-semibold',
                      isUp
                        ? 'text-emerald-400'
                        : isDown
                          ? 'text-rose-400'
                          : 'text-slate-400',
                    )}
                  >
                    {isUp ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : isDown ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : null}
                    <span>{formatChange(kpi.change)}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-800/60 pt-2">
                <div className="text-[10px] text-slate-500">
                  {kpi.previousPeriodValue}
                </div>
                {kpi.tracked ? (
                  <Sparkline
                    data={kpi.sparkline}
                    color={isDown ? '#f43f5e' : '#10b981'}
                    width={64}
                    height={20}
                  />
                ) : (
                  <span className="text-[10px] text-slate-500">
                    Not available
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Main chart */}
      <Card className="p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-800/80 pb-6 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="text-base text-white">
              Performance &amp; Volume Trends
            </CardTitle>
            <CardDescription>
              Telemetry aggregated over{' '}
              {appliedCustomStartDate && appliedCustomEndDate
                ? `${appliedCustomStartDate} to ${appliedCustomEndDate}`
                : range === 'today' ? 'the past 24 hours' : `the last ${range}`}.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
            {(
              ['activeUsers', 'eventVolume', 'sessions', 'pageViews'] as ChartMetric[]
            ).map((metric) => (
              <button
                key={metric}
                type="button"
                onClick={() => setActiveChartMetric(metric)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  activeChartMetric === metric
                    ? 'border border-slate-700/80 bg-slate-800 font-semibold text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {metricTitles[metric]}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-6">
          {unsupportedMetric ? (
            <div className="flex h-[260px] items-center justify-center text-center text-sm text-slate-400">
              This metric is not available yet. Event tracking support is required.
            </div>
          ) : isLoading ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
              Loading chart data...
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
              No events received for this period.
            </div>
          ) : (
            <AreaChart
              data={chartData}
              color={metricColors[activeChartMetric]}
              height={260}
            />
          )}
        </div>
      </Card>

      {/* Top events and top pages */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top Ingested Events</CardTitle>
              <CardDescription>
                Ranked by volume and percentage of total events
              </CardDescription>
            </div>
            <Link
              href="/dashboard/events"
              className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              <span>View all</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>

          <div className="mt-2 space-y-3">
            {(dashboardData?.topEvents ?? []).slice(0, 6).map((event) => (
              <div
                key={event.name}
                className="group rounded-lg p-2.5 transition-colors hover:bg-slate-800/40"
              >
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-mono font-medium text-slate-200 group-hover:text-white">
                    {event.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold text-white">
                      {(event.count ?? 0).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {event.percentage}%
                    </span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-indigo-500/80 transition-all duration-300"
                    style={{ width: `${event.percentage}%` }}
                  />
                </div>
              </div>
            ))}

            {!isLoading && (dashboardData?.topEvents.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">
                No events received for this period.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top Visited Routes</CardTitle>
              <CardDescription>
                Page views will appear when page-view tracking is implemented.
              </CardDescription>
            </div>
            <Link
              href="/dashboard/pages"
              className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              <span>View all</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 font-medium">Page URL</th>
                  <th className="pb-2.5 text-right font-medium">Views</th>
                  <th className="pb-2.5 text-right font-medium">Bounce</th>
                  <th className="pb-2.5 text-right font-medium">Avg Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 text-center text-sm text-slate-500"
                  >
                    Page analytics are not tracked yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Recent events and engagement */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <CardTitle>Recent Telemetry Stream</CardTitle>
            </div>
            <Link
              href="/dashboard/live"
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              <span>Open live stream</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 font-medium">User Identifier</th>
                  <th className="pb-2 font-medium">Project</th>
                  <th className="pb-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(dashboardData?.recentEvents ?? []).slice(0, 5).map((event) => (
                  <tr key={event.id} className="hover:bg-slate-800/40">
                    <td className="py-2 font-semibold text-indigo-300">
                      {event.name}
                    </td>
                    <td className="py-2 text-slate-300">
                      {event.userId ?? 'Anonymous'}
                    </td>
                    <td className="py-2 font-sans text-slate-400">
                      {event.projectName}
                    </td>
                    <td className="py-2 text-right text-slate-500">
                      {event.relativeTime}
                    </td>
                  </tr>
                ))}

                {!isLoading &&
                  (dashboardData?.recentEvents.length ?? 0) === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center font-sans text-sm text-slate-500"
                      >
                        No events received yet.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>User Composition</CardTitle>
            <CardDescription>
              Engagement and retention metrics
            </CardDescription>
          </CardHeader>

          <div className="mt-2 space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-300">Active identified users</span>
                <span className="font-semibold text-white">
                  {activeUsers.toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Users with a non-null userId and at least one event in the selected
                period. Anonymous users are not included.
              </p>
            </div>

            <div className="border-t border-slate-800/80 pt-3 text-xs">
              <div className="flex justify-between gap-2 text-slate-400">
                <span>Returning users:</span>
                <span className="font-medium text-slate-200">Not tracked</span>
              </div>
              <div className="mt-2 flex justify-between gap-2 text-slate-400">
                <span>Avg session duration:</span>
                <span className="font-medium text-slate-200">Not tracked</span>
              </div>
              <div className="mt-2 flex justify-between gap-2 text-slate-400">
                <span>Events per session:</span>
                <span className="font-medium text-slate-200">Not tracked</span>
              </div>
              <div className="mt-2 flex justify-between gap-2 text-slate-400">
                <span>SDK version:</span>
                <span className="font-mono text-indigo-400">Not available</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}