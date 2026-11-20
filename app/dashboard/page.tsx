import React, { Suspense } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DashboardClientFilters } from "@/components/dashboard/DashboardClientFilters";
import { InteractiveChart } from "@/components/dashboard/InteractiveChart";
import { KpiWidget } from "@/components/dashboard/KpiWidget";
import { TopEventsWidget } from "@/components/dashboard/TopEventsWidget";
import { RecentEventsWidget } from "@/components/dashboard/RecentEventsWidget";
import {
  KpiGridSkeleton,
  ChartSkeleton,
  TopEventsSkeleton,
  RecentEventsSkeleton,
} from "@/components/dashboard/DashboardSkeletons";
import {
  getDashboardKpiData,
  getDashboardChartData,
  getDashboardTopEventsData,
  getDashboardRecentEventsData,
} from "@/lib/analytics/dashboard-service";
import { DateRangeOption } from "@/types/analytics";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function parseFilterParams(
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>
) {
  const rawParams = await searchParamsPromise;
  return {
    range: typeof rawParams.range === "string" ? rawParams.range : "30d",
    startDate: typeof rawParams.startDate === "string" ? rawParams.startDate : undefined,
    endDate: typeof rawParams.endDate === "string" ? rawParams.endDate : undefined,
    projectId: typeof rawParams.projectId === "string" ? rawParams.projectId : "All",
    eventName: typeof rawParams.eventName === "string" ? rawParams.eventName : "",
    userId: typeof rawParams.userId === "string" ? rawParams.userId : "",
  };
}

async function KpiSection({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const authUserId = session?.user?.id;
  if (!authUserId) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        Please sign in to view your dashboard analytics.
      </div>
    );
  }

  const filters = await parseFilterParams(searchParamsPromise);
  const response = await getDashboardKpiData({
    authUserId,
    ...filters,
  });

  if (response.status !== 200) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        {response.error}
      </div>
    );
  }

  return (
    <KpiWidget
      kpis={response.data.kpis}
      changes={response.data.changes}
    />
  );
}

async function ChartSection({ searchParamsPromise}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const authUserId = session?.user?.id;
  if (!authUserId) return null;

  const filters = await parseFilterParams(searchParamsPromise);
  const response = await getDashboardChartData({
    authUserId,
    ...filters,
  });

  if (response.status !== 200) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        {response.error}
      </div>
    );
  }

  return (
    <InteractiveChart
      eventsOverTime={response.data.eventsOverTime}
      activeUsersOverTime={response.data.activeUsersOverTime}
    />
  );
}

async function TopEventsSection({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const authUserId = session?.user?.id;
  if (!authUserId) return null;

  const filters = await parseFilterParams(searchParamsPromise);
  const response = await getDashboardTopEventsData({
    authUserId,
    ...filters,
  });

  if (response.status !== 200) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        {response.error}
      </div>
    );
  }
  return <TopEventsWidget topEvents={response.data.topEvents} />;
}

async function RecentEventsSection({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const authUserId = session?.user?.id;
  if (!authUserId) return null;

  const filters = await parseFilterParams(searchParamsPromise);
  const response = await getDashboardRecentEventsData({
    authUserId,
    ...filters,
  });

  if (response.status !== 200) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        {response.error}
      </div>
    );
  }
  return <RecentEventsWidget recentEvents={response.data.recentEvents} />;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const range = (typeof rawParams.range === "string" ? rawParams.range : "30d") as DateRangeOption;
  const startDate = typeof rawParams.startDate === "string" ? rawParams.startDate : "";
  const endDate = typeof rawParams.endDate === "string" ? rawParams.endDate : "";
  const eventName = typeof rawParams.eventName === "string" ? rawParams.eventName : "";
  const userId = typeof rawParams.userId === "string" ? rawParams.userId : "";

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:flex-row sm:items-center sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">ATLAS Analytics</span>
            <Badge variant="outline">Analytics dashboard</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Analytics from events received by your organization&apos;s projects.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/live">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Live Stream</span>
            </Button>
          </Link>
          <Link href="/dashboard/installation">
            <Button size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Integration SDK</span>
            </Button>
          </Link>
        </div>
      </div>

      <DashboardClientFilters
        currentRange={range}
        initialStartDate={startDate}
        initialEndDate={endDate}
        initialEventName
        ={eventName}
        initialUserId={userId}
         />
 
      <div className="space-y-6">
        <Suspense fallback={<KpiGridSkeleton />}>
          <KpiSection searchParamsPromise={searchParams} />
        </Suspense>

        <Suspense fallback={<ChartSkeleton />}>
          <ChartSection searchParamsPromise={searchParams} />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<TopEventsSkeleton />}>
            <TopEventsSection searchParamsPromise={searchParams} />
          </Suspense>
          <Suspense fallback={<RecentEventsSkeleton />}>
            <RecentEventsSection searchParamsPromise={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
