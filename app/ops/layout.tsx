import React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, Activity, Bell, Server } from 'lucide-react';

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 flex flex-col">
      {/* Platform Admin Top Header */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-amber-500/20 bg-[#090D16]/95 px-4 sm:px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Exit to Customer Dashboard</span>
          </Link>

          <span className="text-slate-700">|</span>

          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              ATLAS PLATFORM OPERATIONS CONSOLE
            </span>
            <span className="hidden md:inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/20">
              INTERNAL ROOT ACCESS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="hidden sm:flex items-center gap-2 text-slate-400 font-mono">
            <Server className="h-3.5 w-3.5 text-emerald-400" />
            <span>Cluster: us-east-prod-01</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-semibold text-xs">Ingestion OK</span>
          </div>
        </div>
      </header>

      {/* Main Admin Surface */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

