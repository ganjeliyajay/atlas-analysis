import React from "react";

type TopEventsProps = {
  topEvents: {
    name: string;
    count: number;
    percentage: number;
  }[];
};

export function TopEventsWidget({ topEvents }: TopEventsProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="text-sm font-semibold text-slate-100">Top Events</h3>
      <p className="mt-1 text-xs text-slate-400">Most frequent actions in this timeframe.</p>

      <div className="mt-4 space-y-3">
        {topEvents.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No events recorded in this period.</p>
        ) : (
          topEvents.map((event) => (
            <div key={event.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-slate-200 truncate max-w-[200px]">{event.name}</span>
                <span className="text-slate-400">
                  {event.count.toLocaleString()} ({event.percentage}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${event.percentage}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

