'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Eye, EyeOff, Lock, Mail, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setLoading(true);

  try {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      alert("Invalid email or password");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  } catch (error) {
    console.error("Login error:", error);
    alert("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};

  const fillDemoAccount = () => {
    setEmail('jay@atlasanalytics.io');
    setPassword('AtlasAnalytics2026!');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#090D16] p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Header */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 transition-transform hover:scale-105"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <Activity className="h-6 w-6" />
            </div>
            <div className="text-left">
              <span className="text-xl font-bold tracking-tight text-white">Atlas</span>
              <span className="text-xl font-semibold text-indigo-400 ml-1">Analytics</span>
            </div>
          </Link>
          <h2 className="mt-6 text-xl font-bold tracking-tight text-white sm:text-2xl">
            Welcome back to Atlas
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Sign in to your multi-tenant product analytics workspace
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {/* Demo account quick banner */}
          <div className="mb-6 rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-3 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-300">
              <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>Explore as workspace owner</span>
            </div>
            <button
              type="button"
              onClick={fillDemoAccount}
              className="font-semibold text-indigo-400 hover:text-indigo-200 underline decoration-indigo-400/50"
            >
              Fill Demo Login
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                />
                <span>Remember this workstation for 30 days</span>
              </label>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full justify-center py-2.5 text-xs font-semibold"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Signing in...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              )}
            </Button>
          </form>

          {/* Bottom link */}
          <div className="mt-6 text-center text-xs text-slate-400 pt-4 border-t border-slate-800">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="font-semibold text-indigo-400 hover:text-indigo-300"
            >
              Create an organization
            </Link>
          </div>
        </div>

        {/* Security watermark */}
        <div className="text-center text-[11px] text-slate-400">
          SOC-2 Type II Certified • Tenant Isolated Data Pipelines
        </div>
      </div>
    </div>
  );
}

