"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, ConfidenceBar } from "./StatusBadge";
import type { LineItemDetail } from "@/lib/queries";

const STATUS_OPTIONS = ["compliant", "flagged", "rejected", "needs_review"] as const;

export function LineItemCard({ item }: { item: LineItemDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective = item.overrides[0]?.newStatus ?? item.verdict?.status ?? "needs_review";
  const isOverridden = item.overrides.length > 0;
  const attention = effective === "flagged" || effective === "rejected";

  async function submitOverride() {
    if (!newStatus) {
      setError("Choose a new status");
      return;
    }
    if (!comment.trim()) {
      setError("A comment is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/line-items/${item.id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setOpen(false);
      setComment("");
      setNewStatus("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to override");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm ${
        attention ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{item.vendor ?? "Unknown vendor"}</p>
          <p className="text-sm text-slate-500">
            {item.description ?? "No description"} · {item.receiptFilename}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {item.amount ? `${item.currency ?? "USD"} ${item.amount}` : "Amount unknown"}
            {item.expenseDate ? ` · ${item.expenseDate}` : ""}
            {item.categoryHint ? ` · ${item.categoryHint}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {isOverridden && (
              <span className="text-xs text-slate-400 line-through">
                {item.verdict?.status ?? "—"}
              </span>
            )}
            <StatusBadge status={effective} />
          </div>
          {item.verdict && <ConfidenceBar confidence={item.verdict.confidence} />}
        </div>
      </div>

      {item.verdict && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-700">{item.verdict.reasoning}</p>

          {item.verdict.citations.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Policy citations
              </p>
              {item.verdict.citations.map((c, i) => (
                <blockquote
                  key={i}
                  className="border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {c.doc_id}
                    {c.section ? ` ${c.section}` : ""}
                  </span>
                  <p className="mt-1 italic">“{c.quote}”</p>
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No verified policy citations.</p>
          )}
        </div>
      )}

      {item.overrides.length > 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Override history
          </p>
          <ul className="mt-2 space-y-2">
            {item.overrides.map((o) => (
              <li key={o.id} className="text-sm text-slate-700">
                <span className="font-medium">
                  {o.previousStatus} → {o.newStatus}
                </span>{" "}
                <span className="text-slate-400">
                  · {new Date(o.createdAt).toLocaleString()}
                </span>
                <p className="text-slate-600">{o.comment}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="text-sm font-medium text-slate-700 underline"
          >
            Override verdict
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">New status…</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Reason for override (required, auditable)"
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={submitOverride}
                disabled={saving}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save override"}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
