import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { employees, lineItems, submissions, verdicts } from "./db/schema";
import { extractReceipt, normalizeExtractedDate } from "./extraction";
import { generateVerdict, type TripContext } from "./verdict";
import type { VerdictStatus } from "./types";

export interface ReceiptInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface CreateSubmissionInput {
  employeeId: string;
  tripPurpose: string;
  tripStartDate: string;
  tripEndDate: string;
  receipts: ReceiptInput[];
}

/** A flagged/rejected/needs_review item makes the whole submission need attention. */
function rollUpStatus(statuses: VerdictStatus[]): string {
  if (statuses.some((s) => s === "rejected")) return "rejected";
  if (statuses.some((s) => s === "flagged")) return "flagged";
  if (statuses.some((s) => s === "needs_review")) return "needs_review";
  if (statuses.length > 0) return "compliant";
  return "reviewed";
}

export async function createAndProcessSubmission(
  input: CreateSubmissionInput,
): Promise<{ submissionId: string; lineItemCount: number }> {
  const db = getDb();

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);

  if (!employee) {
    throw new Error("Employee not found");
  }

  const [submission] = await db
    .insert(submissions)
    .values({
      employeeId: employee.id,
      tripPurpose: input.tripPurpose,
      tripStartDate: input.tripStartDate,
      tripEndDate: input.tripEndDate,
      status: "processing",
    })
    .returning();

  const trip: TripContext = {
    employeeName: employee.name,
    grade: employee.grade,
    department: employee.department,
    tripPurpose: input.tripPurpose,
    tripStartDate: input.tripStartDate,
    tripEndDate: input.tripEndDate,
  };

  const statuses: VerdictStatus[] = [];

  for (const receipt of input.receipts) {
    const { result: extracted, source } = await extractReceipt(receipt);
    const verdictContext = await generateVerdict(extracted, trip);
    const verdict = verdictContext.verdict;

    const [lineItem] = await db
      .insert(lineItems)
      .values({
        submissionId: submission.id,
        receiptFilename: receipt.filename,
        receiptMimeType: receipt.mimeType,
        vendor: extracted.vendor,
        expenseDate: normalizeExtractedDate(extracted.date),
        amount: extracted.amount != null ? String(extracted.amount) : null,
        currency: extracted.currency ?? "USD",
        description: extracted.description,
        categoryHint: extracted.category_hint ?? null,
        extractedRaw: { ...extracted, extractionSource: source },
      })
      .returning();

    await db.insert(verdicts).values({
      lineItemId: lineItem.id,
      category: verdict.category,
      status: verdict.status,
      confidence: verdict.confidence,
      reasoning: verdict.reasoning,
      citations: verdict.citations,
      needsHumanReview: verdict.needs_human_review,
    });

    statuses.push(verdict.status);
  }

  await db
    .update(submissions)
    .set({ status: rollUpStatus(statuses), updatedAt: new Date() })
    .where(eq(submissions.id, submission.id));

  return { submissionId: submission.id, lineItemCount: input.receipts.length };
}
