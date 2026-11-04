
"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Trash2,
  TrendingDown,
  RefreshCw,
  CalendarDays,
  Users,
  Target,
  AlertTriangle,
  Trophy,
  GitCompareArrows,
  BarChart3,
} from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";

import { Button } from "@/components/ui/Button";

type FunnelStep = {
  id: string;
  name: string;
  type: "event" | "page";
  value: string;
};

type ApiFunnelStep = {
  stepNumber: number;
  name: string;
  type: string;
  value: string;
  users: number;
  conversionRate: number;
  dropOffUsers: number;
  dropOffRate: number;
  overallConversionRate: number;
};

type FunnelApiResponse = {
  success?: boolean;
  funnel?: {
    eventName: string;
    users: number;
    conversionFromStart: number;
    conversionFromPrevious: number;
    dropOffFromPrevious: number;
  }[];
  totalUsers?: number;
  conversionWindowDays?: number;
  data?: {
    steps: ApiFunnelStep[];
    summary: {
      totalUsers: number;
      convertedUsers: number;
      overallConversionRate: number;
      overallDropOffRate: number;
      conversionWindowDays: number;
    };
    range: {
      startDate: string;
      endDate: string;
    };
  };
  error?: string;
};

type ComparisonStep = {
  eventName: string;
  users: number;
  conversionFromStart: number;
  conversionFromPrevious: number;
  dropOffFromPrevious: number;
};

type ComparisonFunnel = {
  id: string;
  name: string;
  totalUsers: number;
  convertedUsers: number;
  overallConversionRate: number;
  overallDropOffRate: number;
  steps: ComparisonStep[];
};

type FunnelComparisonResponse = {
  results: ComparisonFunnel[];
  bestPerformingFunnel: {
    id: string;
    name: string;
    overallConversionRate: number;
  } | null;
};

const AVAILABLE_EVENTS = [
  "page_view",
  "user_signup",
  "employee_login",
  "attendance_viewed",
  "leave_applied",
  "salary_slip_downloaded",
  "button_clicked",
  "filter_applied",
  "report_exported",
];

