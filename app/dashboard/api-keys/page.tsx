'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Copy,
  Check,
  Shield,
  Trash2,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

interface LiveApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  projectId: string | null;
  project: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'revoked' | 'expired';
  createdBy: string;
}

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<LiveApiKey[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<LiveApiKey | null>(null);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Create form state
  const [keyName, setKeyName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newlyCreatedSecret, setNewlyCreatedSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const fetchKeys = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to load API keys');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error loading API keys');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // Ignore background projects fetch error
    }
  };

  useEffect(() => {
    async function init() {
      await Promise.all([fetchKeys(), fetchProjects()]);
    }
    void init();
  }, []);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleCopySecret = (text: string) => {
    navigator.clipboard.writeText(text);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2500);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName.trim(),
          projectId: selectedProjectId || null,
          expiresInDays: expiresInDays || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create API key');
      }

      setNewlyCreatedSecret(data.key.secretKey);
      await fetchKeys();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!activeKey) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/keys/${activeKey.id}/revoke`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to revoke key');
      }
      setRevokeModalOpen(false);
      await fetchKeys();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error revoking key');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!activeKey) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/keys/${activeKey.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to delete key');
      }
      setDeleteModalOpen(false);
      await fetchKeys();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error deleting key');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">API Keys &amp; Ingestion Tokens</h1>
          <p className="mt-1 text-xs text-slate-400">
            Provision and govern secure server-side ingestion tokens and client API keys with tenant isolation.
          </p>
        </div>

        <Button
          onClick={() => {
            setKeyName('');
            setSelectedProjectId('');
            setExpiresInDays(null);
            setNewlyCreatedSecret(null);
            setError(null);
            setCreateModalOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>Generate API Key</span>
        </Button>
      </div>

      {/* Security Notice Card */}
      <div className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4 text-xs">
        <Shield className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Security &amp; Tenant Isolation:</span>
          <p className="mt-0.5 text-slate-300 leading-relaxed">
            API keys are hashed with SHA-256 upon creation and validated via dedicated Row-Level Security contexts. Full secrets are never displayed again after generation.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950/40 border border-red-500/30 p-3 text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* API Keys Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <tr>
                <th className="py-3 px-4 font-semibold">Name</th>
                <th className="py-3 px-4 font-semibold">Token Prefix</th>
                <th className="py-3 px-4 font-semibold">Project Scope</th>
                <th className="hidden lg:table-cell py-3 px-4 font-semibold">Created</th>
                <th className="hidden md:table-cell py-3 px-4 font-semibold">Last Used</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                    Loading API keys...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                    No API keys created yet. Generate your first API key above.
                  </td>
                </tr>
              ) : (
                keys.map((k) => {
                  const isCopied = copiedKeyId === k.id;
                  const isRevoked = k.status === 'revoked';
                  const isExpired = k.status === 'expired';

                  return (
                    <tr
                      key={k.id}
                      className={cn(
                        'hover:bg-slate-800/30 transition-colors group',
                        isRevoked || isExpired ? 'opacity-60 bg-slate-950/40' : ''
                      )}
                    >
                      <td className="py-3 px-4 font-sans font-semibold text-white">
                        {k.name}
                      </td>
                      <td className="py-3 px-4 text-indigo-400">
                        <div className="flex items-center gap-2">
                          <span>{k.keyPrefix}••••••••</span>
                          <button
                            onClick={() => handleCopy(k.id, k.keyPrefix)}
                            className="text-slate-500 hover:text-white p-1 rounded transition-colors"
                            title="Copy prefix"
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-300">{k.project}</td>
                      <td className="hidden lg:table-cell py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>
                      <td className="hidden md:table-cell py-3 px-4 text-slate-300 font-sans text-[11px]">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        <Badge
                          variant={
                            k.status === 'active'
                              ? 'success'
                              : k.status === 'revoked'
                              ? 'destructive'
                              : 'warning'
                          }
                          className="capitalize"
                        >
                          {k.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveKey(k);
                              setDetailModalOpen(true);
                            }}
                            className="h-7 px-2 text-slate-400 hover:text-white"
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          {!isRevoked && !isExpired && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setActiveKey(k);
                                setRevokeModalOpen(true);
                              }}
                              className="h-7 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                              title="Revoke Key"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveKey(k);
                              setDeleteModalOpen(true);
                            }}
                            className="h-7 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                            title="Delete Key"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Generate New API Key"
        description="Create an ingestion API token for sending telemetry events."
      >
        {newlyCreatedSecret ? (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-start gap-2">
              <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <span className="font-semibold">Key Generated Successfully!</span>
                <p className="mt-0.5 text-emerald-200">
                  Please copy your secret key right now. For security purposes, this secret will never be shown again.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-indigo-300 break-all">
                {newlyCreatedSecret}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopySecret(newlyCreatedSecret)}
                className="shrink-0 gap-1.5"
              >
                {secretCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{secretCopied ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={() => {
                  setCreateModalOpen(false);
                  setNewlyCreatedSecret(null);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Key Label / Name
              </label>
              <input
                type="text"
                placeholder="e.g. Production Web Ingestion"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Project Scope (Optional)
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All Projects in Organization</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Expiration (Optional)
              </label>
              <select
                value={expiresInDays ?? ''}
                onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">No Expiration</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
                <option value="365">1 Year</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting || !keyName.trim()}>
                {isSubmitting ? 'Generating...' : 'Generate API Key'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Revoke Modal */}
      {activeKey && (
        <Modal
          isOpen={revokeModalOpen}
          onClose={() => setRevokeModalOpen(false)}
          title="Revoke API Key"
          description={`Are you sure you want to revoke "${activeKey.name}"?`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Any client or service using <code className="font-mono text-indigo-400">{activeKey.keyPrefix}••••</code> will immediately be blocked from ingesting further events. This action cannot be reversed.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRevokeModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleRevokeKey}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Revoking...' : 'Revoke Key'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Modal */}
      {activeKey && (
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Delete API Key"
          description={`Delete record for "${activeKey.name}"`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Permanently delete this API key record from the database.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteKey}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {activeKey && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`API Key Details: ${activeKey.name}`}
          description={`ID: ${activeKey.id}`}
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">PROJECT SCOPE</span>
                <span className="font-semibold text-white">{activeKey.project}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">STATUS</span>
                <span className="font-semibold text-emerald-400 capitalize">{activeKey.status}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">CREATED</span>
                <span className="font-mono text-slate-300">
                  {new Date(activeKey.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">LAST USED</span>
                <span className="text-slate-300">
                  {activeKey.lastUsedAt ? new Date(activeKey.lastUsedAt).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] block">PUBLIC TOKEN PREFIX</span>
              <span className="font-mono text-indigo-400 font-bold">{activeKey.keyPrefix}</span>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDetailModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
