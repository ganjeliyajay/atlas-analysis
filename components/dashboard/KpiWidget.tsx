import React from "react";
import { Activity, Users, Layers, Clock, Eye, TrendingUp, TrendingDown } from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";
import { cn } from "@/lib/utils";

type KpiProps = {
  kpis: {
    totalEvents: number;
    activeUsers: number;
    dau: number;
    wau: number;
    mau: number;
  };
  changes: {
    totalEvents: number | null;
    activeUsers: number | null;
  };
  eventsOverTime?: { date: string; eventVolume: number }[];
  activeUsersOverTime?: { date: string; activeUsers: number }[];
};

function formatChange(change: number | null) {
  if (change === null) return "—";
  return `${change > 0 ? "+" : ""}${change}%`;
}

export function KpiWidget({
  kpis,
  changes,
  eventsOverTime = [],
  activeUsersOverTime = [],
}: KpiProps) {
  const cards = [
    {
      title: "Total Events",
      description: "All events received during the selected date range, including anonymous events.",
      value: kpis.totalEvents.toLocaleString(),
      change: changes.totalEvents,
      trend: changes.totalEvents === null ? "neutral" : changes.totalEvents >= 0 ? "up" : "down",
      sparkline: eventsOverTime.map((d) => d.eventVolume),
      icon: Activity,
    },
    {
      title: "Active Users",
      description: "Unique identified users during the selected date range. Anonymous events are excluded.",
      value: kpis.activeUsers.toLocaleString(),
      change: changes.activeUsers,
      trend: changes.activeUsers === null ? "neutral" : changes.activeUsers >= 0 ? "up" : "down",
      sparkline: activeUsersOverTime.map((d) => d.activeUsers),
      icon: Users,
    },
    {
      title: "DAU",
      description: "Unique identified users since 00:00 UTC today.",
      value: kpis.dau.toLocaleString(),
      change: null,
      trend: "neutral" as const,
      sparkline: [],
      icon: Layers,
    },
    {
      title: "WAU",
      description: "Unique identified users in the trailing 7 × 24 hours.",
      value: kpis.wau.toLocaleString(),
      change: null,
      trend: "neutral" as const,
      sparkline: [],
      icon: Clock,
    },
    {
      title: "MAU",
      description: "Unique identified users in the trailing 30 × 24 hours.",
      value: kpis.mau.toLocaleString(),
      change: null,
      trend: "neutral" as const,
      sparkline: [],
      icon: Eye,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.title}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium text-slate-400"
                title={card.description}
                aria-label={`${card.title}: ${card.description}`}
              >
                {card.title}
              </span>
              <div className="rounded-lg bg-indigo-500/10 p-1.5 text-indigo-400">
                <Icon className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-white">{card.value}</span>
              {card.change !== null && (
                <span
                  className={cn(
                    "flex items-center text-xs font-medium",
                    card.trend === "up" && "text-emerald-400",
                    card.trend === "down" && "text-rose-400",
                    card.trend === "neutral" && "text-slate-400"
                  )}
                >
                  {card.trend === "up" && <TrendingUp className="mr-0.5 h-3 w-3" />}
                  {card.trend === "down" && <TrendingDown className="mr-0.5 h-3 w-3" />}
                  {formatChange(card.change)}
                </span>
              )}
            </div>

            {card.sparkline.length > 0 && (
              <div className="mt-3 h-8">
                <Sparkline data={card.sparkline} color="#6366f1" height={32} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

