export default function FunnelsLoading() {
  return (
    <main aria-label="Loading funnel analytics" aria-busy="true" className="space-y-6">
      <div className="h-12 w-72 animate-pulse rounded-lg bg-slate-800" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
      <div className="h-80 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
      <div className="h-56 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
    </main>
  );
}
