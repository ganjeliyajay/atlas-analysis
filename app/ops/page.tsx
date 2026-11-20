'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Users,
  Activity,
  Layers,
  RefreshCw,
  AlertTriangle,
  Building,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

type OpsTenant = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  eventQuota: number;
  suspendedAt: string | null;
  suspendedReason: string | null;
  ownerName: string;
  ownerEmail: string;
  projectsCount: number;
  membersCount: number;
  eventVolume: number;
  createdAt: string;
};

type OpsMetrics = {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  totalProjects: number;
  totalEvents: number;
};

export default function OpsConsolePage() {
  const [tenants, setTenants] = useState<OpsTenant[]>([]);
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const [selectedTenant, setSelectedTenant] = useState<OpsTenant | null>(null);
  const [suspendModalTenant, setSuspendModalTenant] = useState<OpsTenant | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [quotaInput, setQuotaInput] = useState<number>(100000);
  const [isUpdatingQuota, setIsUpdatingQuota] = useState(false);
  const [quotaSuccess, setQuotaSuccess] = useState(false);

  const [reloadTrigger, setReloadTrigger] = useState(0);

  const fetchOpsData = useCallback(() => {
    setReloadTrigger((t) => t + 1);
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(pageSize),
          status: statusFilter,
          range: '30d',
        });
        if (search.trim()) {
          params.set('search', search.trim());
        }

        const res = await fetch(`/api/ops?${params.toString()}`);
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access denied. Superadmin privileges required.');
          }
          throw new Error('Failed to load platform operations telemetry');
        }

        const data = await res.json();
        if (!ignore) {
          setTenants(data.organizations || []);
          setMetrics(data.metrics || null);
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages || 1);
          }
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Unknown ops error');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [page, statusFilter, search, reloadTrigger]);

  const handleSelectTenant = (t: OpsTenant) => {
    setSelectedTenant(t);
    setQuotaInput(t.eventQuota);
    setQuotaSuccess(false);
  };

  const handleToggleTenantStatus = async () => {
    if (!suspendModalTenant) return;
    setIsUpdatingStatus(true);
    try {
      const nextStatus = suspendModalTenant.status === 'suspended' ? 'active' : 'suspended';
      const res = await fetch(`/api/ops/tenants/${suspendModalTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          suspendedReason: nextStatus === 'suspended' ? suspendReason || 'Manual staff suspension' : null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to update tenant status');
      }

      setSuspendModalTenant(null);
      setSuspendReason('');
      if (selectedTenant && selectedTenant.id === suspendModalTenant.id) {
        setSelectedTenant({
          ...selectedTenant,
          status: nextStatus,
          suspendedAt: nextStatus === 'suspended' ? new Date().toISOString() : null,
          suspendedReason: nextStatus === 'suspended' ? suspendReason : null,
        });
      }
      await fetchOpsData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleUpdateQuota = async () => {
    if (!selectedTenant) return;
    setIsUpdatingQuota(true);
    setQuotaSuccess(false);
    try {
      const res = await fetch(`/api/ops/tenants/${selectedTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventQuota: quotaInput,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to update quota');
      }

      setQuotaSuccess(true);
      setSelectedTenant({
        ...selectedTenant,
        eventQuota: quotaInput,
      });
      await fetchOpsData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update quota');
    } finally {
      setIsUpdatingQuota(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Ops Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Platform Administration & Operations
            </h1>
            <Badge variant="warning">Staff Superadmin Mode</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Multi-tenant infrastructure health, PostgreSQL partition telemetry, event throttling, and quota governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOpsData()}
            className="flex items-center gap-1.5 text-xs text-slate-300 border-slate-700 hover:bg-slate-800"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </Button>
          <Badge variant="neutral">Postgres Cluster: Nominal</Badge>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-300 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Global Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Total Registered Tenants</span>
            <Users className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {metrics?.totalOrganizations ?? '—'}
          </div>
          <div className="text-[11px] text-emerald-400 font-medium mt-1">
            {metrics?.activeOrganizations ?? 0} active • {metrics?.suspendedOrganizations ?? 0} suspended
          </div>
        </Card>

        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Total Users Registered</span>
            <Building className="h-4 w-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {metrics?.totalUsers ?? '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Global platform accounts</div>
        </Card>

        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Configured Projects</span>
            <Layers className="h-4 w-4 text-violet-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {metrics?.totalProjects ?? '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Tenant ingestion environments</div>
        </Card>

        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Ingested Event Volume (30d)</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {metrics?.totalEvents ? metrics.totalEvents.toLocaleString() : '0'}
          </div>
          <div className="text-[11px] text-emerald-400 mt-1">PostgreSQL source of truth</div>
        </Card>
      </div>

      {/* Tenant Management Table */}
      <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Registered Organizations</h2>
            <Badge variant="neutral">{tenants.length} loaded</Badge>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tenant or owner..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 pr-3 text-xs rounded bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48 sm:w-64"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-2.5 text-xs rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="py-3 px-4">Organization Name</th>
                <th className="py-3 px-4">Owner</th>
                <th className="py-3 px-4">Projects</th>
                <th className="py-3 px-4">Members</th>
                <th className="py-3 px-4">Monthly Events</th>
                <th className="py-3 px-4">Quota</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto text-indigo-400 mb-2" />
                    Loading tenants telemetry...
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No organizations match the filter criteria.
                  </td>
                </tr>
              ) : (
                tenants.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    onClick={() => handleSelectTenant(t)}
                  >
                    <td className="py-3 px-4 font-medium text-white">
                      <div>{t.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.slug}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <div>{t.ownerName}</div>
                      <div className="text-[10px] text-slate-500">{t.ownerEmail}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{t.projectsCount}</td>
                    <td className="py-3 px-4 text-slate-300">{t.membersCount}</td>
                    <td className="py-3 px-4 font-mono text-slate-200">
                      {t.eventVolume.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {t.eventQuota.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      {t.status === 'suspended' ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectTenant(t)}
                          className="text-[11px] h-7 px-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30"
                        >
                          Manage
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSuspendModalTenant(t)}
                          className={cn(
                            "text-[11px] h-7 px-2",
                            t.status === 'suspended'
                              ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
                              : "text-red-400 hover:text-red-300 hover:bg-red-950/30"
                          )}
                        >
                          {t.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>Page {page} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs h-7 px-2 border-slate-800"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs h-7 px-2 border-slate-800"
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Tenant Details & Quota SlideOver */}
      <SlideOver
        isOpen={Boolean(selectedTenant)}
        onClose={() => setSelectedTenant(null)}
        title={selectedTenant?.name ?? 'Tenant Details'}
      >
        {selectedTenant && (
          <div className="space-y-6 text-xs">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-slate-400 font-medium">Status:</span>
                {selectedTenant.status === 'suspended' ? (
                  <Badge variant="destructive">Suspended</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
              </div>
              {selectedTenant.suspendedReason && (
                <div className="rounded bg-red-950/30 border border-red-500/20 p-2.5 text-red-300 mb-4">
                  <div className="font-semibold">Suspension Reason:</div>
                  <div className="mt-0.5">{selectedTenant.suspendedReason}</div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg bg-slate-950 p-4 border border-slate-800">
              <h3 className="font-semibold text-slate-200">Tenant Metadata</h3>
              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <div>Tenant ID:</div>
                <div className="font-mono text-slate-200 break-all">{selectedTenant.id}</div>
                <div>Slug:</div>
                <div className="font-mono text-slate-200">{selectedTenant.slug}</div>
                <div>Owner Name:</div>
                <div className="text-slate-200">{selectedTenant.ownerName}</div>
                <div>Owner Email:</div>
                <div className="text-slate-200">{selectedTenant.ownerEmail}</div>
                <div>Created:</div>
                <div className="text-slate-200">
                  {new Date(selectedTenant.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Quota Governance */}
            <div className="space-y-3 rounded-lg bg-slate-950 p-4 border border-slate-800">
              <h3 className="font-semibold text-slate-200">Event Quota Governance</h3>
              <p className="text-slate-400 text-[11px]">
                Configures monthly ingestion limit. Ingestion returns HTTP 429 when quota is reached.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="number"
                  min={1000}
                  max={100000000}
                  step={10000}
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(Number(e.target.value))}
                  className="h-8 px-3 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs w-40 focus:outline-none focus:border-indigo-500"
                />
                <Button
                  size="sm"
                  onClick={handleUpdateQuota}
                  disabled={isUpdatingQuota || quotaInput === selectedTenant.eventQuota}
                  className="text-xs h-8 bg-indigo-600 hover:bg-indigo-500"
                >
                  {isUpdatingQuota ? 'Updating...' : 'Save Quota'}
                </Button>
              </div>
              {quotaSuccess && (
                <div className="text-emerald-400 text-[11px] flex items-center gap-1 mt-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Quota updated successfully.</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-800 flex justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSuspendModalTenant(selectedTenant)}
                className={cn(
                  "text-xs border-slate-700",
                  selectedTenant.status === 'suspended'
                    ? "text-emerald-400 hover:text-emerald-300"
                    : "text-red-400 hover:text-red-300"
                )}
              >
                {selectedTenant.status === 'suspended' ? 'Reactivate Tenant' : 'Suspend Tenant'}
              </Button>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Suspend / Reactivate Confirmation Modal */}
      <Modal
        isOpen={Boolean(suspendModalTenant)}
        onClose={() => setSuspendModalTenant(null)}
        title={
          suspendModalTenant?.status === 'suspended'
            ? `Reactivate ${suspendModalTenant?.name}`
            : `Suspend ${suspendModalTenant?.name}`
        }
      >
        {suspendModalTenant && (
          <div className="space-y-4 text-xs">
            {suspendModalTenant.status === 'suspended' ? (
              <p className="text-slate-300">
                Are you sure you want to reactivate <strong className="text-white">{suspendModalTenant.name}</strong>?
                This will immediately restore public API ingestion and customer dashboard access.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-slate-300">
                  Suspending <strong className="text-white">{suspendModalTenant.name}</strong> will immediately reject all
                  incoming event ingestion requests with <code className="text-amber-400">HTTP 403 Forbidden</code>.
                </p>
                <div>
                  <label className="block text-slate-400 mb-1">Reason for suspension (optional):</label>
                  <input
                    type="text"
                    placeholder="e.g. Ingestion abuse or billing violation"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSuspendModalTenant(null)}
                className="text-xs border-slate-700"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleToggleTenantStatus}
                disabled={isUpdatingStatus}
                className={cn(
                  "text-xs",
                  suspendModalTenant.status === 'suspended'
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-red-600 hover:bg-red-500 text-white"
                )}
              >
                {isUpdatingStatus
                  ? 'Processing...'
                  : suspendModalTenant.status === 'suspended'
                    ? 'Confirm Reactivation'
                    : 'Confirm Suspension'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
