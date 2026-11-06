'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import {

  Users,

  UserPlus,

  UserCheck,

  Activity,

  Search,

  ArrowUpDown,

  Monitor,

  Globe2,

  RefreshCw,

  Radio,

  Clock3,

  ChevronLeft,

  ChevronRight,

  ExternalLink,

} from 'lucide-react';

import {

  Card,

  CardHeader,

  CardTitle,

  CardDescription,

} from '@/components/ui/Card';

import { Badge } from '@/components/ui/Badge';

import { SlideOver } from '@/components/ui/SlideOver';

import { AreaChart } from '@/components/charts/AreaChart';

type UserStatus = 'active' | 'inactive' | 'churned';

type UserProfile = {

  id: string;

  name: string;

  email: string;

  country: string;

  device: string;

  firstSeen: string;

  lastSeen: string;

  totalEvents: number;

  sessionsCount: number;

  status: UserStatus;

  topPages: {

    url: string;

    visits: number;

  }[];

  timeline: {

    id: string;

    action: string;

    timestamp: string;

  }[];

  recentEvents: {

    id: string;

    name: string;

    page: string;

    timestamp: string;

  }[];

};

type DailyUser = {

  date: string;

  count: number;

};

type UsersAnalyticsResponse = {

  success: boolean;

  data: {

    users: UserProfile[];

    dailyUsers: DailyUser[];

    totalUsers: number;

    newUsers: number;

    activeUsers: number;

    totalSessions: number;

    range: string;

  };

};

type LiveActivity = {

  id: string;

  userId: string;

  sessionId: string | null;

  eventName: string;

  pageUrl: string | null;

  country: string;

  device: string;

  browser: string;

  projectId: string;

  projectName: string;

  timestamp: string;

};

type LiveActivityResponse = {

  success: boolean;

  data: {

    activeUsers: number;

    activeSessions: number;

    totalActivities: number;

    uniqueCountries: number;

    countries: string[];

    activities: LiveActivity[];

    window: {

      minutes: number;

      start: string;

      end: string;

    };

    projectId: string;

    updatedAt: string;

  };

};

type JourneyEvent = {

  id: string;

  userId: string | null;

  sessionId: string | null;

  eventName: string;

  properties: unknown;

  pageUrl: string | null;

  country: string;

  device: string;

  browser: string;

  projectId: string;

  projectName: string;

  timestamp: string;

};

type JourneySession = {

  sessionId: string;

  eventCount: number;

  startedAt: string;

  lastActivityAt: string;

  uniquePages: number;

  pages: string[];

};

type JourneyResponse = {

  success: boolean;

  data: {

    user: {

      userId: string;

      firstSeen: string | null;

      lastSeen: string | null;

      totalEvents: number;

      totalSessions: number;

      totalPagesVisited: number;

    };

    sessions: JourneySession[];

    events: JourneyEvent[];

    pagination: {

      page: number;

      limit: number;

      totalEvents: number;

      totalPages: number;

      hasNextPage: boolean;

      hasPreviousPage: boolean;

    };

    updatedAt: string;

  };

};

type SortField = 'name' | 'totalEvents' | 'sessionsCount';

