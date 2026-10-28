import React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Layers,
  Filter,
  Calendar,
  ShieldCheck,
  Zap,
  Globe,
  Terminal,
  Users,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function HomePage() {
  const features = [
    {
      title: 'Real-time Event Ingestion',
      description: 'Stream live telemetry with zero-lag pipeline buffering and automated event schema validation.',
      icon: Activity,
      href: '/dashboard/live',
      badge: 'Streaming',
    },
    {
      title: 'Funnel Drop-off Intelligence',
      description: 'Build 2–6 step interactive conversion funnels to pinpoint customer drop-offs and optimize onboarding.',
      icon: Filter,
      href: '/dashboard/funnels',
      badge: 'Interactive',
    },
    {
      title: 'Weekly Retention Heatmaps',
      description: 'Track cohort stickiness and long-term user return rates with responsive intensity gradients.',
      icon: Calendar,
      href: '/dashboard/retention',
      badge: 'Cohorts',
    },
    {
      title: 'User Lifecycle & Journeys',
      description: 'Deep dive into identified profiles, full session histories, top visited routes, and interactive timelines.',
      icon: Users,
      href: '/dashboard/users',
      badge: 'Identified',
    },
    {
      title: 'Multi-tenant Operations Console',
      description: 'Superadmin cluster controls, quota enforcement, tenant provisioning, and partition monitoring.',
      icon: ShieldCheck,
      href: '/ops',
      badge: 'Platform Ops',
    },
    {
      title: 'Lightweight Client SDKs',
      description: 'Plug-and-play SDKs for Next.js 16, React, Node.js, and direct REST ingestion APIs.',
      icon: Terminal,
      href: '/dashboard/installation',
      badge: 'SDK Quickstart',
    },
  ];

  const quickNav = [
    { label: 'Executive Overview', href: '/dashboard' },
    { label: 'Live Events Stream', href: '/dashboard/live' },
    { label: 'Events Catalog', href: '/dashboard/events' },
    { label: 'User Profiles', href: '/dashboard/users' },
    { label: 'Page Analytics', href: '/dashboard/pages' },
    { label: 'Conversion Funnels', href: '/dashboard/funnels' },
    { label: 'Retention Heatmap', href: '/dashboard/retention' },
    { label: 'Projects & Websites', href: '/dashboard/projects' },
    { label: 'API Keys Management', href: '/dashboard/api-keys' },
    { label: 'SDK Quickstart', href: '/dashboard/installation' },
    { label: 'Workspace Settings', href: '/dashboard/settings' },
    { label: 'Admin Ops Console', href: '/ops' },
    { label: 'Sign In Page', href: '/login' },
    { label: 'Registration Page', href: '/register' },
  ];

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#090D16]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white text-base sm:text-lg">Atlas</span>
            <span className="text-indigo-400 font-semibold text-base sm:text-lg ml-1">Analytics</span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/ops"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Ops Console</span>
          </Link>

          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-xs">
              Sign In
            </Button>
          </Link>

          <Link href="/dashboard">
            <Button size="sm" className="gap-1.5 text-xs shadow-md shadow-indigo-600/20">
              <span>Launch Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-16 pb-20 max-w-6xl mx-auto text-center flex-1 flex flex-col items-center justify-center">
        {/* Glow ambient background element */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none" />

        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-3.5 py-1 text-xs font-medium text-indigo-300 mb-6">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>Production-grade Frontend Design & Realistic Telemetry Datasets</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl leading-tight">
          Next-generation product analytics for{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-indigo-200 to-blue-400 bg-clip-text text-transparent">
            multi-tenant SaaS
          </span>
        </h1>

        <p className="mt-5 text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
          Unify event ingestion, user journeys, drop-off funnels, and retention analysis in a modern, ultra-responsive dark interface crafted for high-growth product teams.
        </p>

        {/* Hero Actions */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard">
            <Button size="lg" className="gap-2 shadow-lg shadow-indigo-600/30">
              <BarChart3 className="h-4 w-4" />
              <span>Enter Customer Dashboard</span>
            </Button>
          </Link>
          <Link href="/ops">
            <Button variant="secondary" size="lg" className="gap-2 border-slate-700">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span>Platform Ops Console</span>
            </Button>
          </Link>
          <Link href="/dashboard/live">
            <Button variant="outline" size="lg" className="gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>View Live Stream</span>
            </Button>
          </Link>
        </div>

        {/* Quick App Route Directory */}
        <div className="mt-12 w-full max-w-4xl rounded-2xl border border-slate-800 bg-[#0F172A]/80 p-5 shadow-2xl backdrop-blur-sm text-left">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
            <span>Explore All 14 Complete Frontend Surfaces</span>
            <span className="text-indigo-400 font-mono text-[11px]">100% Ready with Dummy Data</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 hover:border-indigo-500/60 hover:text-white hover:bg-slate-800 transition-all font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 max-w-6xl mx-auto w-full border-t border-slate-800/80">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Built for Modern Product & Engineering Teams
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            A cohesive design system inspired by top analytics products like PostHog, Mixpanel, and Linear.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <Link
                key={feat.title}
                href={feat.href}
                className="group rounded-xl border border-slate-800/80 bg-[#0F172A]/70 p-5 hover:border-indigo-500/50 hover:bg-[#0F172A] transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="neutral" className="text-[10px]">
                      {feat.badge}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                    {feat.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    {feat.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
                  <span>Explore View</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#070A10] px-4 py-8 text-center text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-400" />
            <span className="font-semibold text-white">Atlas Analytics</span>
            <span>— Multi-Tenant Product Analytics Platform</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <Link href="/dashboard" className="hover:text-white">
              Dashboard
            </Link>
            <Link href="/ops" className="hover:text-white">
              Admin Ops
            </Link>
            <Link href="/dashboard/installation" className="hover:text-white">
              SDK Quickstart
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