const createDefaultSteps = (): FunnelStep[] => [
  {
    id: "step_1",
    name: "Page Viewed",
    type: "event",
    value: "page_view",
  },
  {
    id: "step_2",
    name: "User Signup",
    type: "event",
    value: "user_signup",
  },
  {
    id: "step_3",
    name: "Employee Login",
    type: "event",
    value: "employee_login",
  },
];

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();

  start.setDate(start.getDate() - 30);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getApiRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);

  const days =
    Math.ceil(
      (end.getTime() - start.getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  return days <= 1
    ? "today"
    : days <= 7
      ? "7d"
      : days <= 30
        ? "30d"
        : "90d";
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString();
}

function getEventLabel(event: string) {
  return event
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeComparisonResult(
  data: any
): FunnelComparisonResponse {
  const rawResults = Array.isArray(data?.results)
    ? data.results
    : [];

  const results: ComparisonFunnel[] = rawResults.map(
    (item: any) => {
      const rawSteps = Array.isArray(item.steps)
        ? item.steps
        : Array.isArray(item.funnel)
          ? item.funnel
          : Array.isArray(item.data?.funnel)
            ? item.data.funnel
            : [];

      const steps: ComparisonStep[] = rawSteps.map(
        (step: any, index: number) => ({
          eventName:
            step.eventName ||
            step.name ||
            step.value ||
            `Step ${index + 1}`,
          users: Number(step.users || 0),
          conversionFromStart: Number(
            step.conversionFromStart ??
              step.overallConversionRate ??
              0
          ),
          conversionFromPrevious: Number(
            step.conversionFromPrevious ??
              step.conversionRate ??
              0
          ),
          dropOffFromPrevious: Number(
            step.dropOffFromPrevious ??
              step.dropOffRate ??
              0
          ),
        })
      );

      const totalUsers = Number(
        item.totalUsers ??
          item.summary?.totalUsers ??
          steps[0]?.users ??
          0
      );

      const convertedUsers = Number(
        item.convertedUsers ??
          item.summary?.convertedUsers ??
          steps[steps.length - 1]?.users ??
          0
      );

      const lastStepConversion =
        steps.length > 0
          ? steps[steps.length - 1].conversionFromStart
          : 0;

      const overallConversionRate = Number(
        item.overallConversionRate ??
          item.summary?.overallConversionRate ??
          lastStepConversion
      );

      const overallDropOffRate = Number(
        item.overallDropOffRate ??
          item.summary?.overallDropOffRate ??
          (totalUsers > 0
            ? ((totalUsers - convertedUsers) / totalUsers) * 100
            : 0)
      );

      return {
        id: String(item.id || item.name || Math.random()),
        name: String(item.name || "Unnamed Funnel"),
        totalUsers,
        convertedUsers,
        overallConversionRate,
        overallDropOffRate,
        steps,
      };
    }
  );

  const best = data?.bestPerformingFunnel;

  return {
    results,
    bestPerformingFunnel: best
      ? {
          id: String(best.id),
          name: String(best.name),
          overallConversionRate: Number(
            best.overallConversionRate || 0
          ),
        }
      : results.length > 0
        ? (() => {
            const winner = [...results].sort(
              (a, b) =>
                b.overallConversionRate -
                a.overallConversionRate
            )[0];

            return winner.totalUsers > 0
              ? {
                  id: winner.id,
                  name: winner.name,
                  overallConversionRate:
                    winner.overallConversionRate,
                }
              : null;
          })()
        : null,
  };
}

export default function FunnelAnalyticsPage() {
  const searchParams = useSearchParams();

  const projectId = searchParams.get("projectId") ?? "All";

  const [funnelName, setFunnelName] = useState(
    "Signup Conversion Funnel"
  );

  const [steps, setSteps] =
    useState<FunnelStep[]>(createDefaultSteps);

  const [conversionWindowDays, setConversionWindowDays] =
    useState("7");

  const [dateRange, setDateRange] = useState(
    getDefaultDateRange
  );

  const [result, setResult] = useState<
    FunnelApiResponse["data"] | null
  >(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [comparisonLoading, setComparisonLoading] =
    useState(false);

  const [comparisonError, setComparisonError] = useState<
    string | null
  >(null);

  const [comparison, setComparison] =
    useState<FunnelComparisonResponse | null>(null);

  const fetchFunnelData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const range = getApiRange(
        dateRange.startDate,
        dateRange.endDate
      );

      const params = new URLSearchParams();

      if (projectId !== "All") {
        params.set("projectId", projectId);
      }

      params.set("range", range);

      params.set(
        "conversionWindowDays",
        String(Number(conversionWindowDays))
      );

      params.set(
        "steps",
        steps.map((step) => step.value).join(",")
      );

      const response = await fetch(
        `/api/analytics/funnels?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data: FunnelApiResponse | null =
        await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Failed to load funnel analytics (${response.status})`
        );
      }

      if (!data) {
        throw new Error("Funnel API returned an invalid response");
      }

      const rawSteps = Array.isArray(data.funnel)
        ? data.funnel
        : [];

      const lastStepUsers = rawSteps.length
        ? rawSteps[rawSteps.length - 1].users
        : 0;

      const formattedData: NonNullable<
        FunnelApiResponse["data"]
      > = {
        steps: rawSteps.map((step, index) => {
          const previousStepUsers =
            index > 0 ? rawSteps[index - 1].users : 0;

          const dropOffUsers =
            index > 0
              ? Math.max(0, previousStepUsers - step.users)
              : 0;

          const dropOffRate =
            index > 0 && previousStepUsers > 0
              ? (dropOffUsers / previousStepUsers) * 100
              : 0;

          return {
            stepNumber: index + 1,
            name: step.eventName,
            type: "event",
            value: step.eventName,
            users: step.users,
            conversionRate: step.conversionFromPrevious,
            dropOffUsers,
            dropOffRate,
            overallConversionRate: step.conversionFromStart,
          };
        }),

        summary: {
          totalUsers: Number(data.totalUsers || 0),
          convertedUsers: lastStepUsers,
          overallConversionRate: rawSteps.length
            ? rawSteps[rawSteps.length - 1].conversionFromStart
            : 0,
          overallDropOffRate:
            Number(data.totalUsers || 0) > 0
              ? ((Number(data.totalUsers || 0) -
                  lastStepUsers) /
                  Number(data.totalUsers || 0)) *
                100
              : 0,
          conversionWindowDays: Number(
            data.conversionWindowDays || conversionWindowDays
          ),
        },

        range: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      };

      setResult(formattedData);
    } catch (err) {
      console.error("Funnel analytics error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong loading funnel analytics"
      );

      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [
    projectId,
    dateRange,
    conversionWindowDays,
    steps,
  ]);

  const compareFunnels = async () => {
    setComparisonLoading(true);
    setComparisonError(null);

    try {
      const range = getApiRange(
        dateRange.startDate,
        dateRange.endDate
      );

      const funnels = [
        {
          id: "current-funnel",
          name: funnelName.trim() || "Current Funnel",
          steps: steps.map((step) => step.value),
        },
        {
          id: "engagement-funnel",
          name: "HRMS Engagement Funnel",
          steps: [
            "page_view",
            "employee_login",
            "attendance_viewed",
          ],
        },
      ];

      const response = await fetch(
        "/api/analytics/funnels/compare",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            range,
            conversionWindowDays: Number(
              conversionWindowDays
            ),
            projectId,
            funnels,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || "Failed to compare funnels"
        );
      }

      if (!data || !Array.isArray(data.results)) {
        throw new Error(
          "Comparison API returned an invalid response"
        );
      }

      setComparison(normalizeComparisonResult(data));
    } catch (err) {
      console.error("Funnel comparison error:", err);

      setComparisonError(
        err instanceof Error
          ? err.message
          : "Something went wrong while comparing funnels"
      );

      setComparison(null);
    } finally {
      setComparisonLoading(false);
    }
  };

  const handleAddStep = () => {
    if (steps.length >= 6) return;

    const unusedEvent =
      AVAILABLE_EVENTS.find(
        (event) => !steps.some((step) => step.value === event)
      ) || "button_clicked";

    const formattedName = getEventLabel(unusedEvent);

    setSteps((current) => [
      ...current,
      {
        id: `step_${Date.now()}`,
        name: formattedName,
        type: "event",
        value: unusedEvent,
      },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 2) return;

    setSteps((current) =>
      current.filter((_, i) => i !== index)
    );
  };

  const handleEventChange = (
    index: number,
    newValue: string
  ) => {
    const formattedName = getEventLabel(newValue);

    setSteps((current) =>
      current.map((step, i) =>
        i === index
          ? {
              ...step,
              value: newValue,
              name: formattedName,
              type: "event",
            }
          : step
      )
    );
  };

  const handleStepNameChange = (
    index: number,
    newName: string
  ) => {
    setSteps((current) =>
      current.map((step, i) =>
        i === index ? { ...step, name: newName } : step
      )
    );
  };

  const apiSteps = result?.steps ?? [];
  const summary = result?.summary;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Funnel Conversion Analytics
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            Analyze user journeys and discover where users drop off.
          </p>
        </div>

        <Button
          onClick={fetchFunnelData}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loading ? "animate-spin" : ""
            }`}
          />
          Refresh
        </Button>
      </div>

      {/* Funnel Configuration */}
      <Card className="p-5">
        <CardHeader>
          <div>
            <CardTitle className="text-base text-white">
              Funnel Configuration
            </CardTitle>

            <CardDescription>
              Configure the steps and date range for your funnel.
            </CardDescription>
          </div>
        </CardHeader>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Funnel Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Funnel Name
            </label>

            <input
              value={funnelName}
              onChange={(e) => setFunnelName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              placeholder="Enter funnel name"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Start Date
            </label>

            <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3">
              <CalendarDays className="h-4 w-4 text-slate-500" />

              <input
                type="date"
                value={dateRange.startDate}
                max={dateRange.endDate}
                onChange={(e) =>
                  setDateRange((current) => ({
                    ...current,
                    startDate: e.target.value,
                  }))
                }
                className="w-full bg-transparent py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              End Date
            </label>

            <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3">
              <CalendarDays className="h-4 w-4 text-slate-500" />

              <input
                type="date"
                value={dateRange.endDate}
                min={dateRange.startDate}
                onChange={(e) =>
                  setDateRange((current) => ({
                    ...current,
                    endDate: e.target.value,
                  }))
                }
                className="w-full bg-transparent py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          {/* Conversion Window */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Conversion Window
            </label>

            <select
              value={conversionWindowDays}
              onChange={(e) =>
                setConversionWindowDays(e.target.value)
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
            >
              <option value="1">Within 1 day</option>
              <option value="7">Within 7 days</option>
              <option value="30">Within 30 days</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Funnel Comparison */}
      <Card className="p-5">
        <CardHeader>
          <div>
            <div className="flex items-center gap-2">
              <GitCompareArrows className="h-5 w-5 text-indigo-400" />

              <CardTitle className="text-base text-white">
                Funnel Comparison & Optimization
              </CardTitle>
            </div>

            <CardDescription>
              Compare conversion performance across different user journeys.
            </CardDescription>
          </div>

          <Button
            onClick={compareFunnels}
            disabled={comparisonLoading || steps.length < 2}
            className="gap-2"
          >
            {comparisonLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4" />
            )}

            {comparisonLoading
              ? "Comparing..."
              : "Compare Funnels"}
          </Button>
        </CardHeader>

        {comparisonError && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="flex items-start gap-2 text-sm text-rose-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

              <div>
                <p className="font-semibold">
                  Comparison Failed
                </p>
                <p className="mt-1">{comparisonError}</p>
              </div>
            </div>
          </div>
        )}

        {comparison?.bestPerformingFunnel && (
          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-emerald-400" />

              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                Best Performing Funnel
              </p>
            </div>

            <h3 className="mt-2 text-lg font-bold text-white">
              {comparison.bestPerformingFunnel.name}
            </h3>

            <p className="mt-1 text-sm text-emerald-300">
              {formatPercent(
                comparison.bestPerformingFunnel
                  .overallConversionRate
              )}{" "}
              overall conversion
            </p>
          </div>
        )}

        {comparison && comparison.results.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {comparison.results.map((funnel) => (
              <div
                key={funnel.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">
                      {funnel.name}
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {funnel.steps.length} funnel steps
                    </p>
                  </div>

                  {comparison.bestPerformingFunnel?.id ===
                    funnel.id && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                      BEST
                    </span>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">
                      Total Users
                    </p>

                    <p className="mt-1 text-xl font-bold text-white">
                      {formatNumber(funnel.totalUsers)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Converted Users
                    </p>

                    <p className="mt-1 text-xl font-bold text-emerald-400">
                      {formatNumber(funnel.convertedUsers)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Conversion Rate
                    </p>

                    <p className="mt-1 text-xl font-bold text-indigo-400">
                      {formatPercent(
                        funnel.overallConversionRate
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Drop-off Rate
                    </p>

                    <p className="mt-1 text-xl font-bold text-rose-400">
                      {formatPercent(
                        funnel.overallDropOffRate
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-800 pt-4">
                  <p className="mb-4 text-xs font-semibold text-slate-400">
                    STEP-WISE PERFORMANCE
                  </p>

                  {funnel.steps.map((step, index) => (
                    <div
                      key={`${funnel.id}-${index}`}
                      className="mb-4 last:mb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-300">
                          {index + 1}.{" "}
                          {getEventLabel(step.eventName)}
                        </span>

                        <span className="text-xs font-semibold text-white">
                          {formatNumber(step.users)}
                        </span>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                step.conversionFromStart
                              )
                            )}%`,
                          }}
                        />
                      </div>

                      <div className="mt-1 flex justify-between gap-2">
                        <span className="text-[10px] text-slate-500">
                          From first step:{" "}
                          {formatPercent(
                            step.conversionFromStart
                          )}
                        </span>

                        {index > 0 && (
                          <span className="text-[10px] text-rose-400">
                            Drop-off:{" "}
                            {formatPercent(
                              step.dropOffFromPrevious
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {funnel.steps.length === 0 && (
                    <p className="text-xs text-slate-500">
                      No step data available for this funnel.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {comparison &&
          comparison.results.length === 0 && (
            <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-center">
              <p className="text-sm text-slate-400">
                No comparison data found for the selected period.
              </p>
            </div>
          )}

        {!comparison && !comparisonLoading && !comparisonError && (
          <div className="mt-5 rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center">
            <GitCompareArrows className="mx-auto h-8 w-8 text-slate-600" />

            <p className="mt-3 text-sm font-medium text-slate-300">
              Compare your user journeys
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Run comparison to discover which funnel converts more users.
            </p>
          </div>
        )}
      </Card>

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-400">
          Loading funnel analytics...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-start gap-2 text-sm text-rose-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

            <div>
              <p className="font-semibold">
                Unable to load funnel
              </p>

              <p className="mt-1">{error}</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchFunnelData}
            className="mt-3 text-rose-400"
          >
            Retry
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Overall Conversion
            </span>

            <Target className="h-4 w-4 text-emerald-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {formatPercent(
              summary?.overallConversionRate ?? 0
            )}
          </div>

          <p className="mt-1 text-[11px] text-emerald-400">
            {formatNumber(summary?.convertedUsers ?? 0)} converted users
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Total Entered
            </span>

            <Users className="h-4 w-4 text-indigo-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {formatNumber(summary?.totalUsers ?? 0)}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Users at first step
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Overall Drop-off
            </span>

            <TrendingDown className="h-4 w-4 text-rose-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-rose-400">
            {formatPercent(
              summary?.overallDropOffRate ?? 0
            )}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Users lost through the funnel
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Funnel Steps
            </span>

            <Target className="h-4 w-4 text-violet-400" />
          </div>

          <div className="mt-2 text-2xl font-bold text-white">
            {steps.length}
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Configured steps
          </p>
        </Card>
      </div>

      {/* Funnel Visualization */}
      <Card className="p-5">
        <CardHeader>
          <div>
            <CardTitle className="text-base text-white">
              {funnelName || "Funnel Overview"}
            </CardTitle>

            <CardDescription>
              User progression across each funnel step
            </CardDescription>
          </div>

          <span className="text-xs text-slate-400">
            {steps.length} steps
          </span>
        </CardHeader>

        <div className="mt-5 space-y-4">
          {steps.map((step, index) => {
            const apiStep = apiSteps[index];

            const users = apiStep?.users ?? 0;

            const conversionRate =
              apiStep?.overallConversionRate ?? 0;

            const dropOffRate =
              apiStep?.dropOffRate ?? 0;

            return (
              <div key={step.id}>
                <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                      {index + 1}
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-white">
                        {step.name}
                      </div>

                      <code className="mt-1 block text-[10px] text-indigo-300">
                        {step.value}
                      </code>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 sm:justify-end">
                    <div>
                      <p className="text-xs text-slate-400">
                        Users
                      </p>

                      <p className="font-mono text-sm font-bold text-white">
                        {formatNumber(users)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">
                        From First Step
                      </p>

                      <p className="font-mono text-sm font-bold text-emerald-400">
                        {formatPercent(conversionRate)}
                      </p>
                    </div>

                    {index > 0 && (
                      <div>
                        <p className="text-xs text-slate-400">
                          Drop-off
                        </p>

                        <p className="font-mono text-sm font-bold text-rose-400">
                          {formatPercent(dropOffRate)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, conversionRate)
                      )}%`,
                    }}
                  />
                </div>

                {index < steps.length - 1 && (
                  <div className="my-2 flex justify-center">
                    <TrendingDown className="h-4 w-4 text-slate-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Step Builder */}
      <Card className="p-5">
        <CardHeader>
          <div>
            <CardTitle className="text-base text-white">
              Funnel Step Builder
            </CardTitle>

            <CardDescription>
              Choose 2 to 6 ordered steps to measure user conversion.
            </CardDescription>
          </div>

          <Button
            size="sm"
            onClick={handleAddStep}
            disabled={
              steps.length >= 6 ||
              steps.length >= AVAILABLE_EVENTS.length
            }
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Step
          </Button>
        </CardHeader>

        <div className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="w-7 font-mono text-xs font-bold text-slate-400">
                  #{index + 1}
                </span>

                <div className="flex-1">
                  <label className="mb-1 block text-[11px] text-slate-400">
                    Step Name
                  </label>

                  <input
                    value={step.name}
                    onChange={(e) =>
                      handleStepNameChange(index, e.target.value)
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-1 items-center gap-3 sm:justify-end">
                <div className="flex-1 sm:max-w-xs">
                  <label className="mb-1 block text-[11px] text-slate-400">
                    Event
                  </label>

                  <select
                    value={step.value}
                    onChange={(e) =>
                      handleEventChange(index, e.target.value)
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                  >
                    {AVAILABLE_EVENTS.map((event) => (
                      <option key={event} value={event}>
                        {event}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveStep(index)}
                  disabled={steps.length <= 2}
                  className="mt-5 h-8 text-slate-400 hover:text-rose-400 disabled:opacity-30"
                  title="Remove step"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col justify-between gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500">
            Changes will be applied when you click Run Analysis.
          </p>

          <Button
            onClick={fetchFunnelData}
            disabled={loading || steps.length < 2}
            className="gap-2"
          >
            <Target className="h-4 w-4" />
            Run Analysis
          </Button>
        </div>
      </Card>
    </div>
  );
}
