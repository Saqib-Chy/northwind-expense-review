import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  employees,
  lineItems,
  submissions,
  verdictOverrides,
  verdicts,
} from "./db/schema";
import type { PolicyCitation } from "./types";

export interface EmployeeRow {
  id: string;
  externalId: string | null;
  name: string;
  grade: string;
  department: string;
  manager: string;
}

export async function listEmployees(): Promise<EmployeeRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: employees.id,
      externalId: employees.externalId,
      name: employees.name,
      grade: employees.grade,
      department: employees.department,
      manager: employees.manager,
    })
    .from(employees)
    .orderBy(employees.name);
  return rows;
}

export interface SubmissionListItem {
  id: string;
  employeeName: string;
  tripPurpose: string;
  tripStartDate: string;
  tripEndDate: string;
  status: string;
  createdAt: Date;
}

export async function listSubmissions(filters?: {
  employeeId?: string;
  status?: string;
}): Promise<SubmissionListItem[]> {
  const db = getDb();
  const conditions = [];
  if (filters?.employeeId) conditions.push(eq(submissions.employeeId, filters.employeeId));
  if (filters?.status) conditions.push(eq(submissions.status, filters.status));

  const rows = await db
    .select({
      id: submissions.id,
      employeeName: employees.name,
      tripPurpose: submissions.tripPurpose,
      tripStartDate: submissions.tripStartDate,
      tripEndDate: submissions.tripEndDate,
      status: submissions.status,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .innerJoin(employees, eq(submissions.employeeId, employees.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(submissions.createdAt));

  return rows;
}

export interface LineItemDetail {
  id: string;
  receiptFilename: string;
  receiptMimeType: string;
  vendor: string | null;
  expenseDate: string | null;
  amount: string | null;
  currency: string | null;
  description: string | null;
  categoryHint: string | null;
  verdict: {
    category: string;
    status: string;
    confidence: number;
    reasoning: string;
    citations: PolicyCitation[];
    needsHumanReview: boolean;
  } | null;
  overrides: {
    id: string;
    previousStatus: string;
    newStatus: string;
    comment: string;
    createdAt: Date;
  }[];
}

export interface SubmissionDetail {
  id: string;
  employeeName: string;
  employeeGrade: string;
  employeeDepartment: string;
  tripPurpose: string;
  tripStartDate: string;
  tripEndDate: string;
  status: string;
  createdAt: Date;
  lineItems: LineItemDetail[];
}

export async function getSubmissionDetail(id: string): Promise<SubmissionDetail | null> {
  const db = getDb();
  const [submission] = await db
    .select({
      id: submissions.id,
      employeeName: employees.name,
      employeeGrade: employees.grade,
      employeeDepartment: employees.department,
      tripPurpose: submissions.tripPurpose,
      tripStartDate: submissions.tripStartDate,
      tripEndDate: submissions.tripEndDate,
      status: submissions.status,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .innerJoin(employees, eq(submissions.employeeId, employees.id))
    .where(eq(submissions.id, id))
    .limit(1);

  if (!submission) return null;

  const items = await db
    .select({
      id: lineItems.id,
      receiptFilename: lineItems.receiptFilename,
      receiptMimeType: lineItems.receiptMimeType,
      vendor: lineItems.vendor,
      expenseDate: lineItems.expenseDate,
      amount: lineItems.amount,
      currency: lineItems.currency,
      description: lineItems.description,
      categoryHint: lineItems.categoryHint,
      vCategory: verdicts.category,
      vStatus: verdicts.status,
      vConfidence: verdicts.confidence,
      vReasoning: verdicts.reasoning,
      vCitations: verdicts.citations,
      vNeedsReview: verdicts.needsHumanReview,
    })
    .from(lineItems)
    .leftJoin(verdicts, eq(verdicts.lineItemId, lineItems.id))
    .where(eq(lineItems.submissionId, id))
    .orderBy(lineItems.createdAt);

  const overrides = await db
    .select({
      id: verdictOverrides.id,
      lineItemId: verdictOverrides.lineItemId,
      previousStatus: verdictOverrides.previousStatus,
      newStatus: verdictOverrides.newStatus,
      comment: verdictOverrides.comment,
      createdAt: verdictOverrides.createdAt,
    })
    .from(verdictOverrides)
    .innerJoin(lineItems, eq(verdictOverrides.lineItemId, lineItems.id))
    .where(eq(lineItems.submissionId, id))
    .orderBy(desc(verdictOverrides.createdAt));

  const lineItemDetails: LineItemDetail[] = items.map((it) => ({
    id: it.id,
    receiptFilename: it.receiptFilename,
    receiptMimeType: it.receiptMimeType,
    vendor: it.vendor,
    expenseDate: it.expenseDate,
    amount: it.amount,
    currency: it.currency,
    description: it.description,
    categoryHint: it.categoryHint,
    verdict: it.vStatus
      ? {
          category: it.vCategory as string,
          status: it.vStatus as string,
          confidence: it.vConfidence as number,
          reasoning: it.vReasoning as string,
          citations: (it.vCitations as PolicyCitation[]) ?? [],
          needsHumanReview: Boolean(it.vNeedsReview),
        }
      : null,
    overrides: overrides
      .filter((o) => o.lineItemId === it.id)
      .map((o) => ({
        id: o.id,
        previousStatus: o.previousStatus,
        newStatus: o.newStatus,
        comment: o.comment,
        createdAt: o.createdAt,
      })),
  }));

  return { ...submission, lineItems: lineItemDetails };
}

/** Effective status = latest override's new status, else the model verdict's status. */
export function effectiveStatus(item: LineItemDetail): string {
  if (item.overrides.length > 0) return item.overrides[0].newStatus;
  return item.verdict?.status ?? "needs_review";
}
