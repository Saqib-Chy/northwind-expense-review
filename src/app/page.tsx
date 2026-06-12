import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="card">
        <h2 className="text-2xl font-semibold">Expense pre-review</h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          Upload receipts for an employee&apos;s trip and get a per-line-item policy review:
          category, verdict, reasoning, quoted policy citations, and a confidence score. A reviewer
          makes the final call and can override any verdict with an auditable comment.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/submissions/new"
            style={{ backgroundColor: "#0f172a", color: "white" }}
            className="rounded-lg px-4 py-2 text-sm font-medium"
          
          >
            Start a submission
          </Link>
          <Link
            href="/history"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            Browse history
          </Link>
          <Link
            href="/policy-chat"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            Ask about policies
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <h3 className="font-semibold">1. Extract</h3>
          <p className="mt-2 text-sm text-slate-600">
            Receipts in PDF, image, or text are turned into structured line items (vendor, date,
            amount, category) — images go through a vision model.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold">2. Review</h3>
          <p className="mt-2 text-sm text-slate-600">
            Each item retrieves relevant policy text and gets a schema-constrained verdict. Quotes
            are verified against the source; weak evidence routes to human review.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold">3. Decide</h3>
          <p className="mt-2 text-sm text-slate-600">
            Flagged items stand out. Reviewers override with a comment, and everything persists for
            auditing across restarts.
          </p>
        </div>
      </section>
    </div>
  );
}
