import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmissionDetail } from "@/lib/queries";
import { StatusBadge } from "@/components/StatusBadge";
import { LineItemCard } from "@/components/LineItemCard";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await getSubmissionDetail(id);
  if (!submission) notFound();

  return (
    <div className="space-y-6">
      <Link href="/history" className="text-sm text-slate-500 hover:underline">
        ← Back to history
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{submission.employeeName}</h2>
            <p className="mt-1 text-slate-600">{submission.tripPurpose}</p>
            <p className="mt-1 text-sm text-slate-500">
              Grade {submission.employeeGrade} · {submission.employeeDepartment} ·{" "}
              {submission.tripStartDate} to {submission.tripEndDate}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Submitted {new Date(submission.createdAt).toLocaleString()}
            </p>
          </div>
          <StatusBadge status={submission.status} />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">
          Line items ({submission.lineItems.length})
        </h3>
        {submission.lineItems.length === 0 ? (
          <p className="text-slate-500">No line items.</p>
        ) : (
          submission.lineItems.map((item) => <LineItemCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
