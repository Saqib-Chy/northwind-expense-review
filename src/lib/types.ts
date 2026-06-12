import { z } from "zod";

export const VerdictStatusSchema = z.enum([
  "compliant",
  "flagged",
  "rejected",
  "needs_review",
]);

export type VerdictStatus = z.infer<typeof VerdictStatusSchema>;

export const PolicyCitationSchema = z.object({
  doc_id: z.string(),
  section: z.string().optional(),
  quote: z.string(),
});

export type PolicyCitation = z.infer<typeof PolicyCitationSchema>;

export const ExtractedLineItemSchema = z.object({
  vendor: z.string().nullable(),
  date: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().default("USD"),
  description: z.string().nullable(),
  category_hint: z.string().nullable().optional(),
});

export type ExtractedLineItem = z.infer<typeof ExtractedLineItemSchema>;

export const VerdictSchema = z.object({
  category: z.string(),
  status: VerdictStatusSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  citations: z.array(PolicyCitationSchema),
  needs_human_review: z.boolean(),
});

export type Verdict = z.infer<typeof VerdictSchema>;

// Matches the real submissions/*/employee_info.json shape.
export const EmployeeInfoSchema = z.object({
  employee_id: z.string(),
  name: z.string(),
  grade: z.union([z.number(), z.string()]).transform((v) => String(v)),
  title: z.string().optional(),
  department: z.string(),
  manager_id: z.string().optional(),
  home_base: z.string().optional(),
  trip_purpose: z.string(),
  trip_dates: z.string(), // e.g. "2025-04-14 to 2025-04-16"
});

export type EmployeeInfo = z.infer<typeof EmployeeInfoSchema>;

/** Parse "2025-04-14 to 2025-04-16" into ISO start/end dates. */
export function parseTripDates(tripDates: string): { start: string; end: string } {
  const matches = tripDates.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const start = matches[0] ?? "";
  const end = matches[1] ?? matches[0] ?? "";
  return { start, end };
}

export const PolicyQueryResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(PolicyCitationSchema),
  refused: z.boolean(),
  confidence: z.number().min(0).max(1).nullable(),
  refusal_reason: z.string().nullable().optional(),
});

export type PolicyQueryResponse = z.infer<typeof PolicyQueryResponseSchema>;

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const RETRIEVAL_TOP_K = 6;
export const WEAK_RETRIEVAL_THRESHOLD = 0.35;
