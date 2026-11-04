'use client';

import { useEffect, useState } from 'react';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,

} from 'recharts';

import { useParams } from 'next/navigation';
import Link from 'next/link';

import {
  ArrowLeft,
  Activity,
  Users,
  Zap,
  Download,
  FileJson,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  CalendarDays,
  UserRound,
  CalendarClock,
  BarChart3,
  Clock,
  MousePointerClick,
} from 'lucide-react';

type AnalyticsRange = 'today' | '7d' | '30d' | '90d';

type ActivityStatus = 'inactive' | 'low' | 'active';

interface ProjectAnalytics {
  project: {
    id: string;
    name: string;
    slug: string;
    platform: string;
    environment: string;
  };

  range: AnalyticsRange;
  filters: {
    eventName: string | null;
    userId: string | null;
  };

  kpis: {
    totalEvents: number;
    activeUsers: number;
    eventsPerUser: number;
    averageEventsPerDay: number;
    projectActivityStatus: ActivityStatus;
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

  recentEvents: {
    id: string;
    name: string;
    userId: string | null;
    timestamp: string;
    relativeTime: string;
  }[];
}

const rangeOptions: {
  label: string;
  value: AnalyticsRange;
}[] = [
    { label: 'Today', value: 'today' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
  ];

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ProjectAnalyticsPage() {
  const params = useParams();

  const projectId = params.projectId as string;

  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [eventNameInput, setEventNameInput] = useState("");
  const [userIdInput, setUserIdInput] = useState("");

  const [appliedEventName, setAppliedEventName] = useState("");
  const [appliedUserId, setAppliedUserId] = useState("");

  const [analytics, setAnalytics] =
    useState<ProjectAnalytics | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const handleRefresh = () => {
    setLoading(true);
    setReloadTrigger((r) => r + 1);
  };

  const handleExport = async (format: "csv" | "json") => {
    try {
      const queryParams = new URLSearchParams({
        range,
        format,
      });

      if (appliedEventName.trim()) {
        queryParams.set("eventName", appliedEventName.trim());
      }

      if (appliedUserId.trim()) {
        queryParams.set("userId", appliedUserId.trim());
      }

      const response = await fetch(
        `/api/projects/${projectId}/analytics/export?${queryParams.toString()}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to export analytics");
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;

      const extension = format === "csv" ? "csv" : "json";

      link.download = `project-analytics-${range}.${extension}`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Analytics export error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to export analytics",
      );
    }
  };

  useEffect(() => {
    let ignore = false;

    async function fetchAnalytics() {
      try {
        const queryParams = new URLSearchParams({ range });
        if (appliedEventName.trim()) {
          queryParams.set("eventName", appliedEventName.trim());
        }

        if (appliedUserId.trim()) {
          queryParams.set("userId", appliedUserId.trim());
        }

        const response = await fetch(
          `/api/projects/${projectId}/analytics?${queryParams.toString()}`,
          {
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (ignore) return;

        if (!response.ok) {
          throw new Error(
            data.error || 'Failed to fetch project analytics',
          );
        }

        setAnalytics(data);
      } catch (err) {
        if (ignore) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to fetch project analytics',
        );
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void fetchAnalytics();

    return () => {
      ignore = true;
    };
  }, [projectId, range, appliedEventName, appliedUserId, reloadTrigger]);

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <Link
        href="/dashboard/projects"
        className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Projects
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
              <Activity className="h-5 w-5 text-indigo-400" />
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                {analytics?.project.name || 'Project Analytics'}
              </h1>

              <p className="mt-1 text-xs text-slate-400">
                Project performance and event telemetry
              </p>
            </div>
          </div>
        </div>
        {/* Analytics Filters */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">
              Analytics Filters
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Filter project analytics by event name or user ID.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* Event Name */}
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
                value={eventNameInput}
                onChange={(e) => setEventNameInput(e.target.value)}
                placeholder="e.g. page_view"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
              />
            </div>

            {/* User ID */}
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
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                placeholder="Enter user ID"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
              />
            </div>

            {/* Actions */}
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAppliedEventName(eventNameInput.trim());
                  setAppliedUserId(userIdInput.trim());
                }}
                disabled={loading}
                className="rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                Apply Filters
              </button>

              <button
                type="button"
                onClick={() => {
                  setEventNameInput("");
                  setUserIdInput("");
                  setAppliedEventName("");
                  setAppliedUserId("");
                }}
                disabled={loading}
                className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>

          {(appliedEventName || appliedUserId) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">
                Active filters:
              </span>

              {appliedEventName && (
                <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-300">
                  Event: {appliedEventName}
                </span>
              )}

              {appliedUserId && (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                  User: {appliedUserId}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Range Selector */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />

            <select
              value={range}
              onChange={(e) =>
                setRange(e.target.value as AnalyticsRange)
              }
              className="bg-transparent text-xs text-white outline-none"
            >
              {rangeOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-slate-900"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={loading || !analytics}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>

          {/* Export JSON */}
          <button
            type="button"
            onClick={() => handleExport("json")}
            disabled={loading || !analytics}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-50"
          >
            <FileJson className="h-3.5 w-3.5" />
            Export JSON
          </button>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''
                }`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && !analytics && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 py-16 text-center text-sm text-slate-400">
          Loading project analytics...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-sm font-medium text-rose-400">
            Failed to load analytics
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {error}
          </p>

          <button
            onClick={handleRefresh}
            className="mt-3 text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            Try again
          </button>
        </div>
      )}

      {/* Project Overview KPI Cards */}
      {analytics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Total Events"
            value={analytics.kpis.totalEvents}
            change={analytics.changes.totalEvents}
            icon={<Zap className="h-5 w-5" />}
          />

          <KpiCard
            title="Active Users"
            value={analytics.kpis.activeUsers}
            change={analytics.changes.activeUsers}
            icon={<Users className="h-5 w-5" />}
          />

          <MetricCard
            title="Events Per User"
            value={analytics.kpis.eventsPerUser}
            icon={<UserRound className="h-5 w-5" />}
          />

          <MetricCard
            title="Average Events Per Day"
            value={analytics.kpis.averageEventsPerDay}
            icon={<CalendarClock className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Project Activity Status */}
      {analytics && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-indigo-400" />

            <div>
              <p className="text-sm font-medium text-white">
                Project Activity Status
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Based on event volume in the selected period
              </p>
            </div>
          </div>

          <ActivityStatusBadge
            status={analytics.kpis.projectActivityStatus}
          />
        </div>
      )}

      {/* Events Over Time */}
      {analytics && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-white">
              Events Over Time
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Daily event volume for the selected period
            </p>
          </div>

          {analytics.eventsOverTime.length === 0 ? (
            <EmptyState message="No events recorded for this period." />
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={analytics.eventsOverTime}
                  margin={{
                    top: 10,
                    right: 10,
                    left: -15,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="eventVolumeGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#818cf8"
                        stopOpacity={0.4}
                      />

                      <stop
                        offset="100%"
                        stopColor="#818cf8"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{
                      fill: '#94a3b8',
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={25}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fill: '#94a3b8',
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    labelStyle={{
                      color: '#cbd5e1',
                      fontSize: 12,
                    }}
                    itemStyle={{
                      color: '#818cf8',
                      fontSize: 12,
                    }}
                    labelFormatter={(label) =>
                      typeof label === 'string'
                        ? formatDate(label)
                        : ''
                    }
                    formatter={(value) => [
                      formatNumber(Number(value)),
                      'Events',
                    ]}
                  />

                  <Area
                    type="monotone"
                    dataKey="eventVolume"
                    stroke="#818cf8"
                    strokeWidth={2.5}
                    fill="url(#eventVolumeGradient)"
                    activeDot={{
                      r: 5,
                      fill: '#818cf8',
                      stroke: '#ffffff',
                      strokeWidth: 2,
                    }}
                    dot={false}
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Top Events and Recent Events */}
      {analytics && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Top Events */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
                <BarChart3 className="h-4 w-4 text-indigo-400" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-white">
                  Top Events
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  Most frequently tracked events
                </p>
              </div>
            </div>

            {analytics.topEvents.length === 0 ? (
              <EmptyState message="No events recorded yet." />
            ) : (
              <div className="space-y-5">
                {analytics.topEvents.map((event) => (
                  <div key={event.name}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-medium text-slate-200">
                        {event.name}
                      </span>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs font-semibold text-white">
                          {formatNumber(event.count)}
                        </span>

                        <span className="text-[11px] text-slate-500">
                          {formatNumber(event.percentage)}%
                        </span>
                      </div>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                        style={{
                          width: `${Math.min(event.percentage, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Events */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                <Clock className="h-4 w-4 text-emerald-400" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-white">
                  Recent Events
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  Latest activity in this project
                </p>
              </div>
            </div>

            {analytics.recentEvents.length === 0 ? (
              <EmptyState message="No recent events found." />
            ) : (
              <div className="space-y-1">
                {analytics.recentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start justify-between gap-3 rounded-lg p-3 transition hover:bg-slate-800/60"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800">
                        <MousePointerClick className="h-4 w-4 text-slate-400" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-white">
                          {event.name}
                        </p>

                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          User: {event.userId || 'Anonymous'}
                        </p>

                        <p className="mt-1 text-[11px] text-slate-600">
                          {formatTimestamp(event.timestamp)}
                        </p>
                      </div>
                    </div>

                    <span
                      className="shrink-0 text-[11px] text-slate-400"
                      title={new Date(event.timestamp).toLocaleString()}
                    >
                      {event.relativeTime}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* KPI Card with period comparison */
function KpiCard({
  title,
  value,
  change,
  icon,
}: {
  title: string;
  value: number;
  change: number;
  icon: React.ReactNode;
}) {
  const positive = change >= 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">
            {title}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-white">
            {formatNumber(value)}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
          {icon}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        {positive ? (
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
        )}

        <span
          className={`text-xs font-medium ${positive ? 'text-emerald-400' : 'text-rose-400'
            }`}
        >
          {positive ? '+' : ''}
          {change}%
        </span>

        <span className="text-[11px] text-slate-500">
          vs previous period
        </span>
      </div>
    </div>
  );
}

/* KPI Card without period comparison */
function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">
            {title}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-white">
            {formatNumber(value)}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
          {icon}
        </div>
      </div>
    </div>
  );
}

/* Project activity status badge */
function ActivityStatusBadge({
  status,
}: {
  status: ActivityStatus;
}) {
  const styles: Record<ActivityStatus, string> = {
    inactive:
      'border-slate-700 bg-slate-800 text-slate-400',

    low:
      'border-amber-500/20 bg-amber-500/10 text-amber-400',

    active:
      'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  };

  const labels: Record<ActivityStatus, string> = {
    inactive: 'Inactive',
    low: 'Low Activity',
    active: 'Active',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

/* Empty state */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center">
      <Activity className="mx-auto h-6 w-6 text-slate-600" />

      <p className="mt-2 text-xs text-slate-500">
        {message}
      </p>
    </div>
  );
}