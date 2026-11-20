"use client";

import React, { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { DateRangeOption } from "@/types/analytics";

interface DashboardClientFiltersProps {
  currentRange: DateRangeOption;
  initialStartDate?: string;
  initialEndDate?: string;
  initialEventName?: string;
  initialUserId?: string;
}

export function DashboardClientFilters({
  currentRange,
  initialStartDate = "",
  initialEndDate = "",
  initialEventName = "",
  initialUserId = "",
}: DashboardClientFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [range, setRange] = useState<DateRangeOption>(currentRange);
  const [customStartDate, setCustomStartDate] = useState(initialStartDate);
  const [customEndDate, setCustomEndDate] = useState(initialEndDate);
  const [appliedCustomStartDate, setAppliedCustomStartDate] = useState(initialStartDate);
  const [appliedCustomEndDate, setAppliedCustomEndDate] = useState(initialEndDate);
  const [customDateError, setCustomDateError] = useState("");

  const [eventNameFilter, setEventNameFilter] = useState(initialEventName);
  const [userIdFilter, setUserIdFilter] = useState(initialUserId);

  const [prevRange, setPrevRange] = useState(currentRange);
  if (currentRange !== prevRange) {
    setPrevRange(currentRange);
    setRange(currentRange);
  }

  const [prevStartDate, setPrevStartDate] = useState(initialStartDate);
  if (initialStartDate !== prevStartDate) {
    setPrevStartDate(initialStartDate);
    setCustomStartDate(initialStartDate);
    setAppliedCustomStartDate(initialStartDate);
  }

  const [prevEndDate, setPrevEndDate] = useState(initialEndDate);
  if (initialEndDate !== prevEndDate) {
    setPrevEndDate(initialEndDate);
    setCustomEndDate(initialEndDate);
    setAppliedCustomEndDate(initialEndDate);
  }

  const [prevEventName, setPrevEventName] = useState(initialEventName);
  if (initialEventName !== prevEventName) {
    setPrevEventName(initialEventName);
    setEventNameFilter(initialEventName);
  }

  const [prevUserId, setPrevUserId] = useState(initialUserId);
  if (initialUserId !== prevUserId) {
    setPrevUserId(initialUserId);
    setUserIdFilter(initialUserId);
  }

  const applyUrlParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`);
    });
  };

  const handleRangeSelect = (option: DateRangeOption) => {
    setRange(option);
    setAppliedCustomStartDate("");
    setAppliedCustomEndDate("");
    setCustomStartDate("");
    setCustomEndDate("");
    setCustomDateError("");

    applyUrlParams({
      range: option,
      startDate: null,
      endDate: null,
    });
  };

  const handleApplyCustomDates = () => {
    if (!customStartDate || !customEndDate) {
      setCustomDateError("Please select both a start date and an end date.");
      return;
    }
    if (customStartDate > customEndDate) {
      setCustomDateError("Start date must be on or before the end date.");
      return;
    }
    setCustomDateError("");
    setAppliedCustomStartDate(customStartDate);
    setAppliedCustomEndDate(customEndDate);
    setRange("custom");

    applyUrlParams({
      range: "custom",
      startDate: customStartDate,
      endDate: customEndDate,
    });
  };

  const handleClearCustomDates = () => {
    setCustomStartDate("");
    setCustomEndDate("");
    setAppliedCustomStartDate("");
    setAppliedCustomEndDate("");
    setCustomDateError("");
    setRange("30d");

    applyUrlParams({
      range: "30d",
      startDate: null,
      endDate: null,
    });
  };

  const handleApplyFilters = () => {
    applyUrlParams({
      eventName: eventNameFilter.trim() || null,
      userId: userIdFilter.trim() || null,
    });
  };

  const handleResetFilters = () => {
    setEventNameFilter("");
    setUserIdFilter("");
    applyUrlParams({
      eventName: null,
      userId: null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Date range pills */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Executive Telemetry Metrics
        </h2>

        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1">
          {(["today", "7d", "30d", "90d"] as DateRangeOption[]).map((option) => (
            <button
              key={option}
              type="button"
              disabled={isPending}
              onClick={() => handleRangeSelect(option)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                range === option && !appliedCustomStartDate
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {option === "today" ? "Today" : option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-100">Custom Date Range</h3>
          <p className="mt-1 text-xs text-slate-400">
            Choose a start and end date to view analytics for a specific period.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="customStartDate" className="mb-1.5 block text-xs font-medium text-slate-400">
              Start Date
            </label>
            <input
              id="customStartDate"
              type="date"
              value={customStartDate}
              max={customEndDate || undefined}
              onChange={(e) => {
                setCustomStartDate(e.target.value);
                setCustomDateError("");
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="customEndDate" className="mb-1.5 block text-xs font-medium text-slate-400">
              End Date
            </label>
            <input
              id="customEndDate"
              type="date"
              value={customEndDate}
              min={customStartDate || undefined}
              onChange={(e) => {
                setCustomEndDate(e.target.value);
                setCustomDateError("");
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={isPending} onClick={handleApplyCustomDates}>
              Apply Range
            </Button>
            <Button variant="secondary" disabled={isPending} onClick={handleClearCustomDates}>
              Clear
            </Button>
          </div>
        </div>
        {customDateError && (
          <p role="alert" className="mt-2 text-xs text-rose-400">
            {customDateError}
          </p>
        )}
        {appliedCustomStartDate && appliedCustomEndDate && (
          <p className="mt-3 text-xs text-indigo-300">
            Active range: {appliedCustomStartDate} – {appliedCustomEndDate}
          </p>
        )}
      </div>

      {/* Dashboard filters */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-100">Dashboard Filters</h3>
          <p className="mt-1 text-xs text-slate-400">Filter analytics by event name or user ID.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="eventNameFilter" className="mb-1.5 block text-xs font-medium text-slate-400">
              Event Name
            </label>
            <input
              id="eventNameFilter"
              type="text"
              value={eventNameFilter}
              onChange={(e) => setEventNameFilter(e.target.value)}
              placeholder="e.g. signup, page_view"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="userIdFilter" className="mb-1.5 block text-xs font-medium text-slate-400">
              User ID
            </label>
            <input
              id="userIdFilter"
              type="text"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              placeholder="e.g. usr_12345"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={isPending} onClick={handleApplyFilters}>
            Apply Filters
          </Button>
          <Button variant="secondary" disabled={isPending} onClick={handleResetFilters}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

