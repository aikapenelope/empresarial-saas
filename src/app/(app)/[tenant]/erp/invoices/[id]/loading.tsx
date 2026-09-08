export default function LoadingInvoiceDetail() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-64 rounded bg-muted" />
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="h-4 w-80 rounded bg-muted/60" />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-10 border-b border-border bg-muted/50" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 border-b border-border/60" />
        ))}
      </div>
    </div>
  );
}
