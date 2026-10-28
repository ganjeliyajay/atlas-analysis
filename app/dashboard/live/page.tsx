'use client';

import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Search,
  Filter,
  Activity,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { INITIAL_LIVE_EVENTS, PROJECTS } from '@/lib/dummy-data';
import { LiveEvent } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function LiveEventsPage() {
  const [events, setEvents] = useState<LiveEvent[]>(INITIAL_LIVE_EVENTS);
  const [isStreaming, setIsStreaming] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Simulated live event ingestion timer
  useEffect(() => {
    if (!isStreaming) return;

    const samplePool: {
      name: string;
      userId: string;
      userEmail: string;
      project: string;
      type: 'track' | 'page' | 'identify';
      status: 'success' | 'warn' | 'error';
      properties: Record<string, string | number | boolean | null>;
    }[] = [
      {
        name: 'page_view',
        userId: 'usr_sarah_88',
        userEmail: 'sarah.patel@acme-corp.com',
        project: 'HRMS Analytics',
        type: 'page',
        status: 'success',
        properties: { path: '/attendance', referrer: '/dashboard', viewport: '1920x1080' },
      },
      {
        name: 'button_clicked',
        userId: 'usr_marcus_41',
        userEmail: 'marcus.vance@techcorp.io',
        project: 'HRMS Analytics',
        type: 'track',
        status: 'success',
        properties: { element: '#punch-clock-btn', shift: 'morning', biometric: true },
      },
      {
        name: 'salary_slip_downloaded',
        userId: 'usr_elena_22',
        userEmail: 'elena.rostova@designhaus.co',
        project: 'HRMS Analytics',
        type: 'track',
        status: 'success',
        properties: { month: 'September 2026', format: 'PDF', file_size_kb: 412 },
      },
      {
        name: 'leave_applied',
        userId: 'usr_rahul_73',
        userEmail: 'rahul.sharma@innovate.org',
        project: 'HRMS Analytics',
        type: 'track',
        status: 'warn',
        properties: { type: 'Emergency Leave', days: 1, notice_hours: 4 },
      },
      {
        name: 'page_view',
        userId: 'usr_anon_331',
        userEmail: 'guest@gjtech.dev',
        project: 'GJ Tech Blog',
        type: 'page',
        status: 'success',
        properties: { path: '/posts/realtime-postgres-cdc', referrer: 'HackerNews' },
      },
    ];

    const interval = setInterval(() => {
      const randomTemplate = samplePool[Math.floor(Math.random() * samplePool.length)];
      const newEvent: LiveEvent = {
        id: `evt_sim_${Date.now()}`,
        name: randomTemplate.name,
        userId: randomTemplate.userId,
        userEmail: randomTemplate.userEmail,
        project: randomTemplate.project,
        timestamp: new Date().toISOString(),
        relativeTime: 'Just now',
        type: randomTemplate.type,
        status: randomTemplate.status,
        properties: randomTemplate.properties,
      };

      setEvents((prev) => [newEvent, ...prev.slice(0, 39)]);
    }, 4500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Filter events
  const filteredEvents = events.filter((evt) => {
    const matchesSearch =
      evt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      evt.userId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      evt.userEmail.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProject =
      selectedProject === 'All' || evt.project === selectedProject;

    const matchesType = selectedType === 'All' || evt.type === selectedType;

    return matchesSearch && matchesProject && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white">Live Event Stream</h1>
            {isStreaming ? (
              <Badge variant="success" className="animate-pulse">
                STREAMING ACTIVE
              </Badge>
            ) : (
              <Badge variant="warning">STREAM PAUSED</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Real-time simulated telemetry feed directly from connected apps and SDK clients.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant={isStreaming ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setIsStreaming(!isStreaming)}
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
            onClick={() => setEvents([])}
            className="gap-1.5 text-slate-400 hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
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
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">Project:</span>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="All">All Projects</option>
              {PROJECTS.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">Type:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
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

        {filteredEvents.length === 0 ? (
          <div className="py-16 text-center">
            <Activity className="mx-auto h-8 w-8 text-slate-600 mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">No events matched filters</h4>
            <p className="mt-1 text-xs text-slate-500">
              Wait for incoming telemetry or clear your active filters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredEvents.map((evt) => {
              const isExpanded = expandedEventId === evt.id;

              return (
                <div key={evt.id} className="transition-colors hover:bg-slate-800/30">
                  <div
                    onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <button className="text-slate-400 p-0.5">
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
                          evt.status === 'success'
                            ? 'bg-emerald-400'
                            : evt.status === 'warn'
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                        )}
                      />

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-white">
                            {evt.name}
                          </span>
                          <Badge variant="neutral" className="text-[10px] py-0 px-1.5 font-mono">
                            {evt.type}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {evt.userId}{' '}
                          <span className="text-slate-600">({evt.userEmail})</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 text-xs pl-7 sm:pl-0">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Layers className="h-3 w-3 text-indigo-400" />
                        <span>{evt.project}</span>
                      </div>
                      <span className="font-mono text-slate-400">{evt.relativeTime}</span>
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
                          Timestamp: {evt.timestamp}
                        </span>
                      </div>
                      <pre className="rounded-lg bg-slate-900/90 p-3 font-mono text-indigo-300 text-xs overflow-x-auto border border-slate-800">
                        {JSON.stringify(evt.properties, null, 2)}
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
