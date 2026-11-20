"use client";

import React, { useState } from "react";
import { AreaChart } from "@/components/charts/AreaChart";
import { cn } from "@/lib/utils";

type ChartMetric = "activeUsers" | "eventVolume" | "sessions" | "pageViews";

const metricColors: Record<ChartMetric, string> = {
  activeUsers: "#6366f1",
  eventVolume: "#3b82f6",
  sessions: "#10b981",
  pageViews: "#8b5cf6",
};

const metricTitles: Record<ChartMetric, string> = {
  activeUsers: "Active Users",
  eventVolume: "Event Volume",
  sessions: "Total Sessions",
  pageViews: "Page Views",
};

interface InteractiveChartProps {
  eventsOverTime: { date: string; eventVolume: number }[];
  activeUsersOverTime: { date: string; activeUsers: number }[];
}

export function InteractiveChart({
  eventsOverTime,
  activeUsersOverTime,
}: InteractiveChartProps) {
  const [activeChartMetric, setActiveChartMetric] = useState<ChartMetric>("eventVolume");

  const chartData = (
    activeChartMetric === "activeUsers" ? activeUsersOverTime : eventsOverTime
  ).map((point) => ({
    date: point.date,
    label: point.date,
    value:
      activeChartMetric === "activeUsers"
        ? (point as { activeUsers: number }).activeUsers
        : (point as { eventVolume: number }).eventVolume,
  }));

  const unsupportedMetric =
    activeChartMetric === "sessions" || activeChartMetric === "pageViews";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            {metricTitles[activeChartMetric]} Over Time
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Historical trend telemetry for the selected period.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
          {(["eventVolume", "activeUsers", "sessions", "pageViews"] as ChartMetric[]).map(
            (metric) => (
              <button
                key={metric}
                type="button"
                onClick={() => setActiveChartMetric(metric)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  activeChartMetric === metric
                    ? "bg-slate-800 text-slate-100 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {metricTitles[metric]}
              </button>
            )
          )}
        </div>
      </div>

      <div className="mt-6">
        {unsupportedMetric ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 text-center text-sm text-slate-400">
            Telemetry rollup for {metricTitles[activeChartMetric]} is in continuous ingestion.
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 text-center text-sm text-slate-400">
            No event activity recorded for this period.
          </div>
        ) : (
          <AreaChart
            data={chartData}
            height={260}
            color={metricColors[activeChartMetric]}
          />
        )}
      </div>
    </div>
  );
}

