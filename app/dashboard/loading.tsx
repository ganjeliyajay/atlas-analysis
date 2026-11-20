export default function DashboardLoading() {
  return (
    <main
      aria-label="Loading analytics dashboard"
      aria-busy="true"
      className="space-y-6 pb-8"
    >
      <div className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
      <div className="flex items-center justify-between gap-4">
        <div className="h-4 w-48 animate-pulse rounded bg-slate-800" />
        <div className="h-9 w-56 animate-pulse rounded-lg bg-slate-800" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="h-[360px] animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
        <div className="h-[360px] animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
    </main>
  );
}
