'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Search,
  Activity,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

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
};

type LiveApiResponse = {
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
  if (!Number.isFinite(timestamp)) return 'Unknown time';

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return seconds <= 5 ? 'Just now' : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function inferEventType(name: string): LiveEvent['type'] {
  const normalized = name.toLowerCase();
  if (normalized === 'identify' || normalized.startsWith('identify_')) return 'identify';
  if (normalized === 'page_view' || normalized.startsWith('page_')) return 'page';
  return 'track';
}

function normalizeProperties(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export default function LiveEventsPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch("/api/projects", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to fetch projects");
        }

        setProjects(result.projects ?? []);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      }
    }

    fetchProjects();
  }, []);

  const fetchLiveEvents = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      const response = await fetch('/api/analytics/live?limit=40', {
        method: 'GET',
        cache: 'no-store',
        signal,
        headers: { Accept: 'application/json' },
      });

      const result = (await response.json()) as LiveApiResponse;
      if (!response.ok) {
        throw new Error(result.error || 'Failed to load live events.');
      }

      const apiEvents = result.data?.events ?? [];
      const normalizedEvents: LiveEvent[] = apiEvents.map((event) => {
        const occurredAt =
          event.occurredAt instanceof Date
            ? event.occurredAt.toISOString()
            : String(event.occurredAt);

        return {
          id: String(event.id),
          name: event.eventName,
          userId: event.externalUserId || 'Anonymous',
          userEmail: '',
          project: 'Tenant Events',
          timestamp: occurredAt,
          relativeTime: getRelativeTime(occurredAt),
          type: inferEventType(event.eventName),
          status: 'success',
          properties: normalizeProperties(event.properties),
        };
      });

      setEvents((current) => {
        // Keep events newest-first and de-duplicate by event ID.
        const merged = new Map<string, LiveEvent>();
        [...normalizedEvents, ...current].forEach((event) => {
          if (!merged.has(event.id)) merged.set(event.id, event);
        });
        return Array.from(merged.values())
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )
          .slice(0, 40);
      });
      setLastUpdated(new Date());
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') return;
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'Unable to load live events.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isStreaming) return;

    const controller = new AbortController();
    void fetchLiveEvents(controller.signal);

    // Poll the authenticated live-events endpoint while streaming is active.
    const intervalId = window.setInterval(() => {
      void fetchLiveEvents();
    }, 5000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [isStreaming, fetchLiveEvents]);

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return events.filter((event) => {
      const matchesSearch =
        !query ||
        event.name.toLowerCase().includes(query) ||
        event.userId.toLowerCase().includes(query) ||
        event.userEmail.toLowerCase().includes(query);

      const matchesProject =
        selectedProject === 'All' || event.project === selectedProject;
      const matchesType = selectedType === 'All' || event.type === selectedType;

      return matchesSearch && matchesProject && matchesType;
    });
  }, [events, searchQuery, selectedProject, selectedType]);

  const handleClear = () => {
    setEvents([]);
    setExpandedEventId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Live Event Stream
            </h1>
            {isStreaming ? (
              <Badge variant="success" className="animate-pulse">
                STREAMING ACTIVE
              </Badge>
            ) : (
              <Badge variant="warning">STREAM PAUSED</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Live analytics events from your tenant, refreshed automatically.
            {lastUpdated ? ` Last updated ${getRelativeTime(lastUpdated)}.` : ''}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant={isStreaming ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setIsStreaming((current) => !current)}
            className="gap-2"
          >
            {isStreaming ? (
              <>
                <Pause className="h-3.5 w-3.5 text-amber-400" />
                <span>Pause Stream</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Resume Stream</span>
              </>
            )}
          </Button>

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
            onClick={() => void fetchLiveEvents()}
            className="gap-1.5"
            disabled={isLoading}
            aria-label="Refresh live events"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by event or user ID..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">Project:</span>
            <select
              value={selectedProject}
              onChange={(event) => {
                setSelectedProject(event.target.value);
                setEvents([]);
              }}
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

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">Type:</span>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
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

      {/* Live Stream List */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/50">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Buffer: {filteredEvents.length} Events captured
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Click any event row to expand JSON payload properties</span>
          </div>
        </div>

        {error ? (
          <div className="py-10 px-5 text-center">
            <Activity className="mx-auto h-8 w-8 text-rose-400 mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">
              Could not load live events
            </h4>
            <p className="mt-1 text-xs text-slate-500">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchLiveEvents()}
              className="mt-4"
            >
              Try again
            </Button>
          </div>
        ) : isLoading && events.length === 0 ? (
          <div className="py-16 text-center">
            <RefreshCw className="mx-auto h-8 w-8 text-slate-500 mb-2 animate-spin" />
            <h4 className="text-sm font-semibold text-slate-300">
              Loading live events…
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
              const isExpanded = expandedEventId === event.id;

              return (
                <div key={event.id} className="transition-colors hover:bg-slate-800/30">
                  <div
                    onClick={() =>
                      setExpandedEventId(isExpanded ? null : event.id)
                    }
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer gap-2"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                        keyEvent.preventDefault();
                        setExpandedEventId(isExpanded ? null : event.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-slate-400 p-0.5"
                        aria-label={isExpanded ? 'Collapse event' : 'Expand event'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-indigo-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>

                      {/* Status dot */}
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          event.status === 'success'
                            ? 'bg-emerald-400'
                            : event.status === 'warn'
                              ? 'bg-amber-400'
                              : 'bg-rose-400',
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
                            <span className="text-slate-600"> ({event.userEmail})</span>
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

                  {/* Expandable JSON Properties Drawer */}
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
                        {JSON.stringify(event.properties, null, 2)}
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
