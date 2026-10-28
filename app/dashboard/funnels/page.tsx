'use client';

import React, { useState } from 'react';
import {
  Filter,
  Plus,
  Trash2,
  ArrowRight,
  TrendingDown,
  Layers,
  Sparkles,
  Info,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { INITIAL_FUNNEL } from '@/lib/dummy-data';
import { FunnelStep } from '@/types/analytics';
import { cn } from '@/lib/utils';

export default function FunnelAnalyticsPage() {
  const [funnelName, setFunnelName] = useState(INITIAL_FUNNEL.name);
  const [conversionWindow, setConversionWindow] = useState('7 days');
  const [steps, setSteps] = useState<FunnelStep[]>(INITIAL_FUNNEL.steps);

  const availableEvents = [
    'page_view',
    'employee_login',
    'attendance_viewed',
    'leave_applied',
    'salary_slip_downloaded',
    'button_clicked',
    'filter_applied',
    'report_exported',
    'user_signup',
  ];

  // Re-calculate funnel statistics based on steps
  const recalculateFunnel = (updatedSteps: FunnelStep[]) => {
    if (updatedSteps.length === 0) return updatedSteps;

    const baseUsers = updatedSteps[0].users || 14200;
    let prevUsers = baseUsers;

    return updatedSteps.map((step, idx) => {
      if (idx === 0) {
        return {
          ...step,
          order: 1,
          users: baseUsers,
          conversionFromFirst: 100,
          conversionFromPrevious: 100,
          dropOffRate: 0,
        };
      }

      // Simulate a natural progressive conversion decay
      const dropPct = 15 + (idx * 5) % 18;
      const stepUsers = Math.round(prevUsers * (1 - dropPct / 100));
      const convFromFirst = Number(((stepUsers / baseUsers) * 100).toFixed(1));
      const convFromPrev = Number(((stepUsers / prevUsers) * 100).toFixed(1));
      const actualDrop = Number((100 - convFromPrev).toFixed(1));

      prevUsers = stepUsers;

      return {
        ...step,
        order: idx + 1,
        users: stepUsers,
        conversionFromFirst: convFromFirst,
        conversionFromPrevious: convFromPrev,
        dropOffRate: actualDrop,
      };
    });
  };

  const handleStepEventChange = (index: number, newEventName: string) => {
    const updated = [...steps];
    updated[index].eventName = newEventName;
    updated[index].stepName = newEventName
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    setSteps(recalculateFunnel(updated));
  };

  const handleAddStep = () => {
    if (steps.length >= 6) return;
    const unusedEvent =
      availableEvents.find((e) => !steps.some((s) => s.eventName === e)) || 'button_clicked';

    const newStep: FunnelStep = {
      id: `step_${Date.now()}`,
      order: steps.length + 1,
      eventName: unusedEvent,
      stepName: unusedEvent
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      users: 0,
      conversionFromFirst: 0,
      conversionFromPrevious: 0,
      dropOffRate: 0,
      avgDuration: '2m 10s',
    };

    setSteps(recalculateFunnel([...steps, newStep]));
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 2) return; // Keep at least 2 steps
    const updated = steps.filter((_, i) => i !== index);
    setSteps(recalculateFunnel(updated));
  };

  const overallConversion =
    steps.length > 0 ? steps[steps.length - 1].conversionFromFirst : 0;
  const totalEntered = steps.length > 0 ? steps[0].users : 0;
  const overallDropOff = Number((100 - overallConversion).toFixed(1));

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Funnel Conversion Analytics</h1>
          <p className="mt-1 text-xs text-slate-400">
            Interactive multi-step funnel analysis to discover where users drop off in your workflow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="text-xs">
            Window: {conversionWindow}
          </Badge>
          <select
            value={conversionWindow}
            onChange={(e) => setConversionWindow(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white focus:outline-none"
          >
            <option value="24 hours">24 hours</option>
            <option value="7 days">7 days</option>
            <option value="14 days">14 days</option>
            <option value="30 days">30 days</option>
          </select>
        </div>
      </div>

      {/* Funnel Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Overall Conversion Rate</span>
          <div className="text-2xl font-bold text-white mt-1">{overallConversion}%</div>
          <div className="text-[11px] text-emerald-400 font-semibold mt-1">
            {steps[steps.length - 1]?.users.toLocaleString()} converted users
          </div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Total Users Entered</span>
          <div className="text-2xl font-bold text-white mt-1">
            {totalEntered.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Step 1 entry volume</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Overall Drop-off</span>
          <div className="text-2xl font-bold text-rose-400 mt-1">{overallDropOff}%</div>
          <div className="text-[11px] text-slate-400 mt-1">Total lost through flow</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400 font-medium">Average Time to Convert</span>
          <div className="text-2xl font-bold text-indigo-400 mt-1">8m 42s</div>
          <div className="text-[11px] text-slate-400 mt-1">Median completion duration</div>
        </Card>
      </div>

      {/* Visual Funnel Chart Presentation */}
      <Card className="p-6">
        <CardHeader>
          <div>
            <CardTitle className="text-base text-white">{funnelName}</CardTitle>
            <CardDescription>
              Progression visualization across {steps.length} sequential steps
            </CardDescription>
          </div>
          <div className="text-xs text-slate-400">
            {steps.length} of 6 steps configured
          </div>
        </CardHeader>

        <div className="mt-6 space-y-4">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.id} className="relative">
                {/* Step row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                      {step.order}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">
                          {step.stepName}
                        </span>
                        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-indigo-300 font-mono">
                          {step.eventName}
                        </code>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Avg duration: <span className="font-mono">{step.avgDuration}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 text-right">
                    <div>
                      <div className="text-xs text-slate-400">Step Users</div>
                      <div className="text-base font-bold text-white font-mono">
                        {step.users.toLocaleString()}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-400">Conversion</div>
                      <div className="text-base font-bold text-emerald-400 font-mono">
                        {step.conversionFromFirst}%
                      </div>
                    </div>

                    {idx > 0 && (
                      <div>
                        <div className="text-xs text-slate-400">Drop-off</div>
                        <div className="text-sm font-semibold text-rose-400 font-mono">
                          -{step.dropOffRate}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar visual width representation */}
                <div className="mt-1.5 h-2 w-full rounded-full bg-slate-800/80 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300"
                    style={{ width: `${step.conversionFromFirst}%` }}
                  />
                </div>

                {/* Arrow connector */}
                {!isLast && (
                  <div className="flex justify-center my-1 text-slate-600">
                    <TrendingDown className="h-4 w-4 text-slate-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Funnel Builder / Step Configuration */}
      <Card className="p-6">
        <CardHeader>
          <div>
            <CardTitle>Funnel Step Configuration</CardTitle>
            <CardDescription>
              Customize, add, or remove steps (2–6 steps supported). Changes update the funnel calculation in real-time.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleAddStep}
            disabled={steps.length >= 6}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Step</span>
          </Button>
        </CardHeader>

        <div className="mt-4 space-y-3">
          {steps.map((step, idx) => (
            <div
              key={step.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-900/40 p-3"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-slate-400 w-6">
                  #{idx + 1}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Trigger Event:</span>
                  <select
                    value={step.eventName}
                    onChange={(e) => handleStepEventChange(idx, e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                  >
                    {availableEvents.map((evt) => (
                      <option key={evt} value={evt}>
                        {evt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 justify-end">
                <span className="text-xs text-slate-400 font-mono">
                  {step.users.toLocaleString()} users ({step.conversionFromFirst}%)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveStep(idx)}
                  disabled={steps.length <= 2}
                  className="p-1 h-7 text-slate-400 hover:text-rose-400 disabled:opacity-30"
                  title="Remove Step"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

