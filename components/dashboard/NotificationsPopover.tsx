'use client';

import React from 'react';
import { Bell, AlertTriangle, CheckCircle, Info, Sparkles, X } from 'lucide-react';

interface NotificationsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationsPopover({ isOpen, onClose }: NotificationsPopoverProps) {
  if (!isOpen) return null;

  const notifications = [
    {
      id: 1,
      title: 'Event Spike Detected',
      message: 'Page view volume increased by +42% in HRMS Analytics over the last 2 hours.',
      time: '12m ago',
      type: 'warning',
      icon: AlertTriangle,
      color: 'text-amber-400',
    },
    {
      id: 2,
      title: 'Ingestion Key Verified',
      message: 'Production Ingestion Key atl_live_8f9a2c3d successfully ingested 1.5M events.',
      time: '45m ago',
      type: 'success',
      icon: CheckCircle,
      color: 'text-emerald-400',
    },
    {
      id: 3,
      title: 'Atlas SDK v2.4 Released',
      message: 'Automatic session replay and Next.js 16 partial prefetching telemetry now available.',
      time: '2h ago',
      type: 'info',
      icon: Sparkles,
      color: 'text-indigo-400',
    },
    {
      id: 4,
      title: 'Retention Milestone',
      message: 'Week 4 user retention reached 49% — beating 30-day industry baseline.',
      time: '1d ago',
      type: 'info',
      icon: Info,
      color: 'text-blue-400',
    },
  ];

  return (
    <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-xl border border-slate-700 bg-[#0F172A] shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-indigo-400" />
          <h4 className="text-sm font-semibold text-white">Notifications</h4>
          <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
            4 New
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
        {notifications.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.id}
              className="p-3.5 hover:bg-slate-800/40 transition-colors flex gap-3 cursor-pointer"
            >
              <div className="mt-0.5">
                <Icon className={`h-4 w-4 ${n.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">{n.title}</span>
                  <span className="text-[10px] text-slate-500">{n.time}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">{n.message}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-[#090D16] px-4 py-2.5 text-center border-t border-slate-800">
        <button className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
          Mark all notifications as read
        </button>
      </div>
    </div>
  );
}

