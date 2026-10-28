'use client';

import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  Terminal,
  Code2,
  Send,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PROJECTS, INITIAL_API_KEYS } from '@/lib/dummy-data';
import { cn } from '@/lib/utils';

export default function InstallationPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<
    'nextjs' | 'react' | 'javascript' | 'nodejs' | 'rest'
  >('nextjs');
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0].id);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeStep, setActiveStep] = useState(4); // Default to Step 4: Add Tracking Code

  // Test event simulator state
  const [testStatus, setTestStatus] = useState<
    'idle' | 'sending' | 'success' | 'verified'
  >('idle');
  const [testResponsePayload, setTestResponsePayload] = useState<string | null>(null);

  const activeApiKey = INITIAL_API_KEYS[0].keyPrefix + '_demo_token';

  const snippets = {
    nextjs: `// app/layout.tsx
import { AtlasProvider } from '@atlas/analytics-next';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AtlasProvider
          apiKey="${activeApiKey}"
          options={{
            trackPageviews: true,
            trackWebVitals: true,
            apiHost: 'https://ingest.atlasanalytics.io'
          }}
        >
          {children}
        </AtlasProvider>
      </body>
    </html>
  );
}`,
    react: `// src/index.tsx or App.tsx
import { initAtlas } from '@atlas/analytics-react';

initAtlas({
  apiKey: '${activeApiKey}',
  autoCapture: true,
  debug: false
});

export function App() {
  return <div>Your React App</div>;
}`,
    javascript: `<!-- Add to <head> of your HTML -->
<script
  defer
  data-domain="hrms.enterprise.io"
  data-api-key="${activeApiKey}"
  src="https://cdn.atlasanalytics.io/v2/atlas.min.js">
</script>

<script>
  window.atlas = window.atlas || function() { (window.atlas.q = window.atlas.q || []).push(arguments) };
  atlas('track', 'page_view');
</script>`,
    nodejs: `// server.js or lib/analytics.js
import { AtlasClient } from '@atlas/analytics-node';

const atlas = new AtlasClient({
  apiKey: '${activeApiKey}',
  flushAt: 20,
  flushInterval: 5000
});

await atlas.track({
  event: 'employee_login',
  userId: 'usr_emp_4412',
  properties: {
    department: 'Engineering',
    login_method: 'SAML_SSO'
  }
});`,
    rest: `# Direct HTTP POST Telemetry Ingestion
curl -X POST https://ingest.atlasanalytics.io/api/v1/events \\
  -H "Authorization: Bearer ${activeApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "button_clicked",
    "userId": "usr_9918",
    "timestamp": "2026-10-28T18:00:00Z",
    "properties": {
      "element_id": "btn_punch_in",
      "shift": "morning"
    }
  }'`,
  };

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleSendTestEvent = () => {
    setTestStatus('sending');
    setTimeout(() => {
      setTestStatus('success');
      setTestResponsePayload(
        JSON.stringify(
          {
            status: 200,
            message: 'Event accepted and buffered',
            event_id: `evt_test_${Date.now()}`,
            tenant_id: 'ten_jay_9918',
            received_at: new Date().toISOString(),
            latency_ms: 24,
          },
          null,
          2
        )
      );
    }, 1200);
  };

  const stepsList = [
    { num: 1, title: 'Project Registered', desc: 'HRMS Analytics created' },
    { num: 2, title: 'API Key Active', desc: 'atl_live_8f9a2c3d token scoped' },
    { num: 3, title: 'Package Installed', desc: 'SDK installed via npm/yarn' },
    { num: 4, title: 'Embed Tracking Code', desc: 'Add provider to layout or root' },
    { num: 5, title: 'Send Test Telemetry', desc: 'Dispatch sample payload' },
    { num: 6, title: 'Live Verification', desc: 'Confirmed pipeline connection' },
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">SDK Installation & Quickstart</h1>
        <p className="mt-1 text-xs text-slate-400">
          Connect your web, mobile, or backend application to Atlas Analytics in minutes.
        </p>
      </div>

      {/* Interactive Step-by-Step Wizard Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {stepsList.map((step) => {
            const isCompleted = step.num < activeStep;
            const isCurrent = step.num === activeStep;

            return (
              <div
                key={step.num}
                onClick={() => setActiveStep(step.num)}
                className={cn(
                  'rounded-lg p-2.5 border transition-all cursor-pointer text-xs',
                  isCurrent
                    ? 'border-indigo-500 bg-indigo-950/40'
                    : isCompleted
                    ? 'border-emerald-500/30 bg-emerald-950/20'
                    : 'border-slate-800 bg-slate-900/40 opacity-70'
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                      isCompleted
                        ? 'bg-emerald-500 text-black'
                        : isCurrent
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    )}
                  >
                    {isCompleted ? '✓' : step.num}
                  </span>
                  <span
                    className={cn(
                      'font-semibold truncate',
                      isCurrent ? 'text-white' : isCompleted ? 'text-emerald-300' : 'text-slate-400'
                    )}
                  >
                    Step {step.num}
                  </span>
                </div>
                <div className="font-medium text-slate-300 truncate">{step.title}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Main Installation Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Platform Selector & Code Snippets */}
        <div className="lg:col-span-2 space-y-5">
          {/* Platform Tab Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'nextjs', label: 'Next.js 14 / 15 / 16' },
              { id: 'react', label: 'React.js' },
              { id: 'javascript', label: 'Vanilla JS / HTML' },
              { id: 'nodejs', label: 'Node.js Backend' },
              { id: 'rest', label: 'REST API (cURL)' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlatform(p.id as typeof selectedPlatform)}
                className={cn(
                  'rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all border',
                  selectedPlatform === p.id
                    ? 'border-indigo-500 bg-indigo-600 text-white shadow-md'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Installation Shell Command */}
          <Card className="p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              1. Install SDK Package
            </span>
            <div className="flex items-center justify-between rounded-lg bg-[#070A10] p-3 font-mono text-xs text-indigo-300 border border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slate-500 shrink-0" />
                <span>
                  {selectedPlatform === 'nextjs'
                    ? 'npm install @atlas/analytics-next'
                    : selectedPlatform === 'react'
                    ? 'npm install @atlas/analytics-react'
                    : selectedPlatform === 'nodejs'
                    ? 'npm install @atlas/analytics-node'
                    : 'No package needed — use standard CDN script tag'}
                </span>
              </div>
              <button
                onClick={() =>
                  copyCode(
                    selectedPlatform === 'nextjs'
                      ? 'npm install @atlas/analytics-next'
                      : 'npm install @atlas/analytics-react'
                  )
                }
                className="text-slate-400 hover:text-white p-1"
                title="Copy Command"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </Card>

          {/* Code Integration Snippet */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-semibold text-white">
                  2. Add Tracking Configuration
                </span>
              </div>
              <button
                onClick={() => copyCode(snippets[selectedPlatform])}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
              >
                {copiedSnippet ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied to clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-4 font-mono text-xs text-indigo-300 bg-[#070A10] overflow-x-auto leading-relaxed max-h-96">
              {snippets[selectedPlatform]}
            </pre>
          </Card>
        </div>

        {/* Right Col: Interactive Test Event Simulator & Verification */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <CardTitle>Test Event Simulator</CardTitle>
            </div>

            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              Verify your pipeline connection. Click the button below to dispatch a simulated telemetry payload.
            </p>

            <div className="mt-4 p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono space-y-1">
              <div className="text-slate-500 text-[10px]">SIMULATED PAYLOAD</div>
              <div className="text-indigo-300 font-semibold">{`{"event": "test_ping"}`}</div>
              <div className="text-slate-400 text-[11px]">project: HRMS Analytics</div>
            </div>

            <div className="mt-4">
              <Button
                onClick={handleSendTestEvent}
                disabled={testStatus === 'sending'}
                className="w-full gap-2"
              >
                {testStatus === 'sending' ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Dispatching test telemetry...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Test Event</span>
                  </>
                )}
              </Button>
            </div>

            {/* Connection Status Response */}
            {testResponsePayload && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Connection Verified: HTTP 200 OK</span>
                </div>
                <pre className="rounded bg-[#070A10] p-2.5 text-[11px] font-mono text-emerald-300 overflow-x-auto border border-emerald-500/20">
                  {testResponsePayload}
                </pre>
              </div>
            )}
          </Card>

          {/* Checklist Card */}
          <Card className="p-5">
            <CardTitle className="text-xs uppercase tracking-wider text-slate-400 mb-3">
              Integration Checklist
            </CardTitle>
            <div className="space-y-2.5 text-xs">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>Set ATLAS_API_KEY environment variable</span>
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>Wrap application in AtlasProvider</span>
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>Enable automatic page view capture</span>
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>Verify Live Event Stream in dashboard</span>
              </label>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

