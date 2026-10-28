'use client';

import React, { useState } from 'react';
import {
  Layers,
  Search,
  Filter,
  ArrowUpDown,
  Eye,
  Copy,
  Check,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AreaChart } from '@/components/charts/AreaChart';
import { EVENTS_CATALOG, getTimeseriesData } from '@/lib/dummy-data';
import { EventItem } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>(EVENTS_CATALOG);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortField, setSortField] = useState<'name' | 'timestamp' | 'propertiesCount'>('timestamp');
  const [sortAsc, setSortAsc] = useState(false);
  const [activeModalEvent, setActiveModalEvent] = useState<EventItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const timeseries = getTimeseriesData('30d');
  const eventsDailyData = timeseries.map((pt) => ({
    date: pt.date,
    label: pt.label,
    value: pt.eventVolume,
  }));

  // Filter & Sort
  const filtered = events
    .filter((e) => {
      const matchSearch =
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.userId.toLowerCase().includes(search.toLowerCase()) ||
        e.id.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === 'All' || e.category === selectedCategory;
      return matchSearch && matchCat;
    })
    .sort((a, b) => {
      if (sortField === 'name') {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortField === 'propertiesCount') {
        return sortAsc
          ? a.propertiesCount - b.propertiesCount
          : b.propertiesCount - a.propertiesCount;
      }
      return sortAsc
        ? a.timestamp.localeCompare(b.timestamp)
        : b.timestamp.localeCompare(a.timestamp);
    });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedEvents = filtered.slice((page - 1) * pageSize, page * pageSize);

  const categories = ['All', 'Navigation', 'Auth', 'HRMS', 'Payroll', 'Interaction', 'Onboarding', 'Search', 'Reports'];

  const copyEventJson = () => {
    if (!activeModalEvent) return;
    navigator.clipboard.writeText(JSON.stringify(activeModalEvent, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Events Analytics Catalog</h1>
          <p className="mt-1 text-xs text-slate-400">
            Audit, inspect, and analyze all ingested user telemetry schema definitions and payloads.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Total Ingested Events</span>
          <div className="text-2xl font-bold text-white mt-1">1,565,540</div>
          <div className="text-[11px] text-emerald-400 mt-1 font-semibold">+22.3% vs previous month</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Unique Active Users</span>
          <div className="text-2xl font-bold text-white mt-1">19,480</div>
          <div className="text-[11px] text-emerald-400 mt-1 font-semibold">+8.4% growth</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Daily Event Rate</span>
          <div className="text-2xl font-bold text-white mt-1">52.1k / day</div>
          <div className="text-[11px] text-slate-500 mt-1">Peak 78k / day on Mondays</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Unique Schemas</span>
          <div className="text-2xl font-bold text-white mt-1">34 Types</div>
          <div className="text-[11px] text-indigo-400 mt-1">100% schema validation pass</div>
        </Card>
      </div>

      {/* Events Per Day Chart */}
      <Card className="p-6">
        <CardHeader>
          <div>
            <CardTitle>Daily Ingestion Rate & Volume</CardTitle>
            <CardDescription>Event volume over the past 30 days across all projects</CardDescription>
          </div>
          <Badge variant="neutral">30 Days</Badge>
        </CardHeader>
        <div className="pt-4">
          <AreaChart data={eventsDailyData} color="#3b82f6" height={220} />
        </div>
      </Card>

      {/* Events Table Card */}
      <Card className="p-0 overflow-hidden">
        {/* Table Filter Controls */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search event name, ID, or user..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 pl-9 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  Category: {c}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-400">
            Showing {filtered.length} matching events
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
                <th className="py-3 px-4 font-semibold">Event ID</th>
                <th className="py-3 px-4 font-semibold">User Identifier</th>
                <th className="py-3 px-4 font-semibold">Project</th>
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
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Props</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedEvents.map((evt) => (
                <tr
                  key={evt.id}
                  className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                  onClick={() => setActiveModalEvent(evt)}
                >
                  <td className="py-3 px-4 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-400 group-hover:text-indigo-300">
                        {evt.name}
                      </span>
                      <Badge variant="neutral" className="text-[10px] py-0 px-1 font-sans">
                        {evt.category}
                      </Badge>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-[11px]">{evt.id}</td>
                  <td className="py-3 px-4 text-slate-200">
                    <div>{evt.userId}</div>
                    <div className="text-[10px] text-slate-500 font-sans">{evt.userEmail}</div>
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-300">{evt.project}</td>
                  <td className="py-3 px-4 text-slate-400">{evt.timestamp}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                      {evt.propertiesCount} keys
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
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900/40 text-xs">
          <span className="text-slate-400">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
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
          title={`Event: ${activeModalEvent.name}`}
          description={`ID: ${activeModalEvent.id} • Category: ${activeModalEvent.category}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            {/* Meta badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">
                <div className="text-slate-500 text-[10px]">PROJECT</div>
                <div className="font-semibold text-white mt-0.5">{activeModalEvent.project}</div>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">
                <div className="text-slate-500 text-[10px]">USER ID</div>
                <div className="font-mono text-white mt-0.5 truncate">{activeModalEvent.userId}</div>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">
                <div className="text-slate-500 text-[10px]">CLIENT BROWSER</div>
                <div className="text-white mt-0.5">{activeModalEvent.browser}</div>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">
                <div className="text-slate-500 text-[10px]">LOCATION</div>
                <div className="text-white mt-0.5">{activeModalEvent.country}</div>
              </div>
            </div>

            {/* JSON Schema Viewer */}
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
                      <span className="text-emerald-400">Copied!</span>
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
                {JSON.stringify(activeModalEvent.properties, null, 2)}
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

