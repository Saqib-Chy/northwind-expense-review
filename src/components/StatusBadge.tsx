const STATUS_LABELS: Record<string, string> = {
  compliant: "Compliant",
  flagged: "Flagged",
  rejected: "Rejected",
  needs_review: "Needs review",
  processing: "Processing",
  reviewed: "Reviewed",
  draft: "Draft",
};

const STATUS_CLASSES: Record<string, string> = {
  compliant: "bg-green-100 text-green-800 border-green-200",
  flagged: "bg-amber-100 text-amber-900 border-amber-300",
  rejected: "bg-red-100 text-red-800 border-red-200",
  needs_review: "bg-violet-100 text-violet-800 border-violet-200",
  processing: "bg-slate-100 text-slate-700 border-slate-200",
  reviewed: "bg-slate-100 text-slate-700 border-slate-200",
  draft: "bg-slate-100 text-slate-700 border-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const className = STATUS_CLASSES[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

export function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.75 ? "bg-green-500" : confidence >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500">{pct}% confidence</span>
    </div>
  );
}
