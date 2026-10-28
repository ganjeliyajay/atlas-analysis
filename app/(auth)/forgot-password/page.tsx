'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Activity, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 600);
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
            Reset your password
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Enter your work email to receive password recovery instructions
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-white">Reset instructions sent!</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                If an account exists for <span className="font-semibold text-slate-200">{email}</span>, you will receive a secure reset link shortly.
              </p>
              <div className="pt-4">
                <Link href="/login">
                  <Button variant="secondary" size="sm" className="w-full justify-center">
                    Return to Login
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full justify-center py-2.5 text-xs font-semibold"
                >
                  {loading ? 'Sending link...' : 'Send Password Reset Link'}
                </Button>
              </div>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to login</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

