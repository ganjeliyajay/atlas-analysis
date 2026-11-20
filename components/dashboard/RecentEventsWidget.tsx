import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ArrowUpRight } from "lucide-react";

type RecentEventsProps = {
  recentEvents: {
    id: string;
    name: string;
    userId: string | null;
    projectName: string;
    timestamp: string;
    relativeTime: string;
  }[];
};

export function RecentEventsWidget({ recentEvents }: RecentEventsProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Recent Activity</h3>
          <p className="mt-1 text-xs text-slate-400">Live incoming event stream.</p>
        </div>
        <Link
          href="/dashboard/events"
          className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
        >
          <span>View All</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 divide-y divide-slate-800/60">
        {recentEvents.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No recent event activity.</p>
        ) : (
          recentEvents.map((event) => (
            <div key={event.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0 flex-1 pr-3">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs font-medium text-slate-200">
                    {event.name}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {event.projectName}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {event.userId ? `User: ${event.userId}` : "Anonymous"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{event.relativeTime}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

