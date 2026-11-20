export default function LiveAnalyticsLoading() {
  return (
    <main aria-label="Loading live analytics" aria-busy="true" className="space-y-6">
      <div className="h-12 w-72 animate-pulse rounded-lg bg-slate-800" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
    </main>
  );
}
