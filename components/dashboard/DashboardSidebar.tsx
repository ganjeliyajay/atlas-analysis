'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Activity,
  Layers,
  Users,
  FileText,
  Filter,
  Calendar,
  Globe,
  Key,
  Download,
  Settings,
  HelpCircle,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Check,
  Building2,
  X,
} from 'lucide-react';
import { WORKSPACES } from '@/lib/dummy-data';
import { cn } from '@/lib/utils';

interface DashboardSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function DashboardSidebar({ mobileOpen, onMobileClose }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [currentWorkspace, setCurrentWorkspace] = useState(WORKSPACES[0]);

  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: BarChart3 },
    { label: 'Live Events', href: '/dashboard/live', icon: Activity, badge: 'Live' },
    { label: 'Events', href: '/dashboard/events', icon: Layers },
    { label: 'Users', href: '/dashboard/users', icon: Users },
    { label: 'Pages', href: '/dashboard/pages', icon: FileText },
    { label: 'Funnels', href: '/dashboard/funnels', icon: Filter },
    { label: 'Retention', href: '/dashboard/retention', icon: Calendar },
  ];

  const integrationItems = [
    { label: 'Projects / Websites', href: '/dashboard/projects', icon: Globe },
    { label: 'API Keys', href: '/dashboard/api-keys', icon: Key },
    { label: 'Installation', href: '/dashboard/installation', icon: Download },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between overflow-y-auto">
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800/80">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 transition-transform hover:scale-[1.02]"
            onClick={onMobileClose}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
              <Activity className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div>
                <span className="font-bold tracking-tight text-white text-base">Atlas</span>
                <span className="text-indigo-400 font-semibold text-base ml-1">Analytics</span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Workspace Switcher */}
        {!collapsed ? (
          <div className="relative px-3 py-3 border-b border-slate-800/60">
            <button
              onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
              className="flex w-full items-center justify-between rounded-lg bg-slate-900/80 p-2 text-left border border-slate-800 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-800 text-indigo-400">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold text-white truncate">
                    {currentWorkspace.name}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {currentWorkspace.plan} plan
                  </div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>

            {/* Switcher dropdown */}
            {workspaceMenuOpen && (
              <div className="absolute left-3 right-3 top-16 z-30 rounded-lg border border-slate-700 bg-[#0F172A] p-1.5 shadow-xl">
                <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 py-1">
                  Your Workspaces
                </div>
                {WORKSPACES.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setCurrentWorkspace(ws);
                      setWorkspaceMenuOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
                      ws.id === currentWorkspace.id
                        ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                        : 'text-slate-300 hover:bg-slate-800'
                    )}
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.id === currentWorkspace.id && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 border-b border-slate-800/60 flex justify-center">
            <div className="h-7 w-7 rounded-md bg-slate-800 flex items-center justify-center text-indigo-400 font-bold text-xs">
              {currentWorkspace.name[0]}
            </div>
          </div>
        )}

        {/* Analytics Section */}
        <div className="px-3 py-3">
          {!collapsed && (
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Analytics
            </div>
          )}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/40'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                    )}
                  />
                  {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto inline-flex items-center rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-medium text-emerald-300 animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Configuration Section */}
        <div className="px-3 py-2 border-t border-slate-800/50">
          {!collapsed && (
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Platform & SDK
            </div>
          )}
          <nav className="space-y-1">
            {integrationItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/40'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Ops Console Link */}
        <div className="px-3 py-2 border-t border-slate-800/50">
          <Link
            href="/ops"
            onClick={onMobileClose}
            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-400 hover:bg-amber-500/10 transition-colors border border-amber-500/20"
            title="Internal Ops Console"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400" />
            {!collapsed && <span>Ops Console</span>}
          </Link>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="border-t border-slate-800/80 p-3 space-y-2">
        {/* Help Link */}
        <Link
          href="/dashboard/installation"
          onClick={onMobileClose}
          className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-colors"
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Docs & SDK Help</span>}
        </Link>

        {/* Profile Card */}
        <div className="flex items-center justify-between rounded-lg bg-slate-900/60 p-2 border border-slate-800/70">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-xs font-bold text-white shadow">
              JV
            </div>
            {!collapsed && (
              <div className="truncate">
                <div className="text-xs font-semibold text-slate-200 truncate">Jay Vora</div>
                <div className="text-[10px] text-slate-400 truncate">jay@atlasanalytics.io</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <Link
              href="/login"
              title="Logout"
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </Link>
          )}
        </div>

        {/* Collapse toggle (Desktop only) */}
        <div className="hidden md:flex justify-end pt-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-800/50 transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-slate-800/90 bg-[#0B0F19] transition-all duration-200 z-30 shrink-0 sticky top-0 h-screen',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-[#0B0F19] border-r border-slate-800 shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

