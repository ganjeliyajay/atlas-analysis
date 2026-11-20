'use client';

import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Terminal,
  Code2,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export default function InstallationPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<
    'nextjs' | 'react' | 'javascript' | 'nodejs' | 'rest'
  >('nextjs');
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeStep, setActiveStep] = useState(4); // Default to Step 4: Add Tracking Code

  // Test event simulator state
  const [testStatus, setTestStatus] = useState<
    'idle' | 'sending' | 'success' | 'verified'
  >('idle');
  const [testResponsePayload, setTestResponsePayload] = useState<string | null>(null);
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    fetch('/api/keys')
      .then((res) => res.json())
      .then((data) => {
        const activeKey = data.keys?.find((key: { status?: string }) => key.status === 'active');
        if (activeKey?.keyPrefix) setApiKeyPrefix(activeKey.keyPrefix);
      })
      .catch(() => {});
  }, []);

  // The API intentionally returns only key prefixes after creation. The raw
  // secret must be pasted from the one-time creation response by the user.
  const activeApiKey = apiKey.trim() || 'YOUR_ATLAS_API_KEY';

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
  options: {
    trackPageviews: true,
    batchSize: 50,
    flushInterval: 2000
  }
});`,
    javascript: `<!-- Add to <head> -->
<script
  src="https://cdn.atlasanalytics.io/v1/atlas.min.js"
  data-api-key="${activeApiKey}"
  data-track-views="true"
  defer
></script>`,
    nodejs: `import { AtlasClient } from '@atlas/analytics-node';

const atlas = new AtlasClient({
  apiKey: '${activeApiKey}',
  host: 'https://ingest.atlasanalytics.io'
});

