'use client';

import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  UserCheck,
  TrendingUp,
  Search,
  Filter,
  ArrowUpDown,
  Calendar,
  Globe,
  Clock,
  ExternalLink,
  Activity,
  FileText,
  LogIn,
  CheckCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { AreaChart } from '@/components/charts/AreaChart';
import { USERS_CATALOG, getTimeseriesData } from '@/lib/dummy-data';
import { UserProfile } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>(USERS_CATALOG);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [sortField, setSortField] = useState<'name' | 'totalEvents' | 'sessionsCount'>('totalEvents');
  const [sortAsc, setSortAsc] = useState(false);

  const timeseries = getTimeseriesData('30d');
  const userGrowthChart = timeseries.map((pt) => ({
    date: pt.date,
    label: pt.label,
    value: pt.activeUsers,
  }));

  const filteredUsers = users
    .filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.id.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || u.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortField === 'name') {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortField === 'sessionsCount') {
        return sortAsc ? a.sessionsCount - b.sessionsCount : b.sessionsCount - a.sessionsCount;
      }
      return sortAsc ? a.totalEvents - b.totalEvents : b.totalEvents - a.totalEvents;
    });

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Users & Cohorts</h1>
        <p className="mt-1 text-xs text-slate-400">
          Inspect identified user profiles, individual user journeys, session histories, and timelines.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Total Users</span>
            <Users className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">48,520</div>
          <div className="text-[11px] text-emerald-400 font-semibold mt-1">+14.8% vs last month</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">New Users</span>
            <UserPlus className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">15,340</div>
          <div className="text-[11px] text-emerald-400 font-semibold mt-1">+31.2% adoption</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Returning Users</span>
            <UserCheck className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">33,180</div>
          <div className="text-[11px] text-slate-400 mt-1">68.4% of total base</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Active Users (MAU)</span>
            <Activity className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">19,480</div>
          <div className="text-[11px] text-emerald-400 font-semibold mt-1">+8.4% monthly active</div>
        </Card>
      </div>

      {/* User Growth Chart */}
      <Card className="p-6">
        <CardHeader>
          <div>
            <CardTitle>Active User Growth Trend</CardTitle>
            <CardDescription>Daily interactive user count across the HRMS portal</CardDescription>
          </div>
          <Badge variant="neutral">Last 30 Days</Badge>
        </CardHeader>
        <div className="pt-4">
          <AreaChart data={userGrowthChart} color="#6366f1" height={220} />
        </div>
      </Card>

      {/* Users Table */}
      <Card className="p-0 overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, or user ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 pl-9 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="churned">Churned</option>
            </select>
          </div>

          <div className="text-xs text-slate-400">
            Click any user to view detailed profile & event journey
          </div>
        </div>

        {/* Table Content */}
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
                    <span>User</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold">User ID</th>
                <th className="py-3 px-4 font-semibold">Country</th>
                <th className="py-3 px-4 font-semibold">First Seen</th>
                <th className="py-3 px-4 font-semibold">Last Active</th>
                <th
                  onClick={() => {
                    setSortField('totalEvents');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Events</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => {
                    setSortField('sessionsCount');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Sessions</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-indigo-300 border border-slate-700">
                        {u.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </div>
                      <div>
                        <div className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                          {u.name}
                        </div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{u.id}</td>
                  <td className="py-3 px-4 text-slate-300">{u.country}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{u.firstSeen}</td>
                  <td className="py-3 px-4 text-slate-300">{u.lastSeen}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                    {u.totalEvents.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {u.sessionsCount}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge
                      variant={
                        u.status === 'active'
                          ? 'success'
                          : u.status === 'inactive'
                          ? 'warning'
                          : 'destructive'
                      }
                      className="capitalize"
                    >
                      {u.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* User Profile Detail SlideOver Drawer */}
      {selectedUser && (
        <SlideOver
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          title={selectedUser.name}
          subtitle={`User ID: ${selectedUser.id} • ${selectedUser.email}`}
          width="max-w-2xl"
        >
          <div className="space-y-6">
            {/* User Overview Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-slate-900/90 p-3 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Events</div>
                <div className="text-lg font-bold text-white mt-1">
                  {selectedUser.totalEvents.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-slate-900/90 p-3 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Sessions</div>
                <div className="text-lg font-bold text-white mt-1">
                  {selectedUser.sessionsCount}
                </div>
              </div>
              <div className="rounded-lg bg-slate-900/90 p-3 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Location</div>
                <div className="text-sm font-semibold text-white mt-1 truncate">
                  {selectedUser.country}
                </div>
              </div>
              <div className="rounded-lg bg-slate-900/90 p-3 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Device / OS</div>
                <div className="text-sm font-semibold text-white mt-1 truncate">
                  {selectedUser.device}
                </div>
              </div>
            </div>

            {/* Top Visited Pages by this User */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Top Visited Pages
              </h4>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/80">
                {selectedUser.topPages.map((p) => (
                  <div
                    key={p.url}
                    className="flex items-center justify-between p-2.5 text-xs font-mono"
                  >
                    <span className="text-indigo-300 truncate">{p.url}</span>
                    <span className="text-slate-400 font-sans">{p.visits} visits</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Timeline */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Lifecycle Activity Timeline
              </h4>
              <div className="space-y-3 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {selectedUser.timeline.map((item) => (
                  <div key={item.id} className="relative text-xs">
                    <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full border-2 border-indigo-500 bg-[#0B0F19]" />
                    <div className="font-medium text-slate-200">{item.action}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.timestamp}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Raw Events */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Recent Ingested Events
              </h4>
              <div className="rounded-lg border border-slate-800 bg-[#070A10] p-3 divide-y divide-slate-800/60 font-mono text-xs">
                {selectedUser.recentEvents.map((evt) => (
                  <div key={evt.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between">
                    <div>
                      <span className="text-indigo-400 font-bold">{evt.name}</span>
                      <span className="text-slate-500 ml-2">page: {evt.page}</span>
                    </div>
                    <span className="text-slate-500 text-[10px]">{evt.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SlideOver>
      )}
    </div>
  );
}

