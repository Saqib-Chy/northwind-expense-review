import Link from "next/link";
import { listEmployees, listSubmissions } from "@/lib/queries";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["compliant", "flagged", "rejected", "needs_review"];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; status?: string }>;
}) {
  const { employeeId, status } = await searchParams;
  const [submissions, employees] = await Promise.all([
    listSubmissions({ employeeId, status }),
    listEmployees(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Submission History</h2>
        <Link
          href="/submissions/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          New submission
        </Link>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Employee</label>
          <select
            name="employeeId"
            defaultValue={employeeId ?? ""}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Status</label>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
        >
          Filter
        </button>
        {(employeeId || status) && (
          <Link href="/history" className="text-sm text-slate-500 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {submissions.length === 0 ? (
        <div className="card text-slate-500">No submissions yet.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Trip</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{s.employeeName}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600">{s.tripPurpose}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.tripStartDate} → {s.tripEndDate}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/submissions/${s.id}`}
                      className="text-sm font-medium text-slate-700 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