await atlas.track({
  eventName: 'subscription_upgraded',
  userId: 'usr_847120',
  properties: {
    plan: 'enterprise',
    arr: 12000
  }
});`,
    rest: `curl -X POST https://ingest.atlasanalytics.io/api/v1/events \\
  -H "Authorization: Bearer ${activeApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "eventName": "purchase_completed",
    "userId": "usr_99120",
    "sessionId": "sess_40192",
    "properties": {
      "item": "analytics_starter_pack",
      "amount": 49.00,
      "currency": "USD"
    }
  }'`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[selectedPlatform]);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleSendTestEvent = async () => {
    if (!apiKey.trim()) {
      setTestStatus('idle');
      setTestResponsePayload(JSON.stringify({ error: 'Paste the full API key shown once when it was created.' }, null, 2));
      return;
    }

    setTestStatus('sending');
    setTestResponsePayload(null);

    try {
      const response = await fetch('/api/v1/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeApiKey}`,
        },
        body: JSON.stringify({
          eventName: 'installation_verification_ping',
          userId: 'test_client_installer',
          sessionId: `sess_verify_${Date.now()}`,
          pageUrl: window.location.href,
          properties: {
            platform: selectedPlatform,
            testMode: true,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.status === 202 || response.status === 201 || response.status === 200) {
        setTestStatus('success');
        setTestResponsePayload(JSON.stringify(data || { status: 'accepted' }, null, 2));
        setTimeout(() => setTestStatus('verified'), 1500);
      } else {
        setTestStatus('idle');
        setTestResponsePayload(JSON.stringify({ status: response.status, data }, null, 2));
      }
    } catch {
      setTestStatus('idle');
      setTestResponsePayload(JSON.stringify({ error: 'Failed to dispatch event' }, null, 2));
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          SDK & Platform Installation
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Embed the client snippet into your application to start streaming event telemetry into ATLAS.
        </p>
      </div>

      {/* Installation Steps Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { step: 1, title: 'Choose Platform', desc: 'Select your app runtime' },
          { step: 2, title: 'Get Ingest Key', desc: 'Auto-configured for your active org' },
          { step: 3, title: 'Install SDK', desc: 'npm, pnpm, or script tag' },
          { step: 4, title: 'Verify Pipeline', desc: 'Emit a real test event' },
        ].map((s) => (
          <div
            key={s.step}
            onClick={() => setActiveStep(s.step)}
            className={cn(
              'p-3.5 rounded-lg border transition-all cursor-pointer',
              activeStep === s.step
                ? 'bg-indigo-950/30 border-indigo-500/50 text-white'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  activeStep === s.step
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                )}
              >
                {s.step}
              </span>
              <span className="text-xs font-semibold">{s.title}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 pl-7">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Main Snippet Container */}
      <Card className="bg-slate-900/60 border-slate-800 p-6">
        {/* Platform Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            {[
              { id: 'nextjs', label: 'Next.js 14+' },
              { id: 'react', label: 'React SPA' },
              { id: 'javascript', label: 'Vanilla JS / CDN' },
              { id: 'nodejs', label: 'Node.js Backend' },
              { id: 'rest', label: 'Raw HTTP / cURL' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlatform(p.id as typeof selectedPlatform)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  selectedPlatform === p.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="text-xs flex items-center gap-1.5 border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            {copiedSnippet ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied Code</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Snippet</span>
              </>
            )}
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
          <label htmlFor="atlas-api-key" className="mb-2 block text-xs font-medium text-slate-300">
            Full ingestion API key
          </label>
          <input
            id="atlas-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste the full atlas_live_... key from its one-time creation screen"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
          />
          <p className="mt-2 text-[11px] text-slate-500">
            {apiKeyPrefix
              ? `A saved key beginning ${apiKeyPrefix} exists, but its full secret cannot be retrieved. `
              : 'Create an ingestion key from API Keys first. '}
            The complete secret is shown only once; if it was lost, create a new key.
          </p>
        </div>

        {/* Code Snippet Box */}
        <div className="mt-4 rounded-lg bg-slate-950 p-4 border border-slate-800 font-mono text-xs overflow-x-auto text-slate-300">
          <pre className="whitespace-pre">
            <code>{snippets[selectedPlatform]}</code>
          </pre>
        </div>

        {/* Platform Instructions */}
        <div className="mt-6 space-y-4">
          <CardTitle className="text-sm font-semibold text-white">
            Quick Installation Commands
          </CardTitle>

          <div className="space-y-2">
            {selectedPlatform === 'nextjs' && (
              <div className="rounded bg-slate-950 p-3 border border-slate-800 text-xs font-mono text-indigo-400 flex items-center justify-between">
                <span>npm install @atlas/analytics-next</span>
                <Terminal className="h-4 w-4 text-slate-500" />
              </div>
            )}
            {selectedPlatform === 'react' && (
              <div className="rounded bg-slate-950 p-3 border border-slate-800 text-xs font-mono text-indigo-400 flex items-center justify-between">
                <span>npm install @atlas/analytics-react</span>
                <Terminal className="h-4 w-4 text-slate-500" />
              </div>
            )}
            {selectedPlatform === 'nodejs' && (
              <div className="rounded bg-slate-950 p-3 border border-slate-800 text-xs font-mono text-indigo-400 flex items-center justify-between">
                <span>npm install @atlas/analytics-node</span>
                <Terminal className="h-4 w-4 text-slate-500" />
              </div>
            )}
            {selectedPlatform === 'javascript' && (
              <p className="text-xs text-slate-400">
                Paste the script tag directly before the closing <code className="text-slate-300">&lt;/head&gt;</code> tag on every page you wish to track.
              </p>
            )}
            {selectedPlatform === 'rest' && (
              <p className="text-xs text-slate-400">
                Send events to <code className="text-slate-300">/api/v1/events</code> using any standard HTTP client with an Authorization header.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Verification Simulator Panel */}
      <Card className="bg-slate-900/60 border-slate-800 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">
                Live Ingestion Pipe Verification
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Trigger a test verification ping to confirm your API key and ingestion gateway are operational.
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleSendTestEvent}
            disabled={testStatus === 'sending' || !apiKey.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-1.5"
          >
            {testStatus === 'sending' ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span>Dispatching...</span>
              </>
            ) : testStatus === 'verified' ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                <span>Verified Connected</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Emit Test Event</span>
              </>
            )}
          </Button>
        </div>

        {testResponsePayload && (
          <div className="mt-4 rounded-lg bg-slate-950 p-4 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Ingestion Gateway Response
              </span>
              <span className="text-[11px] text-emerald-400 font-mono">HTTP 202 Accepted</span>
            </div>
            <pre className="text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre">
              {testResponsePayload}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
