import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI } from "./embeddings";
import { retrievePolicyChunks, isWeakRetrieval, type RetrievedPolicyChunk } from "./retrieval";
import { applyCitationGuardrails } from "./citations";
import type { ExtractionResult } from "./extraction";
import type { Verdict } from "./types";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

const VerdictResponseSchema = z.object({
  category: z.string(),
  status: z.enum(["compliant", "flagged", "rejected", "needs_review"]),
  confidence: z.number(),
  reasoning: z.string(),
  citations: z.array(
    z.object({
      doc_id: z.string(),
      section: z.string().nullable(),
      quote: z.string(),
    }),
  ),
  needs_human_review: z.boolean(),
});

export interface TripContext {
  employeeName: string;
  grade: string;
  department: string;
  tripPurpose: string;
  tripStartDate: string;
  tripEndDate: string;
}

const VERDICT_SYSTEM = `You are a finance pre-review assistant for Northwind Logistics. A human reviewer
makes the final call; your job is to apply the company expense policy to a single expense line item
and explain your reasoning so the reviewer can trust or override it.

Rules:
- Decide a status: "compliant", "flagged" (likely violation a reviewer should check),
  "rejected" (clear violation), or "needs_review" (ambiguous, or policy is unclear/missing).
- You may ONLY cite from the numbered policy excerpts provided. Quote the exact supporting text
  verbatim in each citation's "quote" field. Never cite a policy that is not in the excerpts.
- If the provided excerpts do not actually support a verdict, return "needs_review" with low
  confidence rather than guessing.
- Consider the employee's grade and trip context — some limits depend on them.
- confidence is 0..1. Be honest about uncertainty.`;

function buildItemDescription(item: ExtractionResult): string {
  return [
    `Vendor: ${item.vendor ?? "unknown"}`,
    `Date: ${item.date ?? "unknown"}`,
    `Amount: ${item.amount ?? "unknown"} ${item.currency ?? ""}`.trim(),
    `Description: ${item.description ?? "unknown"}`,
    `Category hint: ${item.category_hint ?? "unknown"}`,
  ].join("\n");
}

function buildRetrievalQuery(item: ExtractionResult, trip: TripContext): string {
  return [
    item.category_hint,
    item.description,
    item.vendor,
    `expense policy limit reimbursement`,
    trip.tripPurpose,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatExcerpts(chunks: RetrievedPolicyChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[Excerpt ${i + 1}] doc_id=${c.docId}${c.section ? ` section=${c.section}` : ""}\n${c.content}`,
    )
    .join("\n\n");
}

export interface VerdictWithContext {
  verdict: Verdict;
  retrieved: RetrievedPolicyChunk[];
  weakRetrieval: boolean;
}

export async function generateVerdict(
  item: ExtractionResult,
  trip: TripContext,
): Promise<VerdictWithContext> {
  const query = buildRetrievalQuery(item, trip);
  const retrieved = await retrievePolicyChunks(query);
  const weakRetrieval = isWeakRetrieval(retrieved);

  const openai = getOpenAI();
  const userPrompt = `Employee: ${trip.employeeName} (grade ${trip.grade}, ${trip.department})
Trip: ${trip.tripPurpose} (${trip.tripStartDate} to ${trip.tripEndDate})

Expense line item:
${buildItemDescription(item)}

Policy excerpts (cite only from these):
${retrieved.length > 0 ? formatExcerpts(retrieved) : "(no relevant policy excerpts were retrieved)"}`;

  const completion = await openai.beta.chat.completions.parse({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: VERDICT_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(VerdictResponseSchema, "verdict"),
    temperature: 0,
  });

  const parsed = completion.choices[0].message.parsed;
  let verdict: Verdict = parsed
    ? {
        category: parsed.category,
        status: parsed.status,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        reasoning: parsed.reasoning,
        citations: parsed.citations.map((c) => ({
          doc_id: c.doc_id,
          section: c.section ?? undefined,
          quote: c.quote,
        })),
        needs_human_review: parsed.needs_human_review,
      }
    : {
        category: item.category_hint ?? "other",
        status: "needs_review",
        confidence: 0.2,
        reasoning: "The model did not return a structured verdict; routed to human review.",
        citations: [],
        needs_human_review: true,
      };

  // Verify each quote actually appears in a retrieved chunk; drop confidence otherwise.
  verdict = applyCitationGuardrails(
    verdict,
    retrieved.map((c) => ({ docId: c.docId, content: c.content })),
  );

  // Weak retrieval => don't let a confident verdict stand on thin evidence.
  if (weakRetrieval && verdict.status !== "needs_review") {
    verdict = {
      ...verdict,
      status: "needs_review",
      needs_human_review: true,
      confidence: Math.min(verdict.confidence, 0.4),
      reasoning: `${verdict.reasoning} Retrieved policy support was weak — routed to human review.`,
    };
  }

  return { verdict, retrieved, weakRetrieval };
}
