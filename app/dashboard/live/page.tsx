'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Play,
  Pause,
  Trash2,
  Search,
  Activity,
  Layers,
  ChevronRight,
  Sparkles,
  RefreshCw,
  ChevronDown,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'disconnected'
  | 'paused';

type LiveEvent = {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  project: string;
  timestamp: string;
  relativeTime: string;
  type: 'track' | 'page' | 'identify';
  status: 'success' | 'warn' | 'error';
  properties: Record<string, unknown>;
  projectId: string;
};

type ApiEvent = {
  id: string | number | bigint;
  eventName: string;
  externalUserId?: string | null;
  occurredAt: string | Date;
  properties?: unknown;
  projectId?: string;
  projectName?: string;
};

type LiveApiResponse = {
  success?: boolean;
  data?: {
    events?: ApiEvent[];
  };
  error?: string;
};

type Project = {
  id: string;
  name: string;
};

function getRelativeTime(value: string | Date): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 'Unknown time';
  }

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000)
  );

  if (seconds < 60) {
    return seconds <= 5 ? 'Just now' : `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function inferEventType(
  name: string
): LiveEvent['type'] {
  const normalized = name.toLowerCase();

  if (
    normalized === 'identify' ||
    normalized.startsWith('identify_')
  ) {
    return 'identify';
  }

  if (
    normalized === 'page_view' ||
    normalized.startsWith('page_')
  ) {
    return 'page';
  }

  return 'track';
}

function normalizeProperties(
  value: unknown
): Record<string, unknown> {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function normalizeEvent(event: ApiEvent): LiveEvent {
  const occurredAt = String(event.occurredAt);

  return {
    id: String(event.id),
    name: event.eventName,
    userId: event.externalUserId || 'Anonymous',
    userEmail: '',
    project: event.projectName || 'Unknown Project',
    timestamp: occurredAt,
    relativeTime: getRelativeTime(occurredAt),
    type: inferEventType(event.eventName),
    status: 'success',
    properties: normalizeProperties(event.properties),
    projectId: event.projectId || '',
  };
}

export default function LiveEventsPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('All');
  const [selectedType, setSelectedType] = useState('All');

  const [expandedEventId, setExpandedEventId] =
    useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');

  // Live analytics derived from the events currently held in the 40-event buffer.
  const analytics = useMemo(() => {
    const now = lastUpdated?.getTime() ?? 0;

    const lastTenSeconds = events.filter((event) => {
      const timestamp = new Date(event.timestamp).getTime();
      return Number.isFinite(timestamp) && now - timestamp <= 10_000;
    });

    const activeUsers = new Set(
      events
        .filter((event) => {
          const timestamp = new Date(event.timestamp).getTime();
          return (
            Number.isFinite(timestamp) &&
            now - timestamp <= 5 * 60_000 &&
            event.userId !== 'Anonymous'
          );
        })
        .map((event) => event.userId)
    );

    return {
      totalEvents: events.length,
      eventsPerSecond: lastTenSeconds.length / 10,
      activeUsers: activeUsers.size,
      distribution: {
        track: events.filter((event) => event.type === 'track').length,
        page: events.filter((event) => event.type === 'page').length,
        identify: events.filter((event) => event.type === 'identify').length,
      },
    };
  }, [events, lastUpdated]);

  // Twelve 5-second buckets make up the last 60 seconds of activity.
  const activityData = useMemo(() => {
    const now = lastUpdated?.getTime() ?? 0;
    const buckets = Array.from({ length: 12 }, (_, index) => ({
      label: `${(11 - index) * 5}s`,
      count: 0,
    }));

    events.forEach((event) => {
      const timestamp = new Date(event.timestamp).getTime();
      if (!Number.isFinite(timestamp)) return;

      const ageInSeconds = Math.floor((now - timestamp) / 1000);
      const bucketIndex = Math.floor(ageInSeconds / 5);

      if (bucketIndex >= 0 && bucketIndex < 12) {
        const targetBucket = buckets[11 - bucketIndex];
        if (targetBucket) {
          targetBucket.count += 1;
        }
      }
    });

    return buckets;
  }, [events, lastUpdated]);

  const maxActivity = Math.max(
    1,
    ...activityData.map((bucket) => bucket.count)
  );

  // Fetch projects.
  useEffect(() => {
    let active = true;

    async function fetchProjects() {
      try {
        const response = await fetch('/api/projects', {
          cache: 'no-store',
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || 'Failed to fetch projects'
          );
        }

        if (active) {
          setProjects(result.projects ?? []);
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      }
    }

    void fetchProjects();

    return () => {
      active = false;
    };
  }, []);

  // Manual refresh using JSON endpoint.
  const fetchLiveEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams({
        limit: '40',
      });

      if (selectedProject !== 'All') {
        queryParams.set('projectId', selectedProject);
      }

      const response = await fetch(
        `/api/analytics/live?${queryParams.toString()}`,
        {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        }
      );

      const result =
        (await response.json()) as LiveApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error || 'Failed to load live events.'
        );
      }

      const normalizedEvents = (
        result.data?.events ?? []
      ).map(normalizeEvent);

      setEvents((current) => {
        const merged = new Map<string, LiveEvent>();

        [...normalizedEvents, ...current].forEach((event) => {
          if (!merged.has(event.id)) {
            merged.set(event.id, event);
          }
        });

        return Array.from(merged.values())
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() -
              new Date(a.timestamp).getTime()
          )
          .slice(0, 40);
      });

      setLastUpdated(new Date());
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'Unable to load live events.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  // Sync connection status when streaming is paused.
  useEffect(() => {
    if (!isStreaming) {
      void Promise.resolve().then(() => setConnectionStatus('paused'));
    }
  }, [isStreaming]);

  // SSE connection.
  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    let active = true;
    let hasConnected = false;

    void Promise.resolve().then(() => {
      if (!active) return;
      setConnectionStatus('connecting');
      setIsLoading(true);
      setError(null);
    });

    const queryParams = new URLSearchParams({
      stream: 'true',
      limit: '40',
    });

    if (selectedProject !== 'All') {
      queryParams.set('projectId', selectedProject);
    }

    const eventSource = new EventSource(
      `/api/analytics/live?${queryParams.toString()}`
    );

    eventSource.onopen = () => {
      if (!active) return;

      hasConnected = true;

      setConnectionStatus('connected');
      setError(null);
    };

    eventSource.onmessage = (message) => {
      if (!active) return;

      try {
        const result = JSON.parse(
          message.data
        ) as LiveApiResponse;

        if (!result.success || !result.data?.events) {
          return;
        }

        const normalizedEvents =
          result.data.events.map(normalizeEvent);

        if (normalizedEvents.length > 0) {
          setEvents((current) => {
            const merged = new Map<string, LiveEvent>();

            [...normalizedEvents, ...current].forEach(
              (event) => {
                if (!merged.has(event.id)) {
                  merged.set(event.id, event);
                }
              }
            );

            return Array.from(merged.values())
              .sort(
                (a, b) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime()
              )
              .slice(0, 40);
          });
        }

        setLastUpdated(new Date());
        setIsLoading(false);
        setError(null);
      } catch (parseError) {
        console.error(
          'Failed to parse SSE event:',
          parseError
        );
      }
    };

    eventSource.onerror = () => {
      if (!active) return;

      if (eventSource.readyState === EventSource.CONNECTING) {
        setConnectionStatus(
          hasConnected ? 'reconnecting' : 'connecting'
        );
      } else if (
        eventSource.readyState === EventSource.CLOSED
      ) {
        setConnectionStatus('disconnected');
        setError('Live connection closed. Please reconnect.');
        setIsLoading(false);
      }
    };

    return () => {
      active = false;
      eventSource.close();
      setConnectionStatus('disconnected');
    };
  }, [isStreaming, selectedProject]);

  // Relative time refresh.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setEvents((current) =>
        current.map((event) => ({
          ...event,
          relativeTime: getRelativeTime(event.timestamp),
        }))
      );
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // Filter events.
  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return events.filter((event) => {
      const matchesSearch =
        !query ||
        event.name.toLowerCase().includes(query) ||
        event.userId.toLowerCase().includes(query) ||
        event.userEmail.toLowerCase().includes(query);

      const matchesProject =
        selectedProject === 'All' ||
        event.projectId === selectedProject;

      const matchesType =
        selectedType === 'All' ||
        event.type === selectedType;

      return (
        matchesSearch &&
        matchesProject &&
        matchesType
      );
    });
  }, [
    events,
    searchQuery,
    selectedProject,
    selectedType,
  ]);

  const handleClear = () => {
    setEvents([]);
    setExpandedEventId(null);
  };

  const handleResume = () => {
    setIsStreaming(true);
  };

  const handlePause = () => {
    setIsStreaming(false);
  };

  const handleManualRefresh = () => {
    void fetchLiveEvents();
  };

  const connectionLabel: Record<ConnectionStatus, string> = {
    connected: 'LIVE CONNECTED',
    connecting: 'CONNECTING',
    reconnecting: 'RECONNECTING',
    disconnected: 'DISCONNECTED',
    paused: 'STREAM PAUSED',
  };

  const connectionVariant: Record<
    ConnectionStatus,
    'success' | 'warning' | 'neutral'
  > = {
    connected: 'success',
    connecting: 'warning',
    reconnecting: 'warning',
    disconnected: 'neutral',
    paused: 'warning',
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Live Event Stream
            </h1>

            <Badge
              variant={connectionVariant[connectionStatus]}
              className={
                connectionStatus === 'connected'
                  ? 'animate-pulse'
                  : ''
              }
            >
              {connectionLabel[connectionStatus]}
            </Badge>
          </div>

          <p className="mt-1 text-xs text-slate-400">
            Live analytics events from your tenant, delivered using SSE.
            {lastUpdated
              ? ` Last updated ${getRelativeTime(lastUpdated)}.`
              : ''}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePause}
              className="gap-2"
            >
              <Pause className="h-3.5 w-3.5 text-amber-400" />
              <span>Pause Stream</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleResume}
              className="gap-2"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Resume Stream</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="gap-1.5 text-slate-400 hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            className="gap-1.5"
            disabled={isLoading}
            aria-label="Refresh live events"
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5',
                isLoading && 'animate-spin'
              )}
            />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Connection information */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        {connectionStatus === 'connected' ? (
          <>
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            <span>Connected to live event stream</span>
          </>
        ) : connectionStatus === 'reconnecting' ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
            <span>Attempting to reconnect...</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3.5 w-3.5 text-slate-500" />
            <span>{connectionLabel[connectionStatus]}</span>
          </>
        )}
      </div>

      {/* Live Analytics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Total Events</span>
            <Activity className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tabular-nums">
            {analytics.totalEvents}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Events in current buffer
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Events Per Second</span>
            <RefreshCw className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tabular-nums">
            {analytics.eventsPerSecond.toFixed(2)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Average over the last 10 seconds
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Active Users</span>
            <Wifi className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tabular-nums">
            {analytics.activeUsers}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Unique identified users in last 5 minutes
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Stream Status</span>
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                connectionStatus === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-slate-500'
              )}
            />
          </div>
          <div className="mt-3 text-lg font-bold text-white">
            {connectionLabel[connectionStatus]}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Current SSE connection state
          </p>
        </Card>
      </div>

      {/* Activity chart and event distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-white">Real-time Activity</h3>
              <p className="text-xs text-slate-500 mt-1">
                Event activity over the last 60 seconds
              </p>
            </div>
            <Badge variant={connectionStatus === 'connected' ? 'success' : 'neutral'}>
              {connectionStatus === 'connected' ? 'LIVE' : 'BUFFER'}
            </Badge>
          </div>

          <div className="flex items-end gap-2 h-36">
            {activityData.map((bucket, index) => (
              <div
                key={index}
                className="flex-1 h-full min-w-0 flex flex-col justify-end items-center gap-2"
              >
                <div
                  className="w-full rounded-t-md bg-indigo-500/80 transition-all duration-500 min-h-[3px]"
                  style={{ height: `${Math.max(3, (bucket.count / maxActivity) * 100)}%` }}
                  title={`${bucket.count} events`}
                />
                <span className="text-[9px] text-slate-500">{bucket.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-right text-[10px] text-slate-500">
            {activityData.reduce((sum, bucket) => sum + bucket.count, 0)} events in this chart window
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">Event Type Distribution</h3>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Breakdown in current event buffer
          </p>

          {([
            { label: 'Track', value: analytics.distribution.track, color: 'bg-indigo-500' },
            { label: 'Page', value: analytics.distribution.page, color: 'bg-sky-500' },
            { label: 'Identify', value: analytics.distribution.identify, color: 'bg-emerald-500' },
          ] as const).map((item) => {
            const percentage = analytics.totalEvents > 0
              ? (item.value / analytics.totalEvents) * 100
              : 0;

            return (
              <div key={item.label} className="mb-5 last:mb-0">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="text-slate-400 tabular-nums">
                    {item.value} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', item.color)}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

            <input
              type="text"
              placeholder="Search by event or user ID..."
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Project filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">
              Project:
            </span>

            <select
              value={selectedProject}
              onChange={(event) =>
                setSelectedProject(event.target.value)
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="All">All Projects</option>

              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Event type filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">
              Type:
            </span>

            <select
              value={selectedType}
              onChange={(event) =>
                setSelectedType(event.target.value)
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"   
            >
              <option value="All">All Event Types</option>
              <option value="track">track</option>
              <option value="page">page</option>
              <option value="identify">identify</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Live stream */}
      <Card className="p-0 overflow-hidden">

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/50">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Buffer: {filteredEvents.length} Events captured
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              Click any event row to expand JSON payload properties
            </span>
          </div>
        </div>

        {error ? (
          <div className="py-10 px-5 text-center">
            <Activity className="mx-auto h-8 w-8 text-rose-400 mb-2" />

            <h4 className="text-sm font-semibold text-slate-300">
              Could not load live events
            </h4>

            <p className="mt-1 text-xs text-slate-500">
              {error}
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResume}
              className="mt-4"
            >
              Reconnect
            </Button>
          </div>
        ) : isLoading && events.length === 0 ? (
          <div className="py-16 text-center">
            <RefreshCw className="mx-auto h-8 w-8 text-slate-500 mb-2 animate-spin" />

            <h4 className="text-sm font-semibold text-slate-300">
              Connecting to live events…
            </h4>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-16 text-center">
            <Activity className="mx-auto h-8 w-8 text-slate-600 mb-2" />

            <h4 className="text-sm font-semibold text-slate-300">
              No events matched filters
            </h4>

            <p className="mt-1 text-xs text-slate-500">
              Wait for incoming telemetry or clear your active filters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredEvents.map((event) => {
              const isExpanded =
                expandedEventId === event.id;

              return (
                <div
                  key={event.id}
                  className="transition-colors hover:bg-slate-800/30"
                >
                  <div
                    onClick={() =>
                      setExpandedEventId(
                        isExpanded ? null : event.id
                      )
                    }
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer gap-2"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(keyEvent) => {
                      if (
                        keyEvent.key === 'Enter' ||
                        keyEvent.key === ' '
                      ) {
                        keyEvent.preventDefault();

                        setExpandedEventId(
                          isExpanded ? null : event.id
                        );
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-slate-400 p-0.5"
                        aria-label={
                          isExpanded
                            ? 'Collapse event'
                            : 'Expand event'
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-indigo-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>

                      <span
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          event.status === 'success'
                            ? 'bg-emerald-400'
                            : event.status === 'warn'
                              ? 'bg-amber-400'
                              : 'bg-rose-400'
                        )}
                      />

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-white">
                            {event.name}
                          </span>

                          <Badge
                            variant="neutral"
                            className="text-[10px] py-0 px-1.5 font-mono"
                          >
                            {event.type}
                          </Badge>
                        </div>

                        <div className="text-xs text-slate-400 mt-0.5">
                          {event.userId}

                          {event.userEmail ? (
                            <span className="text-slate-600">
                              {' '}({event.userEmail})
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 text-xs pl-7 sm:pl-0">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Layers className="h-3 w-3 text-indigo-400" />
                        <span>{event.project}</span>
                      </div>

                      <span className="font-mono text-slate-400">
                        {event.relativeTime}
                      </span>
                    </div>
                  </div>

                  {/* Event properties */}
                  {isExpanded && (
                    <div className="bg-[#070A10] px-6 py-4 border-t border-slate-800/90 text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase text-slate-400">
                          Telemetry Payload Properties
                        </span>

                        <span className="font-mono text-[10px] text-slate-400">
                          Timestamp: {event.timestamp}
                        </span>
                      </div>

                      <pre className="rounded-lg bg-slate-900/90 p-3 font-mono text-indigo-300 text-xs overflow-x-auto border border-slate-800">
                        {JSON.stringify(
                          event.properties,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