export default function UsersPage() {

  const searchParams = useSearchParams();

  const projectId = searchParams.get('projectId');

  // Existing users analytics state

  const [users, setUsers] = useState<UserProfile[]>([]);

  const [dailyUsers, setDailyUsers] = useState<DailyUser[]>([]);

  const [totalUsers, setTotalUsers] = useState(0);

  const [newUsers, setNewUsers] = useState(0);

  const [activeUsers, setActiveUsers] = useState(0);

  const [search, setSearch] = useState('');

  const [statusFilter, setStatusFilter] = useState('All');

  const [selectedUser, setSelectedUser] =

    useState<UserProfile | null>(null);

  const [sortField, setSortField] =

    useState<SortField>('totalEvents');

  const [sortAsc, setSortAsc] = useState(false);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // Live activity state

  const [liveData, setLiveData] =

    useState<LiveActivityResponse['data'] | null>(null);

  const [liveLoading, setLiveLoading] = useState(true);

  const [liveError, setLiveError] = useState<string | null>(null);

  // Real-time user journey state

  const [journeyData, setJourneyData] =

    useState<JourneyResponse['data'] | null>(null);

  const [journeyLoading, setJourneyLoading] = useState(false);

  const [journeyError, setJourneyError] = useState<string | null>(null);

  const [journeySessionId, setJourneySessionId] = useState('All');

  const [journeyPage, setJourneyPage] = useState(1);

  // Fetch users analytics whenever the selected project changes.
  useEffect(() => {
    let isMounted = true;

    async function fetchUsers() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (projectId && projectId !== 'All') {
        params.set('projectId', projectId);
      }

      const endpoint = params.toString()
        ? `/api/analytics/users?${params.toString()}`
        : '/api/analytics/users';

      try {
        console.info('[Users Analytics] Fetching:', endpoint);

        const response = await fetch(endpoint, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        const payload = (await response.json()) as
          | UsersAnalyticsResponse
          | { error?: string };

        console.info(
          '[Users Analytics] Response:',
          response.status,
          response.statusText,
        );

        if (!response.ok) {
          const message =
            'error' in payload && payload.error
              ? payload.error
              : `Users analytics request failed (${response.status}).`;
          throw new Error(message);
        }

        if (
          !('success' in payload) ||
          !payload.success ||
          !payload.data ||
          !Array.isArray(payload.data.users) ||
          !Array.isArray(payload.data.dailyUsers)
        ) {
          throw new Error('Invalid users analytics response.');
        }

        if (!isMounted) return;

        setUsers(payload.data.users);
        setDailyUsers(payload.data.dailyUsers);
        setTotalUsers(Number(payload.data.totalUsers ?? 0));
        setNewUsers(Number(payload.data.newUsers ?? 0));
        setActiveUsers(Number(payload.data.activeUsers ?? 0));
        setError(null);
      } catch (err) {
        if (!isMounted) return;

        console.error('[Users Analytics] Fetch failed:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Something went wrong while loading users analytics.',
        );
        setUsers([]);
        setDailyUsers([]);
        setTotalUsers(0);
        setNewUsers(0);
        setActiveUsers(0);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchUsers();

    return () => {
      // Ignore responses from an old project/page instance.
      isMounted = false;
    };
  }, [projectId]);

  // Fetch live user activity every 5 seconds

  useEffect(() => {

    const controller = new AbortController();

    let isFetching = false;

    async function fetchLiveActivity() {

      if (isFetching || controller.signal.aborted) return;

      isFetching = true;

      try {

        const params = new URLSearchParams();

        if (projectId && projectId !== 'All') {

          params.set('projectId', projectId);

        }

        const endpoint = params.toString()

          ? `/api/analytics/users/activity?${params.toString()}`

          : '/api/analytics/users/activity';

        const response = await fetch(endpoint, {

          method: 'GET',

          cache: 'no-store',

          signal: controller.signal,

        });

        const result =

          (await response.json()) as LiveActivityResponse;

        if (!response.ok || !result.success || !result.data) {

          throw new Error(

            'Unable to fetch live user activity.',

          );

        }

        setLiveData(result.data);

        setLiveError(null);

      } catch (err) {

        if (err instanceof Error && err.name === 'AbortError') {

          return;

        }

        setLiveError(

          err instanceof Error

            ? err.message

            : 'Live activity unavailable.',

        );

      } finally {

        isFetching = false;

        if (!controller.signal.aborted) {

          setLiveLoading(false);

        }

      }

    }

    fetchLiveActivity();

    const intervalId = setInterval(fetchLiveActivity, 5000);

    return () => {

      controller.abort();

      if (intervalId) {

        clearInterval(intervalId);

      }

    };

  }, [projectId]);

  // Fetch and auto-refresh the selected user's complete journey page.

  useEffect(() => {

    if (!selectedUser?.id) {

      void Promise.resolve().then(() => {
        setJourneyData(null);
        setJourneyError(null);
        setJourneyLoading(false);
      });

      return;

    }

    const controller = new AbortController();

    let isFetching = false;

    let firstRequest = true;

    async function fetchJourney() {

      if (isFetching || controller.signal.aborted) return;

      isFetching = true;

      if (firstRequest) setJourneyLoading(true);

      try {

        const params = new URLSearchParams({

          userId: selectedUser!.id,

          page: String(journeyPage),

          limit: '100',

        });

        if (projectId && projectId !== 'All') params.set('projectId', projectId);

        if (journeySessionId !== 'All') params.set('sessionId', journeySessionId);

        const response = await fetch(

          `/api/analytics/users/journey?${params.toString()}`,

          { method: 'GET', cache: 'no-store', signal: controller.signal },

        );

        const result = (await response.json()) as JourneyResponse & { error?: string };

        if (!response.ok || !result.success || !result.data) {

          throw new Error(result.error || 'Unable to load user journey.');

        }

        setJourneyData(result.data);

        setJourneyError(null);

      } catch (err) {

        if (err instanceof Error && err.name === 'AbortError') return;

        setJourneyError(err instanceof Error ? err.message : 'User journey unavailable.');

      } finally {

        firstRequest = false;

        isFetching = false;

        if (!controller.signal.aborted) setJourneyLoading(false);

      }

    }

    fetchJourney();

    const intervalId = setInterval(fetchJourney, 10000);

    return () => {

      controller.abort();

      if (intervalId) clearInterval(intervalId);

    };

  }, [selectedUser?.id, projectId, journeySessionId, journeyPage]);

  // Convert daily users into chart data

  const userGrowthChart = useMemo(() => {

    return dailyUsers.map((item) => ({

      date: item.date,

      label: new Date(`${item.date}T00:00:00`).toLocaleDateString(

        'en-IN',

        {

          day: '2-digit',

          month: 'short',

        },

      ),

      value: item.count,

    }));

  }, [dailyUsers]);

  // Search, status filter, and sorting

  const filteredUsers = useMemo(() => {

    const searchValue = search.toLowerCase().trim();

    return [...users]

      .filter((user) => {

        const matchSearch =

          user.name.toLowerCase().includes(searchValue) ||

          user.email.toLowerCase().includes(searchValue) ||

          user.id.toLowerCase().includes(searchValue);

        const matchStatus =

          statusFilter === 'All' || user.status === statusFilter;

        return matchSearch && matchStatus;

      })

      .sort((a, b) => {

        if (sortField === 'name') {

          return sortAsc

            ? a.name.localeCompare(b.name)

            : b.name.localeCompare(a.name);

        }

        const valueA = a[sortField];

        const valueB = b[sortField];

        return sortAsc ? valueA - valueB : valueB - valueA;

      });

  }, [users, search, statusFilter, sortField, sortAsc]);

  function handleSort(field: SortField) {

    if (sortField === field) {

      setSortAsc((previous) => !previous);

    } else {

      setSortField(field);

      setSortAsc(false);

    }

  }

  function formatNumber(value: number) {

    return value.toLocaleString('en-IN');

  }

  function formatDate(value: string) {

    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleDateString('en-IN', {

      day: '2-digit',

      month: 'short',

      year: 'numeric',

    });

  }

  function formatDateTime(value: string) {

    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleString('en-IN', {

      day: '2-digit',

      month: 'short',

      year: 'numeric',

      hour: '2-digit',

      minute: '2-digit',

    });

  }

  function getInitials(name: string) {

    return name

      .split(' ')

      .filter(Boolean)

      .map((part) => part[0])

      .join('')

      .slice(0, 2)

      .toUpperCase();

  }

  return (

    <div className="space-y-6">

      {/* Page Title */}

      <div>

        <h1 className="text-xl font-bold tracking-tight text-white">

          Users &amp; Cohorts

        </h1>

        <p className="mt-1 text-xs text-slate-400">

          Inspect identified user profiles, individual user journeys,

          session histories, and timelines.

        </p>

      </div>

      {/* Live User Activity */}

      <Card className="space-y-5 p-5">

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

          <div>

            <div className="flex items-center gap-2">

              <Radio className="h-4 w-4 text-emerald-400" />

              <h2 className="text-base font-semibold text-white">

                Live User Activity

              </h2>

              <Badge variant="success">LIVE</Badge>

            </div>

            <p className="mt-1 text-xs text-slate-400">

              User activity recorded during the last 5 minutes.

            </p>

          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">

            <RefreshCw

              className={`h-3.5 w-3.5 ${

                liveLoading ? 'animate-spin' : ''

              }`}

            />

            Auto-refresh every 5 seconds

          </div>

        </div>

        {liveError && (

          <p className="text-xs text-rose-400">{liveError}</p>

        )}

        {/* Live KPI Cards */}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

          {[

            {

              label: 'Active Users',

              value: liveData?.activeUsers ?? 0,

              icon: Users,

              color: 'text-emerald-400',

            },

            {

              label: 'Active Sessions',

              value: liveData?.activeSessions ?? 0,

              icon: Monitor,

              color: 'text-indigo-400',

            },

            {

              label: 'Total Activities',

              value: liveData?.totalActivities ?? 0,

              icon: Activity,

              color: 'text-blue-400',

            },

            {

              label: 'Countries',

              value: liveData?.uniqueCountries ?? 0,

              icon: Globe2,

              color: 'text-amber-400',

            },

          ].map((item) => {

            const Icon = item.icon;

            return (

              <div

                key={item.label}

                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"

              >

                <div className="flex items-center justify-between">

                  <span className="text-xs text-slate-400">

                    {item.label}

                  </span>

                  <Icon className={`h-4 w-4 ${item.color}`} />

                </div>

                <p className="mt-2 text-2xl font-bold text-white">

                  {liveLoading

                    ? '—'

                    : formatNumber(item.value)}

                </p>

              </div>

            );

          })}

        </div>

        {/* Recent Activity Feed */}

        <div>

          <div className="mb-3 flex items-center justify-between">

            <h3 className="text-sm font-semibold text-white">

              Recent Activity Feed

            </h3>

            <span className="text-[11px] text-slate-500">

              Last 50 activities

            </span>

          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-800">

            {!liveData?.activities.length ? (

              <div className="p-8 text-center text-xs text-slate-400">

                {liveLoading

                  ? 'Loading live activity...'

                  : 'No recent user activity in the last 5 minutes.'}

              </div>

            ) : (

              <div className="divide-y divide-slate-800/70">

                {liveData.activities.map((item) => (

                  <div

                    key={item.id}

                    className="flex flex-col gap-2 p-3 transition-colors hover:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between"

                  >

                    <div className="flex min-w-0 items-start gap-3">

                      <div className="mt-0.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-2">

                        <Activity className="h-4 w-4 text-indigo-400" />

                      </div>

                      <div className="min-w-0">

                        <p className="text-xs font-semibold text-white">

                          {item.eventName}

                        </p>

                        <p className="mt-1 truncate font-mono text-[10px] text-slate-400">

                          User: {item.userId}

                        </p>

                        <p className="mt-1 truncate text-[11px] text-indigo-300">

                          {item.pageUrl || 'No page URL'}

                        </p>

                        <p className="mt-1 text-[10px] text-slate-500">

                          {item.projectName} · {item.country} ·{' '}

                          {item.device} · {item.browser}

                        </p>

                      </div>

                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-500">

                      <Clock3 className="h-3 w-3" />

                      {formatDateTime(item.timestamp)}

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        </div>

      </Card>

      {/* Existing KPI Cards */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <Card className="p-4">

          <div className="flex items-center justify-between">

            <span className="text-xs font-medium text-slate-400">

              Total Users

            </span>

            <Users className="h-4 w-4 text-indigo-400" />

          </div>

          <div className="mt-2 text-2xl font-bold text-white">

            {loading ? '—' : formatNumber(totalUsers)}

          </div>

          <div className="mt-1 text-[11px] text-slate-400">

            Identified users in the last 30 days

          </div>

        </Card>

        <Card className="p-4">

          <div className="flex items-center justify-between">

            <span className="text-xs font-medium text-slate-400">

              New Users

            </span>

            <UserPlus className="h-4 w-4 text-emerald-400" />

          </div>

          <div className="mt-2 text-2xl font-bold text-white">

            {loading ? '—' : formatNumber(newUsers)}

          </div>

          <div className="mt-1 text-[11px] text-slate-400">

            First seen in the selected period

          </div>

        </Card>

        <Card className="p-4">

          <div className="flex items-center justify-between">

            <span className="text-xs font-medium text-slate-400">

              Returning Users

            </span>

            <UserCheck className="h-4 w-4 text-blue-400" />

          </div>

          <div className="mt-2 text-2xl font-bold text-white">

            {loading

              ? '—'

              : formatNumber(Math.max(totalUsers - newUsers, 0))}

          </div>

          <div className="mt-1 text-[11px] text-slate-400">

            Users seen before this period

          </div>

        </Card>

        <Card className="p-4">

          <div className="flex items-center justify-between">

            <span className="text-xs font-medium text-slate-400">

              Active Users

            </span>

            <Activity className="h-4 w-4 text-indigo-400" />

          </div>

          <div className="mt-2 text-2xl font-bold text-white">

            {loading ? '—' : formatNumber(activeUsers)}

          </div>

          <div className="mt-1 text-[11px] text-slate-400">

            Active in the last 30 days

          </div>

        </Card>

      </div>

      {/* User Growth Chart */}

      <Card className="p-6">

        <CardHeader>

          <div>

            <CardTitle>Active User Growth Trend</CardTitle>

            <CardDescription>

              Daily unique users with activity during the past 30 days

            </CardDescription>

          </div>

          <Badge variant="neutral">Last 30 Days</Badge>

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

              data={userGrowthChart}

              color="#6366f1"

              height={220}

            />

          )}

        </div>

      </Card>

      {/* Users Table */}

      <Card className="overflow-hidden p-0">

        {/* Filter bar */}

        <div className="flex flex-col items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/40 p-4 sm:flex-row">

          <div className="flex w-full items-center gap-2 sm:w-auto">

            <div className="relative w-full flex-1 sm:w-64">

              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

              <input

                type="text"

                placeholder="Search by name, email, or user ID..."

                value={search}

                onChange={(event) => setSearch(event.target.value)}

                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"

              />

            </div>

            <select

              value={statusFilter}

              onChange={(event) => setStatusFilter(event.target.value)}

              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"

            >

              <option value="All">All Statuses</option>

              <option value="active">Active</option>

              <option value="inactive">Inactive</option>

              <option value="churned">Churned</option>

            </select>

          </div>

          <div className="text-xs text-slate-400">

            Click any user to view their event journey

          </div>

        </div>

        {/* Table */}

        <div className="overflow-x-auto">

          <table className="w-full text-left text-xs">

            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">

              <tr>

                <th

                  onClick={() => handleSort('name')}

                  className="cursor-pointer px-4 py-3 font-semibold hover:text-white"

                >

                  <div className="flex items-center gap-1.5">

                    User

                    <ArrowUpDown className="h-3 w-3" />

                  </div>

                </th>

                <th className="hidden px-4 py-3 font-semibold md:table-cell">

                  User ID

                </th>

                <th className="hidden px-4 py-3 font-semibold sm:table-cell">

                  Country

                </th>

                <th className="hidden px-4 py-3 font-semibold lg:table-cell">

                  First Seen

                </th>

                <th className="px-4 py-3 font-semibold">

                  Last Active

                </th>

                <th

                  onClick={() => handleSort('totalEvents')}

                  className="cursor-pointer px-4 py-3 text-right font-semibold hover:text-white"

                >

                  <div className="flex items-center justify-end gap-1.5">

                    Events

                    <ArrowUpDown className="h-3 w-3" />

                  </div>

                </th>

                <th

                  onClick={() => handleSort('sessionsCount')}

                  className="hidden cursor-pointer px-4 py-3 text-right font-semibold hover:text-white sm:table-cell"

                >

                  <div className="flex items-center justify-end gap-1.5">

                    Sessions

                    <ArrowUpDown className="h-3 w-3" />

                  </div>

                </th>

                <th className="px-4 py-3 text-center font-semibold">

                  Status

                </th>

              </tr>

            </thead>

            <tbody className="divide-y divide-slate-800/60">

              {loading ? (

                <tr>

                  <td

                    colSpan={8}

                    className="px-4 py-12 text-center text-slate-400"

                  >

                    Loading users analytics...

                  </td>

                </tr>

              ) : error ? (

                <tr>

                  <td

                    colSpan={8}

                    className="px-4 py-12 text-center text-rose-400"

                  >

                    {error}

                  </td>

                </tr>

              ) : filteredUsers.length === 0 ? (

                <tr>

                  <td

                    colSpan={8}

                    className="px-4 py-12 text-center text-slate-400"

                  >

                    {search

                      ? 'No users match your search.'

                      : 'No user events found for the selected period.'}

                  </td>

                </tr>

              ) : (

                filteredUsers.map((user) => (

                  <tr

                    key={user.id}

                    onClick={() => {

                      setJourneyPage(1);

                      setJourneySessionId('All');

                      setSelectedUser(user);

                    }}

                    className="group cursor-pointer transition-colors hover:bg-slate-800/40"

                  >

                    <td className="px-4 py-3">

                      <div className="flex items-center gap-3">

                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-bold text-indigo-300">

                          {getInitials(user.name)}

                        </div>

                        <div>

                          <div className="font-semibold text-white transition-colors group-hover:text-indigo-300">

                            {user.name}

                          </div>

                          <div className="text-[11px] text-slate-400">

                            {user.email}

                          </div>

                        </div>

                      </div>

                    </td>

                    <td className="hidden px-4 py-3 font-mono text-[11px] text-slate-400 md:table-cell">

                      {user.id}

                    </td>

                    <td className="hidden px-4 py-3 text-slate-300 sm:table-cell">

                      {user.country}

                    </td>

                    <td className="hidden px-4 py-3 font-mono text-[11px] text-slate-400 lg:table-cell">

                      {formatDate(user.firstSeen)}

                    </td>

                    <td className="px-4 py-3 text-slate-300">

                      {formatDate(user.lastSeen)}

                    </td>

                    <td className="px-4 py-3 text-right font-mono font-semibold text-white">

                      {formatNumber(user.totalEvents)}

                    </td>

                    <td className="hidden px-4 py-3 text-right font-mono text-slate-300 sm:table-cell">

                      {formatNumber(user.sessionsCount)}

                    </td>

                    <td className="px-4 py-3 text-center">

                      <Badge

                        variant={

                          user.status === 'active'

                            ? 'success'

                            : user.status === 'inactive'

                              ? 'warning'

                              : 'destructive'

                        }

                        className="capitalize"

                      >

                        {user.status}

                      </Badge>

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

            Showing {filteredUsers.length} of {users.length} users

          </div>

        )}

      </Card>

      {/* User Details SlideOver */}

      {selectedUser && (

        <SlideOver

          isOpen={!!selectedUser}

          onClose={() => {

            setSelectedUser(null);

            setJourneyPage(1);

            setJourneySessionId('All');

          }}

          title={selectedUser.name}

          subtitle={`User ID: ${selectedUser.id} • ${selectedUser.email}`}

          width="max-w-2xl"

        >

          <div className="space-y-6">

            {/* User Overview Stats */}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">

                <div className="text-[10px] font-semibold uppercase text-slate-500">

                  Total Events

                </div>

                <div className="mt-1 text-lg font-bold text-white">

                  {formatNumber(selectedUser.totalEvents)}

                </div>

              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">

                <div className="text-[10px] font-semibold uppercase text-slate-500">

                  Sessions

                </div>

                <div className="mt-1 text-lg font-bold text-white">

                  {formatNumber(selectedUser.sessionsCount)}

                </div>

              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">

                <div className="text-[10px] font-semibold uppercase text-slate-500">

                  Location

                </div>

                <div className="mt-1 truncate text-sm font-semibold text-white">

                  {selectedUser.country}

                </div>

              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">

                <div className="text-[10px] font-semibold uppercase text-slate-500">

                  Device

                </div>

                <div className="mt-1 truncate text-sm font-semibold text-white">

                  {selectedUser.device}

                </div>

              </div>

            </div>

            {/* Top Visited Pages */}

            <div>

              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">

                Top Visited Pages

              </h4>

              <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-900/60">

                {selectedUser.topPages.length === 0 ? (

                  <div className="p-3 text-xs text-slate-400">

                    No page visits available.

                  </div>

                ) : (

                  selectedUser.topPages.map((page) => (

                    <div

                      key={page.url}

                      className="flex items-center justify-between gap-3 p-2.5 text-xs"

                    >

                      <span className="truncate font-mono text-indigo-300">

                        {page.url}

                      </span>

                      <span className="shrink-0 text-slate-400">

                        {formatNumber(page.visits)} visits

                      </span>

                    </div>

                  ))

                )}

              </div>

            </div>

            {/* Activity Timeline */}

            <div>

              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">

                Lifecycle Activity Timeline

              </h4>

              <div className="relative space-y-3 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-0.5 before:bg-slate-800">

                {selectedUser.timeline.map((item) => (

                  <div key={item.id} className="relative text-xs">

                    <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full border-2 border-indigo-500 bg-[#0B0F19]" />

                    <div className="font-medium text-slate-200">

                      {item.action}

                    </div>

                    <div className="mt-0.5 text-[11px] text-slate-500">

                      {formatDateTime(item.timestamp)}

                    </div>

                  </div>

                ))}

              </div>

            </div>

            {/* Recent Events */}

            <div>

              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">

                Recent Ingested Events

              </h4>

              <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-[#070A10] p-3 font-mono text-xs">

                {selectedUser.recentEvents.length === 0 ? (

                  <div className="py-2 text-slate-400">

                    No recent events available.

                  </div>

                ) : (

                  selectedUser.recentEvents.map((event) => (

                    <div

                      key={event.id}

                      className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"

                    >

                      <div className="min-w-0">

                        <span className="font-bold text-indigo-400">

                          {event.name}

                        </span>

                        <span className="ml-2 text-slate-500">

                          page: {event.page}

                        </span>

                      </div>

                      <span className="shrink-0 text-[10px] text-slate-500">

                        {formatDateTime(event.timestamp)}

                      </span>

                    </div>

                  ))

                )}

              </div>

            </div>

            {/* Real-Time User Journey */}

            <section className="space-y-4 border-t border-slate-800 pt-5">

              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">

                <div>

                  <div className="flex items-center gap-2">

                    <Activity className="h-4 w-4 text-emerald-400" />

                    <h4 className="text-sm font-semibold text-white">Real-Time User Journey</h4>

                    <Badge variant="success">AUTO REFRESH</Badge>

                  </div>

                  <p className="mt-1 text-[11px] text-slate-500">Complete event history, page navigation and session context. Refreshes every 10 seconds.</p>

                </div>

                <select

                  value={journeySessionId}

                  onChange={(event) => { setJourneySessionId(event.target.value); setJourneyPage(1); }}

                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"

                >

                  <option value="All">All sessions</option>

                  {(journeyData?.sessions ?? []).map((session) => (

                    <option key={session.sessionId} value={session.sessionId}>

                      {session.sessionId.slice(0, 18)}… ({session.eventCount} events)

                    </option>

                  ))}

                </select>

              </div>

              {journeyError && <p className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-400">{journeyError}</p>}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

                {[

                  { label: 'Total Events', value: journeyData?.user.totalEvents ?? selectedUser.totalEvents },

                  { label: 'Total Sessions', value: journeyData?.user.totalSessions ?? selectedUser.sessionsCount },

                  { label: 'Pages Visited', value: journeyData?.user.totalPagesVisited ?? selectedUser.topPages.length },

                ].map((item) => (

                  <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">

                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>

                    <p className="mt-1 text-xl font-bold text-white">{formatNumber(item.value)}</p>

                  </div>

                ))}

              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">

                <div className="mb-3 flex items-center justify-between">

                  <h5 className="text-xs font-semibold text-white">Session Overview</h5>

                  <span className="text-[10px] text-slate-500">{journeyData?.sessions.length ?? 0} sessions in loaded events</span>

                </div>

                {!journeyData?.sessions.length ? (

                  <p className="text-xs text-slate-500">{journeyLoading ? 'Loading sessions…' : 'No session summary available for this result page.'}</p>

                ) : (

                  <div className="space-y-2">

                    {journeyData.sessions.map((session) => (

                      <button key={session.sessionId} type="button" onClick={() => { setJourneySessionId(session.sessionId); setJourneyPage(1); }} className={`flex w-full flex-col gap-1 rounded-lg border p-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${journeySessionId === session.sessionId ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/50'}`}>

                        <span className="min-w-0 truncate font-mono text-[10px] text-indigo-300">{session.sessionId}</span>

                        <span className="text-[10px] text-slate-400">{session.eventCount} events · {session.uniquePages} pages · {formatDateTime(session.startedAt)}</span>

                      </button>

                    ))}

                  </div>

                )}

              </div>

              <div>

                <div className="mb-3 flex items-center justify-between">

                  <h5 className="text-xs font-semibold text-white">Event Timeline</h5>

                  <span className="text-[10px] text-slate-500">{journeyData?.pagination.totalEvents ?? 0} matching events</span>

                </div>

                {journeyLoading && !journeyData ? (

                  <div className="rounded-lg border border-slate-800 p-8 text-center text-xs text-slate-400">Loading user journey…</div>

                ) : !journeyData?.events.length ? (

                  <div className="rounded-lg border border-slate-800 p-8 text-center text-xs text-slate-400">No events found for this user and session.</div>

                ) : (

                  <div className="relative space-y-3 pl-5 before:absolute before:bottom-3 before:left-[5px] before:top-2 before:w-px before:bg-slate-700">

                    {journeyData.events.map((event) => (

                      <article key={event.id} className="relative rounded-lg border border-slate-800 bg-slate-900/60 p-3">

                        <span className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-indigo-400 bg-[#0B0F19]" />

                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">

                          <div className="min-w-0">

                            <p className="text-xs font-semibold text-white">{event.eventName}</p>

                            {event.pageUrl && (

                              <a href={event.pageUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-indigo-300 hover:text-indigo-200">

                                <span className="truncate">{event.pageUrl}</span><ExternalLink className="h-3 w-3 shrink-0" />

                              </a>

                            )}

                          </div>

                          <time className="shrink-0 text-[10px] text-slate-500">{formatDateTime(event.timestamp)}</time>

                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">

                          <span className="rounded bg-slate-800 px-2 py-1">{event.device}</span>

                          <span className="rounded bg-slate-800 px-2 py-1">{event.browser}</span>

                          <span className="rounded bg-slate-800 px-2 py-1">{event.country}</span>

                          <span className="rounded bg-slate-800 px-2 py-1">{event.projectName}</span>

                        </div>

                        {event.sessionId && <p className="mt-2 break-all font-mono text-[9px] text-slate-600">Session: {event.sessionId}</p>}

                        {event.properties !== null && event.properties !== undefined && (

                          <details className="mt-2">

                            <summary className="cursor-pointer text-[10px] text-indigo-300 hover:text-indigo-200">View event properties</summary>

                            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-[#070A10] p-3 text-[10px] text-slate-300">{JSON.stringify(event.properties, null, 2)}</pre>

                          </details>

                        )}

                      </article>

                    ))}

                  </div>

                )}

              </div>

              {journeyData?.pagination && (

                <div className="flex flex-col justify-between gap-3 border-t border-slate-800 pt-3 sm:flex-row sm:items-center">

                  <p className="text-[10px] text-slate-500">Page {journeyData.pagination.page} of {Math.max(journeyData.pagination.totalPages, 1)} · Showing {journeyData.events.length} events</p>

                  <div className="flex items-center gap-2">

                    <button type="button" disabled={!journeyData.pagination.hasPreviousPage} onClick={() => setJourneyPage((page) => Math.max(1, page - 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>

                    <button type="button" disabled={!journeyData.pagination.hasNextPage} onClick={() => setJourneyPage((page) => page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>

                  </div>

                </div>

              )}

            </section>

          </div>

        </SlideOver>

      )}

    </div>

  );

}