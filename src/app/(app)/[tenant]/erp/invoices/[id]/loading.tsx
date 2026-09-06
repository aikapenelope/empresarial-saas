export default function LoadingInvoiceDetail() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-64 rounded bg-slate-800/60" />
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-4">
        <div className="h-6 w-48 rounded bg-slate-800/60" />
        <div className="h-4 w-80 rounded bg-slate-800/40" />
      </div>
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
        <div className="h-10 border-b border-slate-800/80 bg-slate-950/40" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 border-b border-slate-800/40" />
        ))}
      </div>
    </div>
  );
}
