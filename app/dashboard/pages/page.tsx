'use client';

import React, { useState } from 'react';
import {
  FileText,
  Search,
  ArrowUpDown,
  ExternalLink,
  Clock,
  Eye,
  TrendingUp,
  TrendingDown,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AreaChart } from '@/components/charts/AreaChart';
import { TOP_PAGES_DATA, getTimeseriesData } from '@/lib/dummy-data';
import { PageViewMetric } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function PagesAnalyticsPage() {
  const [pages, setPages] = useState<PageViewMetric[]>(TOP_PAGES_DATA);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'views' | 'uniqueUsers' | 'bounceRate'>('views');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<'all' | 'desktop' | 'mobile'>('all');

  const timeseries = getTimeseriesData('30d');
  const pageViewsTrend = timeseries.map((pt) => ({
    date: pt.date,
    label: pt.label,
    value: pt.pageViews,
  }));

  const filteredPages = pages
    .filter((p) => {
      return (
        p.url.toLowerCase().includes(search.toLowerCase()) ||
        p.title.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (sortField === 'uniqueUsers') {
        return sortAsc ? a.uniqueUsers - b.uniqueUsers : b.uniqueUsers - a.uniqueUsers;
      }
      if (sortField === 'bounceRate') {
        return sortAsc ? a.bounceRate - b.bounceRate : b.bounceRate - a.bounceRate;
      }
      return sortAsc ? a.views - b.views : b.views - a.views;
    });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Pages & Route Analytics</h1>
        <p className="mt-1 text-xs text-slate-400">
          Track visitor traffic, navigation engagement, drop-offs, and time spent on key HRMS application routes.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Total Page Views</span>
          <div className="text-2xl font-bold text-white mt-1">842,900</div>
          <div className="text-[11px] text-emerald-400 mt-1 font-semibold">+17.6% vs last period</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Unique Page Visitors</span>
          <div className="text-2xl font-bold text-white mt-1">48,520</div>
          <div className="text-[11px] text-emerald-400 mt-1 font-semibold">+14.8% growth</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Avg Time on Page</span>
          <div className="text-2xl font-bold text-white mt-1">3m 24s</div>
          <div className="text-[11px] text-slate-400 mt-1">High engagement on /reports</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Average Bounce Rate</span>
          <div className="text-2xl font-bold text-white mt-1">24.7%</div>
          <div className="text-[11px] text-emerald-400 mt-1 font-semibold">-3.1% improved</div>
        </Card>
      </div>

      {/* Page Views Trend Chart */}
      <Card className="p-6">
        <CardHeader>
          <div>
            <CardTitle>Page Views Ingestion Volume</CardTitle>
            <CardDescription>Daily aggregated route hits over the past 30 days</CardDescription>
          </div>
          <Badge variant="neutral">30 Days</Badge>
        </CardHeader>
        <div className="pt-4">
          <AreaChart data={pageViewsTrend} color="#8b5cf6" height={220} />
        </div>
      </Card>

      {/* Pages Table */}
      <Card className="p-0 overflow-hidden">
        {/* Table Filter Controls */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search page URL or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 pl-9 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Device:</span>
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
              <button
                onClick={() => setSelectedDevice('all')}
                className={cn(
                  'rounded px-2 py-0.5 text-xs',
                  selectedDevice === 'all'
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                All
              </button>
              <button
                onClick={() => setSelectedDevice('desktop')}
                className={cn(
                  'rounded px-2 py-0.5 text-xs flex items-center gap-1',
                  selectedDevice === 'desktop'
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Monitor className="h-3 w-3" />
                <span>Desktop</span>
              </button>
              <button
                onClick={() => setSelectedDevice('mobile')}
                className={cn(
                  'rounded px-2 py-0.5 text-xs flex items-center gap-1',
                  selectedDevice === 'mobile'
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Smartphone className="h-3 w-3" />
                <span>Mobile</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <tr>
                <th className="py-3 px-4 font-semibold">Page URL & Route</th>
                <th className="py-3 px-4 font-semibold">Page Title</th>
                <th
                  onClick={() => {
                    setSortField('views');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Views</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => {
                    setSortField('uniqueUsers');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Unique Users</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => {
                    setSortField('bounceRate');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Bounce Rate</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold text-right">Avg Time</th>
                <th className="py-3 px-4 font-semibold text-right">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPages.map((page) => (
                <tr key={page.url} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-indigo-400">
                    {page.url}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-medium">{page.title}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-white">
                    {page.views.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {page.uniqueUsers.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-400">
                    {page.bounceRate}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {page.avgTimeOnPage}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold">
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5',
                        page.trend >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}
                    >
                      {page.trend >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      <span>{page.trend >= 0 ? `+${page.trend}%` : `${page.trend}%`}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

