import React from "react";

export function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-slate-800" />
            <div className="h-7 w-7 rounded-lg bg-slate-800" />
          </div>
          <div className="mt-3 h-7 w-24 rounded bg-slate-800" />
          <div className="mt-2 h-3 w-16 rounded bg-slate-800" />
          <div className="mt-3 h-8 w-full rounded bg-slate-800/50" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="h-4 w-32 rounded bg-slate-800" />
          <div className="mt-1 h-3 w-48 rounded bg-slate-800" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-20 rounded-md bg-slate-800" />
          ))}
        </div>
      </div>
      <div className="mt-6 h-64 w-full rounded-lg bg-slate-950/40" />
    </div>
  );
}

export function TopEventsSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="h-4 w-28 rounded bg-slate-800" />
      <div className="mt-1 h-3 w-44 rounded bg-slate-800" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-24 rounded bg-slate-800" />
              <div className="h-3 w-12 rounded bg-slate-800" />
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecentEventsSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-4 w-28 rounded bg-slate-800" />
          <div className="mt-1 h-3 w-44 rounded bg-slate-800" />
        </div>
        <div className="h-6 w-16 rounded bg-slate-800" />
      </div>
      <div className="mt-4 divide-y divide-slate-800/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="py-2.5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-3.5 w-32 rounded bg-slate-800" />
              <div className="h-2.5 w-20 rounded bg-slate-800" />
            </div>
            <div className="h-3 w-16 rounded bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}

