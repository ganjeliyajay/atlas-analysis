'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  Bell,
  Copy,
  Check,
  Plus,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

type OrganizationData = {
  id: string;
  name: string;
  slug: string;
  role: string;
  eventQuota: number;
};

type Member = {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'team' | 'notifications'>('general');
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState('');
  const [timezone, setTimezone] = useState('UTC (Coordinated Universal Time)');
  const [copiedWsId, setCopiedWsId] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'admin'>('viewer');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  // Notifications state
  const [digestWeekly, setDigestWeekly] = useState(true);
  const [usageAlert80, setUsageAlert80] = useState(true);

  const refreshOrgData = async () => {
    try {
      const [orgRes, invRes] = await Promise.all([
        fetch('/api/organization/current'),
        fetch('/api/organization/invitations'),
      ]);

      if (!orgRes.ok) throw new Error('Failed to load current organization details');
      const orgData = await orgRes.json();
      setOrganization(orgData.organization || null);
      setWorkspaceName(orgData.organization?.name || '');
      setMembers(orgData.organization?.members || []);

      if (invRes.ok) {
        const invData = await invRes.json();
        setInvitations(invData.invitations || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown settings error');
    }
  };

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const [orgRes, invRes] = await Promise.all([
          fetch('/api/organization/current'),
          fetch('/api/organization/invitations'),
        ]);

        if (!orgRes.ok) throw new Error('Failed to load current organization details');
        const orgData = await orgRes.json();
        if (!ignore) {
          setOrganization(orgData.organization || null);
          setWorkspaceName(orgData.organization?.name || '');
          setMembers(orgData.organization?.members || []);

          if (invRes.ok) {
            const invData = await invRes.json();
            setInvitations(invData.invitations || []);
          }
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Unknown settings error');
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      ignore = true;
    };
  }, []);

  const copyWorkspaceId = () => {
    if (!organization?.id) return;
    navigator.clipboard.writeText(organization.id);
    setCopiedWsId(true);
    setTimeout(() => setCopiedWsId(false), 2000);
  };

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsSubmittingInvite(true);
    try {
      const res = await fetch('/api/organization/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to send invitation');
      }

      setInviteModalOpen(false);
      setInviteEmail('');
      await refreshOrgData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Invitation failed');

    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to revoke this pending invitation?')) return;
    try {
      const res = await fetch(`/api/organization/invitations/${invitationId}/revoke`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to revoke invitation');
      }
      await refreshOrgData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Revocation failed');
    }
  };

  const handleUpdateRole = async (memberId: string, nextRole: string) => {
    try {
      const res = await fetch(`/api/organization/members/${memberId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ||
          'Failed to update member role');
      }
      await refreshOrgData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Role update failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          Workspace & Organization Settings
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Manage workspace governance, access credentials, team members, and alert subscriptions.
        </p>
      </div>

      {loading && !organization && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
          Loading workspace settings...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-300 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('general')}
          className={cn(
            'px-4 py-2.5 font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
            activeTab === 'general'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          <span>General</span>
        </button>

        <button
          onClick={() => setActiveTab('team')}
          className={cn(
            'px-4 py-2.5 font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
            activeTab === 'team'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Team & Invitations</span>
          <Badge variant="neutral">{members.length + invitations.length}</Badge>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={cn(
            'px-4 py-2.5 font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
            activeTab === 'notifications'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Bell className="h-3.5 w-3.5" />
          <span>Alerts</span>
        </button>
      </div>

      {/* Tab 1: General Settings */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <Card className="bg-slate-900/60 border-slate-800 p-6">
            <CardTitle className="text-sm font-semibold text-white">
              Organization Identifiers
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 mt-1">
              Internal references used for API requests and Row-Level Security tenant isolation.
            </CardDescription>

            <form onSubmit={handleSaveGeneral} className="mt-6 space-y-4 max-w-xl text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Organization Name</label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full h-8 px-3 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Tenant ID (app.tenant_id)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={organization?.id ?? 'Loading...'}
                    className="w-full h-8 px-3 rounded bg-slate-950/80 border border-slate-800 text-slate-400 font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyWorkspaceId}
                    className="h-8 border-slate-800 text-slate-300 shrink-0"
                  >
                    {copiedWsId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Reporting Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full h-8 px-2.5 rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="UTC (Coordinated Universal Time)">UTC (Coordinated Universal Time)</option>
                  <option value="IST (India Standard Time)">IST (India Standard Time - UTC+5:30)</option>
                  <option value="EST (Eastern Standard Time)">EST (Eastern Standard Time - UTC-5)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Raw events are stored in UTC; reporting boundaries align with this selected timezone.
                </p>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-xs">
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save Changes
                </Button>
                {savedBanner && (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Preferences saved
                  </span>
                )}
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Tab 2: Team Members & Invitations */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <Card className="bg-slate-900/60 border-slate-800 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <CardTitle className="text-sm font-semibold text-white">
                  Organization Members
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  Users with authorized access to this organization and its analytics dashboards.
                </CardDescription>
              </div>

              <Button
                size="sm"
                onClick={() => setInviteModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-xs flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Invite Teammate</span>
              </Button>
            </div>

            {/* Active Members Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Member</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Joined</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-medium text-white flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-indigo-950 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold">
                          {m.user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{m.user.name}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{m.user.email}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant={m.role === 'owner' ? 'warning' : 'neutral'}>
                          {m.role}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {m.role !== 'owner' && (
                          <select
                            value={m.role}
                            onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                            className="h-6 px-1.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 focus:outline-none"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {invitations.length > 0 && (
              <div className="mt-8 pt-4 border-t border-slate-800">
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Pending Invitations</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Invitee Email</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Expires At</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {invitations.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 text-slate-200">{inv.email}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant="neutral">{inv.role}</Badge>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeInvitation(inv.id)}
                              className="text-red-400 hover:text-red-300 h-6 px-2 text-[11px]"
                            >
                              Revoke
                            </Button> 
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <Card className="bg-slate-900/60 border-slate-800 p-6">
            <CardTitle className="text-sm font-semibold text-white">
              Event Threshold & Ingestion Alerts
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 mt-1">
              Configure proactive warnings before reaching monthly ingestion quotas or rate limits.
            </CardDescription>

            <div className="mt-6 space-y-4 max-w-xl text-xs">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usageAlert80}
                  onChange={(e) => setUsageAlert80(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                />
                <div>
                  <div className="text-white font-medium">80% Monthly Quota Warning</div>
                  <div className="text-slate-400 text-[11px]">Receive an alert when your tenant reaches 80% of its monthly event limit.</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={digestWeekly}
                  onChange={(e) => setDigestWeekly(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                />
                <div>
                  <div className="text-white font-medium">Weekly Executive Digest</div>
                  <div className="text-slate-400 text-[11px]">Weekly summary of DAU, WAU, and conversion funnel performance.</div>
                </div>
              </label>
            </div>
          </Card>
        </div>
      )}

      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Teammate to Organization"
      >
        <form onSubmit={handleInviteMember} className="space-y-4 text-xs">
          <p className="text-slate-400">
            Send an invitation to a colleague. They will receive an email containing a secure one-time access link.
          </p>

          <div>
            <label className="block text-slate-400 mb-1">Teammate Email Address</label>
            <input
              type="email"
              required
              placeholder="colleague@yourcompany.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>


          <div>
            <label className="block text-slate-400 mb-1">Assigned Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'admin')}
              className="w-full h-8 px-2.5 rounded bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="viewer">Viewer (Read-only analytics access)</option>
              <option value="admin">Admin (Manage projects and team)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInviteModalOpen(false)}
              className="text-xs border-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmittingInvite}
              className="bg-indigo-600 hover:bg-indigo-500 text-xs"
            >
              {isSubmittingInvite ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
