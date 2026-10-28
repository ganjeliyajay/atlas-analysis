'use client';

import React, { useState, useEffect } from 'react';
import { Search, Hash, Users, Layers, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open search modal
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickLinks = [
    { name: 'Live Event Stream', path: '/dashboard/live', icon: Hash, desc: 'Real-time telemetry feed' },
    { name: 'User: Sarah Patel', path: '/dashboard/users', icon: Users, desc: 'Active engineer in HRMS' },
    { name: 'Event: salary_slip_downloaded', path: '/dashboard/events', icon: Hash, desc: 'Payroll category' },
    { name: 'Funnel: HRMS Onboarding', path: '/dashboard/funnels', icon: Layers, desc: '5-step conversion' },
    { name: 'API Keys Management', path: '/dashboard/api-keys', icon: ExternalLink, desc: '3 active keys' },
    { name: 'Internal Ops Console', path: '/ops', icon: ExternalLink, desc: 'Superadmin tenant manager' },
  ];

  const filtered = query.trim()
    ? quickLinks.filter((q) =>
        q.name.toLowerCase().includes(query.toLowerCase()) ||
        q.desc.toLowerCase().includes(query.toLowerCase())
      )
    : quickLinks;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl rounded-xl border border-slate-700 bg-[#0F172A] shadow-2xl overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800">
          <Search className="h-5 w-5 text-slate-400 mr-3" />
          <input
            type="text"
            placeholder="Search events, users, pages, funnels, docs... (ESC to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="p-3 max-h-80 overflow-y-auto space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 py-1">
            Quick Navigation & Suggested Items
          </div>
          {filtered.map((item, idx) => {
            const Icon = item.icon;
            return (
              <Link
                key={idx}
                href={item.path}
                onClick={onClose}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800/80 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200 group-hover:text-white">
                      {item.name}
                    </div>
                    <div className="text-xs text-slate-400">{item.desc}</div>
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-mono group-hover:text-slate-300">
                  {item.path}
                </span>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        <div className="bg-[#090D16] px-4 py-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-800">
          <span>Navigate with arrows, Enter to select</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono">ESC</span>
        </div>
      </div>
    </div>
  );
}

