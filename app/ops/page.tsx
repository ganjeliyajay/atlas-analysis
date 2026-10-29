'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Server,
  Database,
  HardDrive,
  Users,
  Activity,
  Layers,
  ArrowUpDown,
  MoreVertical,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { Modal } from '@/components/ui/Modal';
import { AreaChart } from '@/components/charts/AreaChart';
import { OPS_TENANTS, getTimeseriesData } from '@/lib/dummy-data';
import { TenantAdminRecord } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function OpsConsolePage() {
  const [tenants, setTenants] = useState<TenantAdminRecord[]>(OPS_TENANTS);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTenant, setSelectedTenant] = useState<TenantAdminRecord | null>(null);
  const [suspendModalTenant, setSuspendModalTenant] = useState<TenantAdminRecord | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const timeseries = getTimeseriesData('30d');
  const platformVolume = timeseries.map((pt) => ({
    date: pt.date,
    label: pt.label,
    value: Math.round(pt.eventVolume * 28),
  }));

  const filteredTenants = tenants.filter((t) => {
    const matchSearch =
      t.tenantName.toLowerCase().includes(search.toLowerCase()) ||
      t.ownerEmail.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase());
    const matchTier = tierFilter === 'All' || t.tier === tierFilter;
    const matchStatus = statusFilter === 'All' || t.status === statusFilter;
    return matchSearch && matchTier && matchStatus;
  });

  const totalPages = Math.ceil(filteredTenants.length / pageSize) || 1;
  const paginatedTenants = filteredTenants.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const handleToggleTenantStatus = (target: TenantAdminRecord) => {
    const nextStatus = target.status === 'Suspended' ? 'Active' : 'Suspended';
    setTenants(
      tenants.map((t) => (t.id === target.id ? { ...t, status: nextStatus } : t))
    );
    if (selectedTenant && selectedTenant.id === target.id) {
      setSelectedTenant({ ...selectedTenant, status: nextStatus });
    }
    setSuspendModalTenant(null);
  };

  const totalTenantsCount = 148;
  const activeTenantsCount = tenants.filter((t) => t.status === 'Active').length + 138;
  const suspendedTenantsCount = tenants.filter((t) => t.status === 'Suspended').length + 4;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Platform Administration & Operations
            </h1>
            <Badge variant="warning">Superadmin Mode</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Multi-tenant infrastructure health, PostgreSQL partition telemetry, event throttling, and quota governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="success">Kafka Buffer: 0.2ms Lag</Badge>
          <Badge variant="neutral">Postgres Cluster: Nominal</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Total Registered Tenants</span>
            <Users className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{totalTenantsCount}</div>
          <div className="text-[11px] text-emerald-400 font-medium mt-1">
            {activeTenantsCount} active • {suspendedTenantsCount} suspended
          </div>
        </Card>

        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Platform Total Events</span>
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">48.6M</div>
          <div className="text-[11px] text-slate-400 mt-1">1,240 events / sec ingestion rate</div>
        </Card>

        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Database Storage Used</span>
            <HardDrive className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">214.8 GB</div>
          <div className="text-[11px] text-slate-400 mt-1">TimescaleDB hypertable compression 4.2x</div>
        </Card>

        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Platform Uptime (30d)</span>
            <Server className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">99.98%</div>
          <div className="text-[11px] text-slate-400 mt-1">Zero dropped ingestion queues</div>
        </Card>
      </div>

      <Card className="p-6 bg-slate-900/50">
        <CardHeader>
          <div>
            <CardTitle>Platform Ingestion Throughput</CardTitle>
            <CardDescription>Consolidated events across all 148 tenant organizations</CardDescription>
          </div>
          <Badge variant="warning">30 Days Telemetry</Badge>
        </CardHeader>
        <div className="pt-4">
          <AreaChart data={platformVolume} color="#f59e0b" height={220} />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden bg-slate-900/60">
        {/* Table Filters */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-950/40">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search tenant or owner email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 pl-9 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="All">All Tiers</option>
              <option value="Free">Free</option>
              <option value="Pro">Pro</option>
              <option value="Enterprise">Enterprise</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
              <option value="Provisioning">Provisioning</option>
            </select>
          </div>

          <div className="text-xs text-slate-400">
            {filteredTenants.length} tenants matched
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/90 text-slate-400">
              <tr>
                <th className="py-3 px-4 font-semibold">Tenant Organization</th>
                <th className="py-3 px-4 font-semibold">Owner Contact</th>
                <th className="py-3 px-4 font-semibold">Tier</th>
                <th className="py-3 px-4 font-semibold text-right">Event Volume</th>
                <th className="py-3 px-4 font-semibold">Quota Usage</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Governance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedTenants.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTenant(t)}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-4 font-sans">
                    <div className="font-semibold text-white group-hover:text-amber-400 transition-colors">
                      {t.tenantName}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">{t.id}</div>
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <div className="text-slate-200">{t.ownerName}</div>
                    <div className="text-[10px] text-slate-400">{t.ownerEmail}</div>
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <Badge
                      variant={
                        t.tier === 'Enterprise'
                          ? 'default'
                          : t.tier === 'Pro'
                          ? 'warning'
                          : 'neutral'
                      }
                    >
                      {t.tier}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-white">
                    {t.eventVolume.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 min-w-[140px]">
                    <div className="flex justify-between text-[10px] mb-1 font-sans">
                      <span className="text-slate-400">{t.usagePercentage}%</span>
                      <span className="text-slate-500">
                        limit: {(t.eventLimit / 1000000).toFixed(1)}M
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          t.usagePercentage >= 90
                            ? 'bg-rose-500'
                            : t.usagePercentage >= 75
                            ? 'bg-amber-500'
                            : 'bg-indigo-500'
                        )}
                        style={{ width: `${Math.min(100, t.usagePercentage)}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    <Badge
                      variant={
                        t.status === 'Active'
                          ? 'success'
                          : t.status === 'Suspended'
                          ? 'destructive'
                          : 'warning'
                      }
                      className="capitalize"
                    >
                      {t.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right font-sans">
                    <Button
                      variant={t.status === 'Suspended' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSuspendModalTenant(t);
                      }}
                      className="text-xs h-7 px-2.5"
                    >
                      {t.status === 'Suspended' ? 'Activate' : 'Suspend'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/40 text-xs">
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

      {selectedTenant && (
        <SlideOver
          isOpen={!!selectedTenant}
          onClose={() => setSelectedTenant(null)}
          title={`Tenant: ${selectedTenant.tenantName}`}
          subtitle={`Organization ID: ${selectedTenant.id}`}
          width="max-w-2xl"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Plan Tier</span>
                <div className="text-base font-bold text-white mt-1">{selectedTenant.tier}</div>
              </div>
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Status</span>
                <div className="text-base font-bold text-emerald-400 mt-1">{selectedTenant.status}</div>
              </div>
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Active Projects</span>
                <div className="text-base font-bold text-white mt-1">{selectedTenant.projectsCount}</div>
              </div>
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Provisioned</span>
                <div className="text-xs font-mono text-slate-300 mt-1">{selectedTenant.createdAt}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Monthly Quota Consumption</span>
                <span className="font-mono text-indigo-400 font-bold">
                  {selectedTenant.usagePercentage}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, selectedTenant.usagePercentage)}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-1">
                <div>Ingested: {selectedTenant.eventVolume.toLocaleString()} events</div>
                <div className="text-right">
                  Remaining: {selectedTenant.remainingQuota.toLocaleString()}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Infrastructure Partitioning
              </h4>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">PostgreSQL Schema:</span>
                  <span className="text-slate-200">tenant_{selectedTenant.id.replace('ten_', '')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Storage Region:</span>
                  <span className="text-slate-200">{selectedTenant.region}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Partition Strategy:</span>
                  <span className="text-slate-200">Timescale Hypertable (Daily chunks)</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <Button
                variant={selectedTenant.status === 'Suspended' ? 'primary' : 'danger'}
                size="sm"
                onClick={() => setSuspendModalTenant(selectedTenant)}
              >
                {selectedTenant.status === 'Suspended' ? 'Activate Tenant Pipeline' : 'Suspend Tenant Pipeline'}
              </Button>
            </div>
          </div>
        </SlideOver>
      )}

      {suspendModalTenant && (
        <Modal
          isOpen={!!suspendModalTenant}
          onClose={() => setSuspendModalTenant(null)}
          title={`${suspendModalTenant.status === 'Suspended' ? 'Activate' : 'Suspend'} Tenant`}
          description={`Organization: ${suspendModalTenant.tenantName} (${suspendModalTenant.id})`}
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-300">
              {suspendModalTenant.status === 'Suspended'
                ? 'Activating this tenant will immediately unpause API key ingestion and restore live analytics queries.'
                : 'Suspending this tenant will temporarily halt all incoming telemetry streams and return HTTP 429 / 403 to client SDK requests.'}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSuspendModalTenant(null)}
              >
                Cancel
              </Button>
              <Button
                variant={suspendModalTenant.status === 'Suspended' ? 'primary' : 'danger'}
                size="sm"
                onClick={() => handleToggleTenantStatus(suspendModalTenant)}
              >
                Confirm {suspendModalTenant.status === 'Suspended' ? 'Activation' : 'Suspension'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

