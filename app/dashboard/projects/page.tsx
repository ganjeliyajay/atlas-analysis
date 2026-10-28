'use client';

import React, { useState } from 'react';
import {
  Globe,
  Plus,
  ExternalLink,
  Edit2,
  Trash2,
  Layers,
  Activity,
  CheckCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PROJECTS } from '@/lib/dummy-data';
import { Project } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function ProjectsPage() {
  const [projectsList, setProjectsList] = useState<Project[]>(PROJECTS);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  // Form states
  const [projectName, setProjectName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [platform, setPlatform] = useState<Project['platform']>('Next.js');
  const [description, setDescription] = useState('');

  const openCreateModal = () => {
    setProjectName('');
    setWebsiteUrl('');
    setPlatform('Next.js');
    setDescription('');
    setCreateModalOpen(true);
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    const newProject: Project = {
      id: `proj_${Date.now()}`,
      name: projectName,
      websiteUrl: websiteUrl || 'https://new-app.io',
      platform,
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
      eventCount: 0,
      lastActivity: 'Just now',
      description: description || 'New client analytics project',
      environment: 'production',
    };

    setProjectsList([newProject, ...projectsList]);
    setCreateModalOpen(false);
  };

  const openEditModal = (p: Project) => {
    setActiveProject(p);
    setProjectName(p.name);
    setWebsiteUrl(p.websiteUrl);
    setPlatform(p.platform);
    setDescription(p.description);
    setEditModalOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;

    const updated = projectsList.map((p) =>
      p.id === activeProject.id
        ? {
            ...p,
            name: projectName,
            websiteUrl,
            platform,
            description,
          }
        : p
    );

    setProjectsList(updated);
    setEditModalOpen(false);
  };

  const openDeleteModal = (p: Project) => {
    setActiveProject(p);
    setDeleteModalOpen(true);
  };

  const handleDeleteProject = () => {
    if (!activeProject) return;
    setProjectsList(projectsList.filter((p) => p.id !== activeProject.id));
    setDeleteModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Projects & Tracked Websites</h1>
          <p className="mt-1 text-xs text-slate-400">
            Manage web and mobile client endpoints delivering event telemetry to Atlas Analytics.
          </p>
        </div>

        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="h-4 w-4" />
          <span>Create Project</span>
        </Button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {projectsList.map((project) => (
          <Card
            key={project.id}
            className="flex flex-col justify-between hover:border-slate-700 transition-all duration-200"
          >
            <div>
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{project.name}</h3>
                    <Badge variant="neutral" className="text-[10px] py-0 px-1.5 mt-0.5">
                      {project.platform}
                    </Badge>
                  </div>
                </div>

                <Badge
                  variant={
                    project.status === 'active'
                      ? 'success'
                      : project.status === 'setup_required'
                      ? 'warning'
                      : 'neutral'
                  }
                  className="capitalize"
                >
                  {project.status === 'active' ? 'Active' : 'Setup Required'}
                </Badge>
              </div>

              {/* Body */}
              <div className="py-4 space-y-3">
                <p className="text-xs text-slate-400 leading-relaxed min-h-[36px]">
                  {project.description}
                </p>

                <div className="rounded-lg bg-slate-900/60 p-2.5 border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Target URL:</span>
                    <a
                      href={project.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-indigo-400 hover:text-indigo-300 truncate max-w-[160px] flex items-center gap-1"
                    >
                      <span className="truncate">{project.websiteUrl}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Total Events:</span>
                    <span className="font-mono font-bold text-white">
                      {project.eventCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Last Ingested:</span>
                    <span className="text-slate-300">{project.lastActivity}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-400 font-mono">ID: {project.id}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(project)}
                  className="h-8 px-2 text-slate-400 hover:text-white"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openDeleteModal(project)}
                  className="h-8 px-2 text-slate-400 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Create Project Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Analytics Project"
        description="Register a new website or mobile application to ingest telemetry."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Employee Portal or Marketing Website"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Website / Host URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Platform / Tech Stack
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Project['platform'])}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="Next.js">Next.js (App Router / Pages)</option>
              <option value="React">React (Vite / CRA)</option>
              <option value="JavaScript">Vanilla JavaScript / HTML</option>
              <option value="Node.js">Node.js Server Telemetry</option>
              <option value="Mobile">React Native / Mobile App</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              placeholder="Short note about what this project tracks..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
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
              Create Project
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      {activeProject && (
        <Modal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={`Edit Project: ${activeProject.name}`}
          description={`Project ID: ${activeProject.id}`}
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Project Name
              </label>
              <input
                type="text"
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Website URL
              </label>
              <input
                type="url"
                required
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Project['platform'])}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="Next.js">Next.js</option>
                <option value="React">React</option>
                <option value="JavaScript">JavaScript</option>
                <option value="Node.js">Node.js</option>
                <option value="Mobile">Mobile</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Project Confirmation Modal */}
      {activeProject && (
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Delete Project Confirmation"
          description="Are you sure you want to delete this analytics project?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              This will permanently revoke telemetry ingestion for{' '}
              <span className="font-semibold text-white">{activeProject.name}</span> (
              {activeProject.id}). Ingested historical events will no longer receive new updates.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteModalOpen(false)}
              >
                Keep Project
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteProject}>
                Yes, Delete Project
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

