"use client";

import { useState } from "react";

interface Citation {
  doc_id: string;
  section?: string;
  quote: string;
}

interface Answer {
  question: string;
  answer: string;
  citations: Citation[];
  refused: boolean;
  confidence: number | null;
}

export default function PolicyChatPage() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/policy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setHistory((h) => [{ question: q, ...data }, ...h]);
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get an answer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Policy Chat</h2>
        <p className="mt-1 text-slate-600">
          Ask about the Northwind policy library. Answers are grounded in policy text with
          citations; out-of-scope questions are declined.
        </p>
      </div>

      <form onSubmit={ask} className="card flex gap-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What is the per-diem dinner limit for domestic travel?"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {history.map((item, idx) => (
          <div key={idx} className="card space-y-3">
            <p className="font-medium text-slate-900">{item.question}</p>
            <div
              className={`rounded-lg p-3 text-sm ${
                item.refused
                  ? "bg-violet-50 text-violet-900"
                  : "bg-slate-50 text-slate-700"
              }`}
            >
              {item.refused && (
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-violet-500">
                  Declined — out of scope or unsupported
                </span>
              )}
              {item.answer}
            </div>

            {item.citations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Citations
                </p>
                {item.citations.map((c, i) => (
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
            )}

            {item.confidence != null && (
              <p className="text-xs text-slate-400">
                Confidence {Math.round(item.confidence * 100)}%
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
