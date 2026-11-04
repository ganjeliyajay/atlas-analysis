'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import {
  Search,
  ArrowUpDown,
  Monitor,
  Smartphone,
  Eye,
  Users,
  FileText,
  Activity,
  Clock,
} from 'lucide-react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';

import { Badge } from '@/components/ui/Badge';
import { AreaChart } from '@/components/charts/AreaChart';
import { cn } from '@/lib/utils';

type DeviceFilter = 'all' | 'desktop' | 'mobile';
type DateRange = '7d' | '30d' | '90d';

type Project = {
  id: string;
  name: string;
};

type PageAnalyticsItem = {
  url: string;
  title: string;
  views: number;
  uniqueUsers: number;
  sessions: number;
  averageTimeOnPage?: number;
};

type DailyEvent = {
  date: string;
  count: number;
};

type PagesAnalyticsResponse = {
  success: boolean;
  data: {
    pages: PageAnalyticsItem[];
    dailyEvents: DailyEvent[];
    totalPageViews: number;
    uniqueVisitors: number;
    totalSessions: number;
    totalPages: number;
    bouncedSessions: number;
    bounceRate: number;
    averageTimeOnPage: number;
    range: string;
    device: string;
    projectId: string;
  };
};

export default function PagesAnalyticsPage() {
  // Analytics data
  const [pages, setPages] = useState<PageAnalyticsItem[]>([]);
  const [dailyEvents, setDailyEvents] = useState<DailyEvent[]>([]);

  const [totalPageViews, setTotalPageViews] = useState(0);
  const [uniqueVisitors, setUniqueVisitors] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [bounceRate, setBounceRate] = useState(0);
  const [averageTimeOnPage, setAverageTimeOnPage] = useState(0);

  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('projectId');

  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState(
    urlProjectId && urlProjectId !== 'All' ? urlProjectId : 'All'
  );

  const [prevUrlProjectId, setPrevUrlProjectId] = useState(urlProjectId);
  if (urlProjectId !== prevUrlProjectId) {
    setPrevUrlProjectId(urlProjectId);
    if (urlProjectId && urlProjectId !== 'All') {
      setSelectedProject(urlProjectId);
    }
  }

  // Filters
  const [search, setSearch] = useState('');
  const [selectedDevice, setSelectedDevice] =
    useState<DeviceFilter>('all');

  const [selectedRange, setSelectedRange] =
    useState<DateRange>('30d');

  // Sorting
  const [sortField, setSortField] = useState<
    'views' | 'uniqueUsers' | 'sessions'
  >('views');

  const [sortAsc, setSortAsc] = useState(false);

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // Fetch projects
  // ============================================

  useEffect(() => {
    const controller = new AbortController();

    async function fetchProjects() {
      try {
        const response = await fetch('/api/projects', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || 'Failed to fetch projects.'
          );
        }

        setProjects(
          (result.projects ?? []).map(
            (project: Project) => ({
              id: project.id,
              name: project.name,
            })
          )
        );
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === 'AbortError'
        ) {
          return;
        }

        console.error('Projects fetch error:', err);
      }
    }

    fetchProjects();

    return () => controller.abort();
  }, []);

  // ============================================
  // Fetch pages analytics
  // ============================================

  useEffect(() => {
    const controller = new AbortController();

    async function fetchPagesAnalytics() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          device: selectedDevice,
          range: selectedRange,
          projectId: selectedProject,
        });

        const response = await fetch(
          `/api/analytics/pages?${params.toString()}`,
          {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              'Failed to fetch pages analytics.'
          );
        }

        const payload =
          result as PagesAnalyticsResponse;

        if (!payload.success || !payload.data) {
          throw new Error(
            'Invalid analytics response.'
          );
        }

        setPages(payload.data.pages ?? []);
        setDailyEvents(payload.data.dailyEvents ?? []);

        setTotalPageViews(
          payload.data.totalPageViews ?? 0
        );

        setUniqueVisitors(
          payload.data.uniqueVisitors ?? 0
        );

        setTotalSessions(
          payload.data.totalSessions ?? 0
        );

        setTotalPages(
          payload.data.totalPages ?? 0
        );

        setBounceRate(
          payload.data.bounceRate ?? 0
        );

        setAverageTimeOnPage(
          payload.data.averageTimeOnPage ?? 0
        );
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          'Pages analytics fetch error:',
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Something went wrong while loading analytics.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchPagesAnalytics();

    return () => controller.abort();
  }, [
    selectedDevice,
    selectedProject,
    selectedRange,
  ]);

  // ============================================
  // Chart data
  // ============================================

  const pageViewsTrend = useMemo(() => {
    return dailyEvents.map((item) => ({
      date: item.date,
      label: new Date(
        `${item.date}T00:00:00`
      ).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      }),
      value: item.count,
    }));
  }, [dailyEvents]);

  // ============================================
  // Filter and sort pages
  // ============================================

  const filteredPages = useMemo(() => {
    const searchValue = search.toLowerCase().trim();

    return [...pages]
      .filter((page) => {
        return (
          page.url
            .toLowerCase()
            .includes(searchValue) ||
          page.title
            .toLowerCase()
            .includes(searchValue)
        );
      })
      .sort((a, b) => {
        const valueA = a[sortField];
        const valueB = b[sortField];

        return sortAsc
          ? valueA - valueB
          : valueB - valueA;
      });
  }, [pages, search, sortField, sortAsc]);

  // ============================================
  // Sorting handler
  // ============================================

  const handleSort = (
    field: 'views' | 'uniqueUsers' | 'sessions'
  ) => {
    if (sortField === field) {
      setSortAsc((previous) => !previous);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // ============================================
  // Format number
  // ============================================

  const formatNumber = (value: number) => {
    return value.toLocaleString('en-IN');
  };

  // ============================================
  // Format average time
  // ============================================

  const formatDuration = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return '0s';
    }

    const totalSeconds = Math.round(seconds);

    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    if (minutes === 0) {
      return `${remainingSeconds}s`;
    }

    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }

    return `${minutes}m ${remainingSeconds}s`;
  };

  // ============================================
  // Date range label
  // ============================================

  const rangeLabel = selectedRange.replace(
    'd',
    ' Days'
  );

  // ============================================
  // UI
  // ============================================

  return (
    <div className="space-y-6">
      {/* Page Heading */}

      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          Pages &amp; Route Analytics
        </h1>

        <p className="mt-1 text-xs text-slate-400">
          Track page traffic, visitors, sessions, and
          route activity across your analytics project.
        </p>
      </div>

      {/* KPI Cards */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Total Page Views */}

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Total Page Views
            </span>

            <Eye className="h-4 w-4 text-indigo-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {loading
              ? '—'
              : formatNumber(totalPageViews)}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Last {selectedRange.replace('d', ' days')}
          </p>
        </Card>

        {/* Unique Visitors */}

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Unique Visitors
            </span>

            <Users className="h-4 w-4 text-emerald-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {loading
              ? '—'
              : formatNumber(uniqueVisitors)}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Unique identified users
          </p>
        </Card>

        {/* Total Sessions */}

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Total Sessions
            </span>

            <Activity className="h-4 w-4 text-amber-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {loading
              ? '—'
              : formatNumber(totalSessions)}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Sessions with page views
          </p>
        </Card>

        {/* Pages Tracked */}

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Pages Tracked
            </span>

            <FileText className="h-4 w-4 text-violet-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {loading
              ? '—'
              : formatNumber(totalPages)}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Unique page URLs
          </p>
        </Card>

        {/* Bounce Rate */}

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Bounce Rate
            </span>

            <Activity className="h-4 w-4 text-rose-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {loading
              ? '—'
              : `${bounceRate.toFixed(2)}%`}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Single page-view sessions
          </p>
        </Card>

        {/* Average Time on Page */}

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Average Time on Page
            </span>

            <Clock className="h-4 w-4 text-cyan-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {loading
              ? '—'
              : formatDuration(averageTimeOnPage)}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Average engagement duration
          </p>
        </Card>
      </div>

      {/* Page Views Trend Chart */}

      <Card className="p-6">
        <CardHeader>
          <div>
            <CardTitle>
              Page Views Ingestion Volume
            </CardTitle>

            <CardDescription>
              Daily page views over the past{' '}
              {selectedRange.replace('d', ' days')}
            </CardDescription>
          </div>

          <Badge variant="neutral">
            {rangeLabel}
          </Badge>
        </CardHeader>

        <div className="pt-4">
          {loading ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
              Loading chart data...
            </div>
          ) : error ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-rose-400">
              Chart data unavailable.
            </div>
          ) : (
            <AreaChart
              data={pageViewsTrend}
              color="#8b5cf6"
              height={220}
            />
          )}
        </div>
      </Card>

      {/* Pages Table */}

      <Card className="overflow-hidden p-0">
        {/* Filter Controls */}

        <div className="flex flex-col items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/40 p-4 sm:flex-row">
          {/* Search */}

          <div className="relative w-full flex-1 sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

            <input
              type="text"
              placeholder="Search page URL or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Project and Date Range Filters */}

          <div className="flex flex-wrap items-center gap-3">
            {/* Project Filter */}

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                Project:
              </span>

              <select
                value={selectedProject}
                onChange={(e) =>
                  setSelectedProject(e.target.value)
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="All">
                  All Projects
                </option>

                {projects.map((project) => (
                  <option
                    key={project.id}
                    value={project.id}
                  >
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Filter */}

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                Date Range:
              </span>

              <select
                value={selectedRange}
                onChange={(e) =>
                  setSelectedRange(
                    e.target.value as DateRange
                  )
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="7d">
                  Last 7 Days
                </option>

                <option value="30d">
                  Last 30 Days
                </option>

                <option value="90d">
                  Last 90 Days
                </option>
              </select>
            </div>
          </div>

          {/* Device Filter */}

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              Device:
            </span>

            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
              <button
                onClick={() =>
                  setSelectedDevice('all')
                }
                className={cn(
                  'rounded px-2 py-0.5 text-xs',
                  selectedDevice === 'all'
                    ? 'bg-slate-800 font-medium text-white'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                All
              </button>

              <button
                onClick={() =>
                  setSelectedDevice('desktop')
                }
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-xs',
                  selectedDevice === 'desktop'
                    ? 'bg-slate-800 font-medium text-white'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Monitor className="h-3 w-3" />
                Desktop
              </button>

              <button
                onClick={() =>
                  setSelectedDevice('mobile')
                }
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-xs',
                  selectedDevice === 'mobile'
                    ? 'bg-slate-800 font-medium text-white'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Smartphone className="h-3 w-3" />
                Mobile
              </button>
            </div>
          </div>
        </div>

        {/* Table */}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  Page URL &amp; Route
                </th>

                <th className="hidden sm:table-cell px-4 py-3 font-semibold">
                  Page Title
                </th>

                <th
                  onClick={() => handleSort('views')}
                  className="cursor-pointer px-4 py-3 text-right font-semibold hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Views
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>

                <th
                  onClick={() =>
                    handleSort('uniqueUsers')
                  }
                  className="hidden md:table-cell cursor-pointer px-4 py-3 text-right font-semibold hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Unique Users
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>

                <th
                  onClick={() => handleSort('sessions')}
                  className="cursor-pointer px-4 py-3 text-right font-semibold hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Sessions
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    Loading pages analytics...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-rose-400"
                  >
                    {error}
                  </td>
                </tr>
              ) : filteredPages.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    {search
                      ? 'No pages match your search.'
                      : 'No page view events found for the selected period.'}
                  </td>
                </tr>
              ) : (
                filteredPages.map((page) => (
                  <tr
                    key={page.url}
                    className="transition-colors hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-indigo-400">
                      <div className="truncate max-w-[180px] sm:max-w-xs md:max-w-sm" title={page.url}>
                        {page.url}
                      </div>
                    </td>

                    <td className="hidden sm:table-cell px-4 py-3 font-medium text-slate-300">
                      <div className="truncate max-w-[140px] sm:max-w-xs" title={page.title}>
                        {page.title}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-white">
                      {formatNumber(page.views)}
                    </td>

                    <td className="hidden md:table-cell px-4 py-3 text-right font-mono text-slate-300">
                      {formatNumber(page.uniqueUsers)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {formatNumber(page.sessions)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}

        {!loading && !error && (
          <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
            Showing {filteredPages.length} of{' '}
            {pages.length} pages
          </div>
        )}
      </Card>
    </div>
  );
}