'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import {
  Search,
  ArrowUpDown,
  Eye,
  Copy,
  Check,
  Download,
} from 'lucide-react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AreaChart } from '@/components/charts/AreaChart';

type AnalyticsEvent = {
  id: string;
  eventName: string;
  userId: string | null;
  sessionId: string | null;
  properties: Record<string, unknown> | null;
  pageUrl: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  createdAt: string;
  projectId: string;
};

type DailyEvent = {
  date: string;
  count: number;
};

type EventsApiResponse = {
  success: boolean;
  data: {
    events: AnalyticsEvent[];
    totalEvents: number;
    activeUsers: number;
    uniqueEventNames: number;
    dailyEvents: DailyEvent[];
    range: string;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type SortField = 'name' | 'timestamp' | 'propertiesCount';

export default function EventsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const [search, setSearch] = useState('');
  const [eventNameFilter, setEventNameFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  type DateRange = 'today' | '7d' | '30d' | '90d';
  const [selectedRange, setSelectedRange] =
    useState<DateRange>('30d');

  const [sortField, setSortField] =
    useState<SortField>('timestamp');

  const [sortAsc, setSortAsc] = useState(false);
  const [activeModalEvent, setActiveModalEvent] =
    useState<AnalyticsEvent | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 5;
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [dailyEvents, setDailyEvents] = useState<DailyEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [uniqueEventNames, setUniqueEventNames] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sortedEvents = [...events].sort((a, b) => {

    if (sortField === 'name') {
      return sortAsc
        ? a.eventName.localeCompare(b.eventName)
        : b.eventName.localeCompare(a.eventName);
    }

    if (sortField === 'propertiesCount') {
      const aCount = Object.keys(a.properties ?? {}).length;
      const bCount = Object.keys(b.properties ?? {}).length;
      return sortAsc ? aCount - bCount : bCount - aCount;
    }

    return sortAsc
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt);
  });

  const paginatedEvents = sortedEvents;
  const eventsDailyData = dailyEvents.map((item) => {
    const date = new Date(`${item.date}T00:00:00`);
    return {
      date: item.date,
      label: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      value: item.count,
    };
  });

  const copyEventJson = async () => {
    if (!activeModalEvent) return;
    await navigator.clipboard.writeText(
      JSON.stringify(activeModalEvent, null, 2)
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCsv = async () => {
    try {
      setExporting(true);
      const queryArgs: Record<string, string> = {
        range: selectedRange,
      };

      if (search.trim()) queryArgs.search = search.trim();
      if (eventNameFilter.trim()) queryArgs.eventName = eventNameFilter.trim();
      if (userIdFilter.trim()) queryArgs.userId = userIdFilter.trim();
      if (startDate) queryArgs.startDate = startDate;
      if (endDate) queryArgs.endDate = endDate;
      if (projectId && projectId !== 'All') queryArgs.projectId = projectId;

      const params = new URLSearchParams(queryArgs);
      const response = await fetch(`/api/analytics/events/export?${params.toString()}`);

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Failed to export events');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `atlas-events-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export error:', err);
      alert(err instanceof Error ? err.message : 'Unable to export CSV.');
    } finally {
      setExporting(false);
    }
  };

  const [prevProjectId, setPrevProjectId] = useState(projectId);
  if (projectId !== prevProjectId) {
    setPrevProjectId(projectId);
    setPage(1);
  }

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        setError(null);
        const queryArgs: Record<string, string> = {
          range: selectedRange,
          page: String(page),
          limit: String(pageSize),
        };

        if (search.trim()) queryArgs.search = search.trim();
        if (eventNameFilter.trim()) queryArgs.eventName = eventNameFilter.trim();
        if (userIdFilter.trim()) queryArgs.userId = userIdFilter.trim();
        if (startDate) queryArgs.startDate = startDate;
        if (endDate) queryArgs.endDate = endDate;

        if (projectId && projectId !== 'All') {
          queryArgs.projectId = projectId;
        }

        const params = new URLSearchParams(queryArgs);
        const response = await fetch(
          `/api/analytics/events?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch analytics events');
        }

        const result: EventsApiResponse = await response.json();
        setEvents(result.data.events);
        setTotalEvents(result.data.totalEvents);
        setTotalPages(Math.max(1, result.data.pagination?.totalPages ?? 1));
        setActiveUsers(result.data.activeUsers);
        setUniqueEventNames(result.data.uniqueEventNames);
        setDailyEvents(result.data.dailyEvents ?? []);
      } catch (err) {
        console.error('Events fetch error:', err);
        setError('Unable to load analytics events.');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [selectedRange, page, projectId, search, eventNameFilter, userIdFilter, startDate, endDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Events Analytics Catalog
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Audit, inspect, and analyze all ingested user telemetry
            schema definitions and payloads.
          </p>
        </div>
        <select
          value={selectedRange}
          onChange={(e) => {
            setSelectedRange(e.target.value as DateRange);
            setPage(1);
          }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="today">Today</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>

      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">
            Total Ingested Events
          </span>
          <div className="text-2xl font-bold text-white mt-1">
            {totalEvents.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Events in selected range
          </div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">
            Unique Active Users
          </span>
          <div className="text-2xl font-bold text-white mt-1">
            {activeUsers.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Unique users in selected range
          </div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">
            Daily Event Rate
          </span>
          <div className="text-2xl font-bold text-white mt-1">
            {(
              totalEvents /
              (selectedRange === 'today'
                ? 1
                : selectedRange === '7d'
                  ? 7
                  : selectedRange === '30d'
                    ? 30
                    : 90)
            ).toFixed(1)} / day
          </div>

          <div className="text-[11px] text-slate-500 mt-1">
            Average over selected range
          </div>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">
            Unique Schemas
          </span>

          <div className="text-2xl font-bold text-white mt-1">
            {uniqueEventNames} Types
          </div>

          <div className="text-[11px] text-slate-500 mt-1">
            Unique event names
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <CardHeader>
          <div>
            <CardTitle>
              Daily Ingestion Rate & Volume
            </CardTitle>
            <CardDescription>
              Event volume over the selected date range
            </CardDescription>
          </div>

          <Badge variant="neutral">
            {selectedRange === 'today'
              ? 'Today'
              : selectedRange === '7d'
                ? '7 Days'
                : selectedRange === '30d'
                  ? '30 Days'
                  : '90 Days'}
          </Badge>
        </CardHeader>

        <div className="pt-4">

          {loading ? (

            <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">

              Loading chart data...

            </div>

          ) : error ? (

            <div className="h-[220px] flex items-center justify-center text-sm text-red-400">

              Unable to load chart data.

            </div>

          ) : (

            <AreaChart

              data={eventsDailyData}

              height={220}

              color="#6366f1"

              valueFormatter={(value) => value.toLocaleString()}

            />

          )}

        </div>

      </Card>

      {/* Events Table Card */}
      <Card className="p-0 overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search event, ID, or user..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <input
              type="text"
              placeholder="Filter event name..."
              value={eventNameFilter}
              onChange={(e) => { setEventNameFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />

            <input
              type="text"
              placeholder="Filter user ID..."
              value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />

            <input
              type="date"
              aria-label="Start date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />

            <input
              type="date"
              aria-label="End date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
            <span className="text-xs text-slate-400">
              Showing {events.length} events on this page · {totalEvents.toLocaleString()} total
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={exporting || loading}
                className="text-xs h-7 px-2.5"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {exporting ? 'Exporting...' : 'Export CSV'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setEventNameFilter('');
                  setUserIdFilter('');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="text-xs h-7 px-2 text-slate-400 hover:text-white"
              >
                Clear filters
              </Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <tr>
                <th
                  onClick={() => {
                    setSortField('name');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Event Name</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>

                <th className="hidden md:table-cell py-3 px-4 font-semibold">
                  Event ID
                </th>

                <th className="py-3 px-4 font-semibold">
                  User Identifier
                </th>

                <th className="hidden lg:table-cell py-3 px-4 font-semibold">
                  Project
                </th>

                <th
                  onClick={() => {
                    setSortField('timestamp');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Timestamp</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>

                <th
                  onClick={() => {
                    setSortField('propertiesCount');
                    setSortAsc(!sortAsc);
                  }}
                  className="hidden sm:table-cell py-3 px-4 font-semibold text-right cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Props</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>

                <th className="py-3 px-4 font-semibold text-right">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-mono">

              {loading && (

                <tr>

                  <td

                    colSpan={7}

                    className="py-10 text-center text-slate-400"

                  >

                    Loading events...

                  </td>

                </tr>

              )}

              {error && !loading && (

                <tr>

                  <td

                    colSpan={7}

                    className="py-10 text-center text-red-400"

                  >

                    {error}

                  </td>

                </tr>

              )}

              {!loading &&

                !error &&

                paginatedEvents.length === 0 && (

                  <tr>

                    <td

                      colSpan={7}

                      className="py-10 text-center text-slate-400"

                    >

                      No events found.

                    </td>

                  </tr>

                )}

              {paginatedEvents.map((evt) => (

                <tr

                  key={evt.id}

                  className="hover:bg-slate-800/40 transition-colors group cursor-pointer"

                  onClick={() => setActiveModalEvent(evt)}

                >

                  <td className="py-3 px-4 font-sans">

                    <div className="flex items-center gap-2">

                      <span className="font-mono font-bold text-indigo-400 group-hover:text-indigo-300">

                        {evt.eventName}

                      </span>

                      <Badge

                        variant="neutral"

                        className="text-[10px] py-0 px-1 font-sans"

                      >

                        {evt.device ?? 'Event'}

                      </Badge>

                    </div>

                  </td>

                  <td className="hidden md:table-cell py-3 px-4 text-slate-400 text-[11px]">
                    {evt.id}
                  </td>

                  <td className="py-3 px-4 text-slate-200">
                    <div>{evt.userId ?? 'Anonymous'}</div>
                  </td>

                  <td className="hidden lg:table-cell py-3 px-4 font-sans text-slate-300">
                    {evt.projectId}
                  </td>

                  <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                    {new Date(evt.createdAt).toLocaleString()}
                  </td>

                  <td className="hidden sm:table-cell py-3 px-4 text-right">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                      {Object.keys(evt.properties ?? {}).length} keys
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveModalEvent(evt);
                      }}
                      className="p-1 h-7 text-slate-400 hover:text-white"
                      aria-label="View event details"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900/40 text-xs">
          <span className="text-slate-400">
            Page {page} of {totalPages}
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Event Details Dialog Modal */}

      {activeModalEvent && (

        <Modal

          isOpen={!!activeModalEvent}

          onClose={() => setActiveModalEvent(null)}

          title={`Event: ${activeModalEvent.eventName}`}

          description={`ID: ${activeModalEvent.id} • Event details`}

          maxWidth="max-w-2xl"

        >

          <div className="space-y-4">

            {/* Meta badges */}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">

              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">

                <div className="text-slate-500 text-[10px]">

                  PROJECT

                </div>

                <div className="font-semibold text-white mt-0.5">

                  {activeModalEvent.projectId}

                </div>

              </div>

              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">

                <div className="text-slate-500 text-[10px]">

                  USER ID

                </div>

                <div className="font-mono text-white mt-0.5 truncate">

                  {activeModalEvent.userId ?? 'Anonymous'}

                </div>

              </div>

              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">

                <div className="text-slate-500 text-[10px]">

                  CLIENT BROWSER

                </div>

                <div className="text-white mt-0.5">

                  {activeModalEvent.browser ?? 'Unknown'}

                </div>

              </div>

              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">

                <div className="text-slate-500 text-[10px]">

                  LOCATION

                </div>

                <div className="text-white mt-0.5">

                  {activeModalEvent.country ?? 'Unknown'}

                </div>

              </div>

            </div>

            <div>

              <div className="flex items-center justify-between pb-1.5">

                <span className="text-xs font-semibold text-slate-300">

                  Telemetry Payload JSON

                </span>

                <button

                  onClick={copyEventJson}

                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"

                >

                  {copied ? (

                    <>

                      <Check className="h-3 w-3 text-emerald-400" />

                      <span className="text-emerald-400">

                        Copied!

                      </span>

                    </>

                  ) : (

                    <>

                      <Copy className="h-3 w-3" />

                      <span>Copy Payload</span>

                    </>

                  )}

                </button>

              </div>

              <pre className="rounded-lg bg-[#070A10] p-4 text-xs font-mono text-indigo-300 overflow-x-auto border border-slate-800 max-h-60">

                {JSON.stringify(

                  activeModalEvent.properties,

                  null,

                  2

                )}

              </pre>

            </div>

            <div className="flex justify-end pt-2">

              <Button

                variant="secondary"

                size="sm"

                onClick={() => setActiveModalEvent(null)}

              >

                Close Inspector

              </Button>

            </div>

          </div>

        </Modal>

      )}

    </div>

  );

}