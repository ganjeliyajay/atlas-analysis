'use client';

import React, { useState } from 'react';
import {
  Key,
  Plus,
  Copy,
  Check,
  Shield,
  Trash2,
  AlertTriangle,
  Eye,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { INITIAL_API_KEYS, PROJECTS } from '@/lib/dummy-data';
import { ApiKey } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>(INITIAL_API_KEYS);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<ApiKey | null>(null);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Create form state
  const [keyName, setKeyName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(PROJECTS[0].id);
  const [permissions, setPermissions] = useState<ApiKey['permissions']>('ingest_only');
  const [newlyCreatedSecret, setNewlyCreatedSecret] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    const proj = PROJECTS.find((p) => p.id === selectedProjectId) || PROJECTS[0];
    const randomHex = Math.random().toString(16).substring(2, 10);
    const fakePrefix = `atl_${permissions === 'read_write' ? 'live' : 'pub'}_${randomHex}`;
    const fakeSecret = `${fakePrefix}_secret_${Math.random().toString(36).substring(2, 18)}`;

    const newKey: ApiKey = {
      id: `key_${Date.now()}`,
      name: keyName,
      keyPrefix: fakePrefix,
      project: proj.name,
      projectId: proj.id,
      createdAt: new Date().toISOString().split('T')[0],
      lastUsed: 'Never',
      status: 'active',
      permissions,
    };

    setKeys([newKey, ...keys]);
    setNewlyCreatedSecret(fakeSecret);
  };

  const handleRevokeKey = () => {
    if (!activeKey) return;
    setKeys(
      keys.map((k) => (k.id === activeKey.id ? { ...k, status: 'revoked' } : k))
    );
    setRevokeModalOpen(false);
  };

  const handleDeleteKey = () => {
    if (!activeKey) return;
    setKeys(keys.filter((k) => k.id !== activeKey.id));
    setDeleteModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">API Keys & Ingestion Tokens</h1>
          <p className="mt-1 text-xs text-slate-400">
            Provision and govern client-side publishable keys and secure server-side ingestion tokens.
          </p>
        </div>

        <Button
          onClick={() => {
            setKeyName('');
            setNewlyCreatedSecret(null);
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
          <span className="font-semibold text-white">Security & Scoping Best Practice:</span>
          <p className="mt-0.5 text-slate-300 leading-relaxed">
            Use <code className="text-indigo-300 font-mono">ingest_only</code> keys for browser SDKs and frontends. Keep <code className="text-indigo-300 font-mono">read_write</code> keys restricted to protected backend environments.
          </p>
        </div>
      </div>

      {/* API Keys Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <tr>
                <th className="py-3 px-4 font-semibold">Key Name</th>
                <th className="py-3 px-4 font-semibold">Token Prefix</th>
                <th className="py-3 px-4 font-semibold">Project</th>
                <th className="py-3 px-4 font-semibold">Permissions</th>
                <th className="py-3 px-4 font-semibold">Created</th>
                <th className="py-3 px-4 font-semibold">Last Ingested</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {keys.map((k) => {
                const isCopied = copiedKeyId === k.id;
                const isRevoked = k.status === 'revoked';

                return (
                  <tr
                    key={k.id}
                    className={cn(
                      'hover:bg-slate-800/30 transition-colors group',
                      isRevoked ? 'opacity-60 bg-slate-950/40' : ''
                    )}
                  >
                    <td className="py-3 px-4 font-sans font-semibold text-white">
                      {k.name}
                    </td>
                    <td className="py-3 px-4 text-indigo-400">
                      <div className="flex items-center gap-2">
                        <span>{k.keyPrefix}••••••••</span>
                        <button
                          onClick={() => handleCopy(k.id, `${k.keyPrefix}_demo_secret`)}
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
                    <td className="py-3 px-4 font-sans">
                      <Badge
                        variant={k.permissions === 'read_write' ? 'warning' : 'neutral'}
                        className="text-[10px] py-0 px-1.5"
                      >
                        {k.permissions === 'read_write' ? 'Read + Write' : 'Ingest Only'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">{k.createdAt}</td>
                    <td className="py-3 px-4 text-slate-300 font-sans text-[11px]">
                      {k.lastUsed}
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <Badge
                        variant={k.status === 'active' ? 'success' : 'destructive'}
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

                        {!isRevoked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveKey(k);
                              setRevokeModalOpen(true);
                            }}
                            className="h-7 px-2 text-slate-400 hover:text-amber-400"
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
                          className="h-7 px-2 text-slate-400 hover:text-rose-400"
                          title="Delete Key"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Generate API Key Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={newlyCreatedSecret ? 'API Key Generated' : 'Generate New API Key'}
        description={
          newlyCreatedSecret
            ? 'Copy your secret token now. It will not be shown again.'
            : 'Create an ingestion credential for your frontend SDK or backend service.'
        }
      >
        {newlyCreatedSecret ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-900 border border-emerald-500/30 p-3 text-xs space-y-2">
              <span className="text-emerald-400 font-semibold block">
                ✓ Credential created successfully
              </span>
              <div className="flex items-center justify-between bg-black/60 p-2.5 rounded font-mono text-indigo-300">
                <span className="truncate">{newlyCreatedSecret}</span>
                <button
                  onClick={() => handleCopy('new_key', newlyCreatedSecret)}
                  className="ml-2 shrink-0 p-1 text-slate-400 hover:text-white"
                >
                  {copiedKeyId === 'new_key' ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setCreateModalOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Key Label / Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Next.js Web Client or iOS App Ingestion"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Target Project *
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                {PROJECTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.websiteUrl})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Permissions Scope
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-800 bg-slate-900/40 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={permissions === 'ingest_only'}
                    onChange={() => setPermissions('ingest_only')}
                    className="text-indigo-600 focus:ring-0"
                  />
                  <div>
                    <div className="text-xs font-medium text-white">Ingest Only (Recommended for Web SDK)</div>
                    <div className="text-[11px] text-slate-400">Can only send events, cannot read analytics data</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-800 bg-slate-900/40 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={permissions === 'read_write'}
                    onChange={() => setPermissions('read_write')}
                    className="text-indigo-600 focus:ring-0"
                  />
                  <div>
                    <div className="text-xs font-medium text-white">Read & Write (Server-side Only)</div>
                    <div className="text-[11px] text-slate-400">Can query analytics endpoints and ingest events</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Generate Key
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
              Any client using <code className="font-mono text-indigo-400">{activeKey.keyPrefix}</code> will immediately be blocked from ingesting further events. This action can only be reversed by creating a new key.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRevokeModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleRevokeKey}>
                Revoke Key
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
              Permanently remove this API key from the database.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteKey}>
                Delete
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
          description={`Key ID: ${activeKey.id}`}
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">PROJECT</span>
                <span className="font-semibold text-white">{activeKey.project}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">STATUS</span>
                <span className="font-semibold text-emerald-400 capitalize">{activeKey.status}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">CREATED</span>
                <span className="font-mono text-slate-300">{activeKey.createdAt}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">LAST USED</span>
                <span className="text-slate-300">{activeKey.lastUsed}</span>
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

