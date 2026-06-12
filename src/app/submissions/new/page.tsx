"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Employee {
  id: string;
  externalId: string | null;
  name: string;
  grade: string;
  department: string;
}

interface Sample {
  folder: string;
  employeeId: string;
  employeeName: string;
  tripPurpose: string;
  tripStartDate: string;
  tripEndDate: string;
  receiptCount: number;
  receiptNames: string[];
}

export default function NewSubmissionPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [tripPurpose, setTripPurpose] = useState("");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? []))
      .catch(() => setError("Failed to load employees"));
    fetch("/api/samples")
      .then((r) => r.json())
      .then((d) => setSamples(d.samples ?? []))
      .catch(() => {});
  }, []);

  async function processSample(folder: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/submissions/${data.submissionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to process sample");
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      setError("Please add at least one receipt");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("employeeId", employeeId);
      form.set("tripPurpose", tripPurpose);
      form.set("tripStartDate", tripStartDate);
      form.set("tripEndDate", tripEndDate);
      Array.from(files).forEach((f) => form.append("receipts", f));

      const res = await fetch("/api/submissions", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/submissions/${data.submissionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create submission");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">New Submission</h2>
        <p className="mt-1 text-slate-600">
          Pick an employee, set the trip context, and upload receipts (PDF, image, or text).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {submitting && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent align-middle" />
          Extracting receipts and running policy review… this can take a moment per receipt.
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700">Employee</label>
          <select
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} — grade {emp.grade}, {emp.department}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Trip purpose</label>
          <input
            required
            value={tripPurpose}
            onChange={(e) => setTripPurpose(e.target.value)}
            placeholder="e.g. Quarterly client review in Denver"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Trip start</label>
            <input
              required
              type="date"
              value={tripStartDate}
              onChange={(e) => setTripStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Trip end</label>
            <input
              required
              type="date"
              value={tripEndDate}
              onChange={(e) => setTripEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Receipts</label>
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/*,text/plain"
            onChange={(e) => setFiles(e.target.files)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Mixed formats supported: PDF, JPG/PNG/WebP images, and plain text.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Processing…" : "Run pre-review"}
        </button>
      </form>

      {samples.length > 0 && (
        <div className="card">
          <h3 className="font-semibold">Or process a sample submission</h3>
          <p className="mt-1 text-sm text-slate-600">
            Runs the bundled receipts for one of the five provided samples — no upload needed.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {samples.map((s) => (
              <div
                key={s.folder}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
              >
                <div>
                  <p className="font-medium">{s.employeeName}</p>
                  <p className="text-sm text-slate-500">{s.tripPurpose}</p>
                  <p className="mt-1 text-xs text-slate-400">{s.receiptCount} receipts</p>
                </div>
                <button
                  onClick={() => processSample(s.folder)}
                  disabled={submitting}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Process
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
