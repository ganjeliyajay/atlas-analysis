'use client';

import React, { useState } from 'react';
import {
  Settings,
  Users,
  Bell,
  Sliders,
  Copy,
  Check,
  Plus,
  Trash2,
  Shield,
  Mail,
  AlertTriangle,
  Globe,
  Save,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TEAM_MEMBERS, WORKSPACES, PROJECTS } from '@/lib/dummy-data';
import { TeamMember } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'team' | 'project' | 'notifications'>('general');
  const [workspaceName, setWorkspaceName] = useState(WORKSPACES[0].name);
  const [timezone, setTimezone] = useState('America/New_York (EST)');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [copiedWsId, setCopiedWsId] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  // Team state
  const [members, setMembers] = useState<TeamMember[]>(TEAM_MEMBERS);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamMember['role']>('Viewer');

  // Notification state
  const [digestWeekly, setDigestWeekly] = useState(true);
  const [usageAlert80, setUsageAlert80] = useState(true);
  const [anomalyDetection, setAnomalyDetection] = useState(true);
  const [slackWebhook, setSlackWebhook] = useState('https://hooks.slack.com/services/T00/B00/XXXX');

  const copyWorkspaceId = () => {
    navigator.clipboard.writeText(WORKSPACES[0].id);
    setCopiedWsId(true);
    setTimeout(() => setCopiedWsId(false), 2000);
  };

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    const newMember: TeamMember = {
      id: `tm_${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      status: 'Pending',
      avatarInitials: inviteEmail.substring(0, 2).toUpperCase(),
      joinedDate: 'Just now',
    };

    setMembers([...members, newMember]);
    setInviteEmail('');
    setInviteModalOpen(false);
  };

  const handleRemoveMember = (id: string) => {
    setMembers(members.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Workspace & Project Settings</h1>
        <p className="mt-1 text-xs text-slate-400">
          Configure organization governance, team role access, tracking rules, and alert thresholds.
        </p>
      </div>

      {savedBanner && (
        <div className="rounded-lg bg-emerald-950/60 border border-emerald-500/30 p-3 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>Settings saved successfully</span>
          </div>
          <button
            onClick={() => setSavedBanner(false)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-px">
        {[
          { id: 'general', label: 'General', icon: Settings },
          { id: 'team', label: `Team Members (${members.length})`, icon: Users },
          { id: 'project', label: 'Project Tracking', icon: Globe },
          { id: 'notifications', label: 'Alerts & Notifications', icon: Bell },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: General Settings */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <Card className="p-6">
            <form onSubmit={handleSaveGeneral} className="space-y-5">
              <CardTitle>Workspace Profile</CardTitle>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Workspace Unique ID
                </label>
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    disabled
                    value={WORKSPACES[0].id}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-400"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={copyWorkspaceId}
                    className="shrink-0"
                  >
                    {copiedWsId ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Primary Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="America/New_York (EST)">America/New_York (EST)</option>
                    <option value="America/Los_Angeles (PST)">America/Los_Angeles (PST)</option>
                    <option value="Europe/London (GMT)">Europe/London (GMT)</option>
                    <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Date Format
                  </label>
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <Button type="submit" size="sm" className="gap-2">
                  <Save className="h-3.5 w-3.5" />
                  <span>Save Changes</span>
                </Button>
              </div>
            </form>
          </Card>

          {/* Danger Zone */}
          <Card className="p-6 border-rose-900/50 bg-rose-950/10">
            <CardTitle className="text-rose-400">Danger Zone</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Permanently delete this workspace and wipe all ingested telemetry streams.
            </p>
            <div className="mt-4">
              <Button variant="danger" size="sm">
                Delete Workspace
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Team Members */}
      {activeTab === 'team' && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div>
              <CardTitle>Team & Access Governance</CardTitle>
              <CardDescription>Collaborators with dashboard and query permissions</CardDescription>
            </div>
            <Button size="sm" onClick={() => setInviteModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span>Invite Member</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Joined</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 font-bold text-indigo-300 border border-slate-700">
                          {m.avatarInitials}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{m.name}</div>
                          <div className="text-[11px] text-slate-400">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          m.role === 'Owner'
                            ? 'default'
                            : m.role === 'Admin'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {m.role}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5',
                          m.status === 'Active' ? 'text-emerald-400' : 'text-amber-400'
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            m.status === 'Active' ? 'bg-emerald-400' : 'bg-amber-400'
                          )}
                        />
                        <span>{m.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {m.joinedDate}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {m.role !== 'Owner' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(m.id)}
                          className="h-7 px-2 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 3: Project Settings */}
      {activeTab === 'project' && (
        <Card className="p-6 space-y-5">
          <CardTitle>Project Tracking Rules (HRMS Analytics)</CardTitle>
          <div className="space-y-4 max-w-xl text-xs">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
              <input
                type="checkbox"
                defaultChecked
                className="mt-0.5 rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">IP Anonymization</span>
                <span className="text-slate-400 mt-0.5 block">
                  Strip client IP addresses prior to database disk commit for strict GDPR compliance.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
              <input
                type="checkbox"
                defaultChecked
                className="mt-0.5 rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">Automated Bot Filtering</span>
                <span className="text-slate-400 mt-0.5 block">
                  Detect and drop synthetic crawlers, search spiders, and automated scrape requests.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
              <input
                type="checkbox"
                defaultChecked
                className="mt-0.5 rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">Cross-Domain Session Tracking</span>
                <span className="text-slate-400 mt-0.5 block">
                  Preserve user sessions between hrms.enterprise.io and related subdomains.
                </span>
              </div>
            </label>
          </div>
        </Card>
      )}

      {/* Tab 4: Notification Settings */}
      {activeTab === 'notifications' && (
        <Card className="p-6 space-y-5">
          <CardTitle>Email & Telemetry Alerts</CardTitle>
          <div className="space-y-4 max-w-xl text-xs">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
              <input
                type="checkbox"
                checked={digestWeekly}
                onChange={(e) => setDigestWeekly(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">Weekly Analytics Digest</span>
                <span className="text-slate-400 mt-0.5 block">
                  Receive a consolidated Monday morning email summary of active users and funnel conversions.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
              <input
                type="checkbox"
                checked={usageAlert80}
                onChange={(e) => setUsageAlert80(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">Quota Warning Alert (80% and 100%)</span>
                <span className="text-slate-400 mt-0.5 block">
                  Notify workspace owner whenever monthly event volume exceeds 80% of current subscription tier.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
              <input
                type="checkbox"
                checked={anomalyDetection}
                onChange={(e) => setAnomalyDetection(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">Live Event Anomaly Detection</span>
                <span className="text-slate-400 mt-0.5 block">
                  Detect unexpected traffic spikes, payload schema deviations, or ingestion rate drops.
                </span>
              </div>
            </label>

            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Slack Webhook URL
              </label>
              <input
                type="url"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-white focus:outline-none"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Invite Member Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Team Member"
        description="Grant access to Jay's Workspace dashboard and analytics data."
      >
        <form onSubmit={handleInviteMember} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Work Email Address *
            </label>
            <input
              type="email"
              required
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Select Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamMember['role'])}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="Admin">Admin (Can manage projects, API keys & team)</option>
              <option value="Viewer">Viewer (Read-only dashboard analysis)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setInviteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

