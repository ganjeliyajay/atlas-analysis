
'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  Users,
  TrendingUp,
  Activity,
  Info,
  Sparkles,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';

import { Badge } from '@/components/ui/Badge';
import { AreaChart } from '@/components/charts/AreaChart';
import { RetentionCohort } from '@/types/analytics';
import { cn } from '@/lib/utils';

type CohortPeriod = 'weekly' | 'daily' | 'monthly';
type RetentionMetric = 'any_event' | 'core_action';

type RetentionApiResponse = {
  success: boolean;
  data: {
    kpis: {
      day1Retention: number;
      week1Retention: number;
      week4Retention: number;
      averageCohortSize: number;
    };
    retentionCurve: {
      date: string;
      label: string;
      value: number;
    }[];
    cohorts: RetentionCohort[];
    summary: {
      totalCohorts: number;
      totalUsers: number;
      period: CohortPeriod;
      metric: RetentionMetric;
      startDate: string;
      endDate: string;
    };
    metricDefinition: string;
  };
};

export default function RetentionPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || 'All';

  const [cohorts, setCohorts] = useState<RetentionCohort[]>([]);

  const [cohortPeriod, setCohortPeriod] =
    useState<CohortPeriod>('weekly');

  const [retentionMetric, setRetentionMetric] =
    useState<RetentionMetric>('any_event');

  const [retentionCurve, setRetentionCurve] = useState<
    { date: string; label: string; value: number }[]
  >([]);

  const [kpis, setKpis] = useState({
    day1Retention: 0,
    week1Retention: 0,
    week4Retention: 0,
    averageCohortSize: 0,
  });

  const [summary, setSummary] = useState({
    totalCohorts: 0,
    totalUsers: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metricDefinition, setMetricDefinition] = useState('');

  const [hoveredCell, setHoveredCell] = useState<{
    cohortIndex: number;
    weekIndex: number;
    val: number | null;
  } | null>(null);

  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchRetention() {
      try {
        const params = new URLSearchParams({
          projectId: projectId && projectId !== 'All' ? projectId : 'All',
          period: cohortPeriod,
          metric: retentionMetric,
        });

        const response = await fetch(
          `/api/analytics/retention?${params.toString()}`,
          {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-store',
          }
        );

        const result: RetentionApiResponse = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.success === false
              ? 'Failed to fetch retention analytics'
              : 'Something went wrong'
          );
        }

        setError(null);
        setCohorts(result.data.cohorts);
        setRetentionCurve(result.data.retentionCurve);
        setKpis(result.data.kpis);
        setSummary({
          totalCohorts: result.data.summary.totalCohorts,
          totalUsers: result.data.summary.totalUsers,
        });
        setMetricDefinition(result.data.metricDefinition);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load retention analytics'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }

    fetchRetention();

    return () => controller.abort();
  }, [projectId, cohortPeriod, retentionMetric, reloadTrigger]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshing(true);
    setReloadTrigger((prev) => prev + 1);
  };

  const periodLabels = React.useMemo(() => {
    if (cohortPeriod === 'daily') {
      return [
        'Day 0',
        'Day 1',
        'Day 2',
        'Day 3',
        'Day 4',
        'Day 5',
        'Day 6',
        'Day 7',
      ];
    }

    if (cohortPeriod === 'monthly') {
      return [
        'Month 0',
        'Month 1',
        'Month 2',
        'Month 3',
        'Month 4',
        'Month 5',
        'Month 6',
        'Month 7',
      ];
    }

    return [
      'Week 0',
      'Week 1',
      'Week 2',
      'Week 3',
      'Week 4',
      'Week 5',
      'Week 6',
      'Week 7',
    ];
  }, [cohortPeriod]);

  const getCellBg = (pct: number | null) => {
    if (pct === null) {
      return 'bg-slate-900/40 text-slate-700 border border-slate-800/50';
    }

    if (pct >= 80) {
      return 'bg-indigo-500 text-white font-bold';
    }

    if (pct >= 65) {
      return 'bg-indigo-600/90 text-indigo-50 font-semibold';
    }

    if (pct >= 50) {
      return 'bg-indigo-700/70 text-indigo-100';
    }

    if (pct >= 35) {
      return 'bg-indigo-900/80 text-indigo-200 border border-indigo-800/50';
    }

    return 'bg-slate-800/70 text-slate-400';
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10">
              <Activity className="h-4 w-4 text-indigo-400" />
            </div>

            <h1 className="text-xl font-bold tracking-tight text-white">
              Retention Analytics
            </h1>

            <Badge variant="neutral">
              {loading ? 'Loading' : 'Live Data'}
            </Badge>
          </div>

          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Understand how frequently users return and measure long-term
            engagement across different signup cohorts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Cohort Period */}
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

            <select
              value={cohortPeriod}
              onChange={(e) =>
                setCohortPeriod(e.target.value as CohortPeriod)
              }
              className="appearance-none rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-8 text-xs font-medium text-white outline-none transition hover:border-slate-600 focus:border-indigo-500"
            >
              <option value="daily">Daily Cohorts</option>
              <option value="weekly">Weekly Cohorts</option>
              <option value="monthly">Monthly Cohorts</option>
            </select>

            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Metric */}
          <div className="relative">
            <select
              value={retentionMetric}
              onChange={(e) =>
                setRetentionMetric(e.target.value as RetentionMetric)
              }
              className="appearance-none rounded-lg border border-slate-700 bg-slate-900 py-2 pl-3 pr-8 text-xs font-medium text-white outline-none transition hover:border-slate-600 focus:border-indigo-500"
            >
              <option value="any_event">Any Event</option>
              <option value="core_action">Core Action</option>
            </select>

            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5',
                (loading || refreshing) && 'animate-spin'
              )}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
          Loading retention analytics...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          <div className="font-semibold">Unable to load analytics</div>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-3 rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium hover:bg-red-500/10"
          >
            Try again
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Day 1 */}
        <Card className="relative overflow-hidden p-4">
          <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-indigo-500/5 blur-2xl" />

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Day 1 Retention
            </span>

            <div className="rounded-lg bg-indigo-500/10 p-2">
              <Users className="h-4 w-4 text-indigo-400" />
            </div>
          </div>

          <div className="mt-3 text-2xl font-bold tracking-tight text-white">
            {loading ? '...' : `${kpis.day1Retention}%`}
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            Based on selected cohort period
          </p>
        </Card>

        {/* Week 1 */}
        <Card className="relative overflow-hidden p-4">
          <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-emerald-500/5 blur-2xl" />

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Week 1 Retention
            </span>

            <div className="rounded-lg bg-emerald-500/10 p-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>
          </div>

          <div className="mt-3 text-2xl font-bold tracking-tight text-white">
            {loading ? '...' : `${kpis.week1Retention}%`}
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            Users returning during period 1
          </p>
        </Card>

        {/* Week 4 */}
        <Card className="relative overflow-hidden p-4">
          <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-violet-500/5 blur-2xl" />

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Week 4 Retention
            </span>

            <div className="rounded-lg bg-violet-500/10 p-2">
              <Activity className="h-4 w-4 text-violet-400" />
            </div>
          </div>

          <div className="mt-3 text-2xl font-bold tracking-tight text-white">
            {loading ? '...' : `${kpis.week4Retention}%`}
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            Users returning during period 4
          </p>
        </Card>

        {/* Average Cohort Size */}
        <Card className="relative overflow-hidden p-4">
          <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-amber-500/5 blur-2xl" />

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Average Cohort Size
            </span>

            <div className="rounded-lg bg-amber-500/10 p-2">
              <Users className="h-4 w-4 text-amber-400" />
            </div>
          </div>

          <div className="mt-3 text-2xl font-bold tracking-tight text-white">
            {loading
              ? '...'
              : kpis.averageCohortSize.toLocaleString()}
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            Across {summary.totalCohorts} cohorts
          </p>
        </Card>
      </div>

      {/* Retention Curve */}
      <Card className="p-5 sm:p-6">
        <CardHeader>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Cohort Retention Curve</CardTitle>

              <Badge variant="neutral">
                {cohortPeriod === 'daily'
                  ? 'Daily'
                  : cohortPeriod === 'weekly'
                    ? 'Weekly'
                    : 'Monthly'}
              </Badge>
            </div>

            <CardDescription className="mt-1">
              Retention percentage over time based on user activity.
            </CardDescription>
          </div>

          <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 sm:flex">
            <div className="h-2 w-2 rounded-full bg-indigo-400" />
            <span className="text-[11px] font-medium text-slate-300">
              Retention
            </span>
          </div>
        </CardHeader>

        <div className="mt-4">
          {retentionCurve.length > 0 ? (
            <AreaChart
              data={retentionCurve}
              color="#6366f1"
              height={240}
              valueFormatter={(v) => `${v}%`}
            />
          ) : (
            !loading && (
              <div className="flex h-[240px] items-center justify-center text-sm text-slate-500">
                No retention data available.
              </div>
            )
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
          <span className="text-[11px] text-slate-500">
            {summary.totalUsers.toLocaleString()} identified users
          </span>

          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Info className="h-3 w-3" />
            Live analytics
          </span>
        </div>
      </Card>

      {/* Cohort Heatmap */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-500/10 p-2">
              <Calendar className="h-4 w-4 text-indigo-400" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">
                Cohort Retention Heatmap
              </h3>

              <p className="mt-0.5 text-[11px] text-slate-500">
                Percentage of users returning after first activity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Lower</span>

            <div className="flex items-center gap-1">
              <div className="h-3 w-5 rounded-sm bg-slate-800" />
              <div className="h-3 w-5 rounded-sm bg-indigo-950" />
              <div className="h-3 w-5 rounded-sm bg-indigo-800" />
              <div className="h-3 w-5 rounded-sm bg-indigo-600" />
              <div className="h-3 w-5 rounded-sm bg-indigo-500" />
            </div>

            <span>Higher</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">
                  Cohort Signup
                </th>

                <th className="px-4 py-3 text-right font-semibold">
                  Users
                </th>

                {periodLabels.map((label) => (
                  <th
                    key={label}
                    className="min-w-[75px] px-2 py-3 text-center font-semibold"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-mono">
              {cohorts.map((cohort, cIdx) => (
                <tr
                  key={cohort.cohortDate}
                  className="transition-colors hover:bg-slate-800/30"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-sans font-medium text-slate-200">
                    {cohort.cohortDate}
                  </td>

                  <td className="px-4 py-3 text-right text-slate-400">
                    {cohort.totalUsers.toLocaleString()}
                  </td>

                  {periodLabels.map((label, pIdx) => {
                    const pct = cohort.periods[pIdx] ?? null;

                    const isHovered =
                      hoveredCell?.cohortIndex === cIdx &&
                      hoveredCell?.weekIndex === pIdx;

                    return (
                      <td
                        key={label}
                        className="px-1.5 py-1.5 text-center"
                        onMouseEnter={() =>
                          setHoveredCell({
                            cohortIndex: cIdx,
                            weekIndex: pIdx,
                            val: pct,
                          })
                        }
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div
                          className={cn(
                            'relative rounded-md py-2 text-xs transition-all',
                            getCellBg(pct),
                            isHovered &&
                              'z-10 scale-105 ring-2 ring-white/80'
                          )}
                        >
                          {pct !== null ? `${pct}%` : '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {!loading && cohorts.length === 0 && (
                <tr>
                  <td
                    colSpan={periodLabels.length + 2}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    No cohort data available for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Hover Details */}
        {hoveredCell && hoveredCell.val !== null && (
          <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-semibold text-white">
                {cohorts[hoveredCell.cohortIndex].cohortDate}
              </span>

              <span className="mx-2 text-slate-600">•</span>

              <span>
                {periodLabels[hoveredCell.weekIndex]}:
              </span>

              <span className="ml-2 font-bold text-indigo-400">
                {hoveredCell.val}% retained
              </span>

              <span className="ml-2 text-slate-400">
                (
                {Math.round(
                  (cohorts[hoveredCell.cohortIndex].totalUsers *
                    hoveredCell.val) /
                    100
                ).toLocaleString()}
                active users)
              </span>
            </div>

            <span className="text-[11px] text-slate-500">
              Cohort size:{' '}
              {cohorts[
                hoveredCell.cohortIndex
              ].totalUsers.toLocaleString()}
            </span>
          </div>
        )}
      </Card>

      {/* Insight Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="rounded-lg bg-indigo-500/10 p-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
        </div>

        <div>
          <h4 className="text-sm font-semibold text-indigo-200">
            Retention Insight
          </h4>

          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Retention generally declines as cohorts age. Use the heatmap
            to identify the periods where users stop returning and focus
            on improving engagement during those stages.
          </p>

          {metricDefinition && (
            <p className="mt-2 text-[11px] text-slate-500">
              Metric definition: {metricDefinition}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
