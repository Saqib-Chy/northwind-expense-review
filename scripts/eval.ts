import "./load-env";
import fs from "fs/promises";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { employees, policyChunks, submissions } from "../src/lib/db/schema";
import { getSubmissionDetail, type LineItemDetail } from "../src/lib/queries";
import { answerPolicyQuestion } from "../src/lib/policy-qa";
import { quoteAppearsInSource } from "../src/lib/citations";

/**
 * Evaluation harness.
 *
 * Usage:
 *   npm run eval -- path/to/expected.json
 *
 * It compares a JSON file of EXPECTED outcomes against what the system actually
 * stored in the database (for submissions/line items) and what the policy-chat
 * pipeline returns live (for Q&A refusal/citation tests).
 *
 * Expected-outcomes JSON shape (every field except identifiers is optional, so a
 * grader can specify only the signals they care about):
 *
 * {
 *   "submissions": [
 *     {
 *       // Identify a stored submission by id, OR by employee external id
 *       // (e.g. "NW-04821"), in which case the MOST RECENT submission for that
 *       // employee is used.
 *       "submissionId": "uuid",
 *       "employeeExternalId": "NW-04821",
 *       "expectedStatus": "flagged",          // optional submission rollup status
 *       "lineItems": [
 *         {
 *           "receiptFilename": "04_dinner_mercantile.pdf",  // matches stored receipt
 *           "expectedStatus": "flagged",                    // compliant|flagged|rejected|needs_review
 *           "expectedCategory": "meals",                    // optional
 *           "expectedCitationDocIds": ["TEP-002"]           // optional; any-overlap match
 *         }
 *       ]
 *     }
 *   ],
 *   "policyChat": [
 *     { "question": "What is the capital of France?", "expectRefusal": true },
 *     { "question": "Domestic flight class?", "expectRefusal": false, "expectCitationDocIds": ["TEP-005"] }
 *   ]
 * }
 *
 * Metrics reported:
 *   - Verdict accuracy        : stored verdict status == expectedStatus
 *   - Category accuracy       : stored category == expectedCategory (when provided)
 *   - Citation doc match      : stored citations overlap expectedCitationDocIds (when provided)
 *   - needs_review rate       : share of matched line items the system punted on
 *   - Citation verification   : share of stored citation quotes that actually appear
 *                               in the cited policy document's text (faithfulness)
 *   - Policy-chat refusal acc. : refused == expectRefusal
 *   - Policy-chat citation acc.: answered tests cite an expected doc (when provided)
 *
 * We evaluate against the MODEL verdict (verdicts table), not human overrides, so
 * the numbers reflect the system's own output.
 */

const STATUS = z.enum(["compliant", "flagged", "rejected", "needs_review"]);

const ExpectedLineItemSchema = z.object({
  receiptFilename: z.string(),
  expectedStatus: STATUS.optional(),
  expectedCategory: z.string().optional(),
  expectedCitationDocIds: z.array(z.string()).optional(),
});

const ExpectedSubmissionSchema = z
  .object({
    submissionId: z.string().optional(),
    employeeExternalId: z.string().optional(),
    expectedStatus: z.string().optional(),
    lineItems: z.array(ExpectedLineItemSchema).default([]),
  })
  .refine((s) => s.submissionId || s.employeeExternalId, {
    message: "Each submission needs a submissionId or employeeExternalId",
  });

const PolicyChatTestSchema = z.object({
  question: z.string(),
  expectRefusal: z.boolean().optional(),
  expectCitationDocIds: z.array(z.string()).optional(),
});

const ExpectedOutcomesSchema = z.object({
  submissions: z.array(ExpectedSubmissionSchema).default([]),
  policyChat: z.array(PolicyChatTestSchema).default([]),
});

type ExpectedOutcomes = z.infer<typeof ExpectedOutcomesSchema>;

/** Running tally that prints as "correct/total (pct%)". */
class Rate {
  correct = 0;
  total = 0;
  add(ok: boolean) {
    this.total += 1;
    if (ok) this.correct += 1;
  }
  get pct(): number {
    return this.total === 0 ? 0 : (this.correct / this.total) * 100;
  }
  toString(): string {
    if (this.total === 0) return "n/a (0 cases)";
    return `${this.correct}/${this.total} (${this.pct.toFixed(1)}%)`;
  }
}

async function resolveSubmissionId(
  exp: z.infer<typeof ExpectedSubmissionSchema>,
): Promise<string | null> {
  const db = getDb();

  if (exp.submissionId) {
    const [row] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.id, exp.submissionId))
      .limit(1);
    return row?.id ?? null;
  }

  // Resolve by employee external id -> most recent submission for that employee.
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.externalId, exp.employeeExternalId!))
    .limit(1);
  if (!emp) return null;

  const [latest] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.employeeId, emp.id))
    .orderBy(desc(submissions.createdAt))
    .limit(1);
  return latest?.id ?? null;
}

/** Map of doc_id -> concatenated chunk text, for citation faithfulness checks. */
async function loadDocText(): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({ docId: policyChunks.docId, content: policyChunks.content })
    .from(policyChunks);

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.docId, (map.get(row.docId) ?? "") + "\n" + row.content);
  }
  return map;
}

function findLineItem(
  items: LineItemDetail[],
  receiptFilename: string,
): LineItemDetail | undefined {
  return items.find((it) => it.receiptFilename === receiptFilename);
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npm run eval -- path/to/expected.json");
    process.exit(1);
  }

  let parsed: ExpectedOutcomes;
  try {
    const raw = await fs.readFile(inputPath, "utf8");
    parsed = ExpectedOutcomesSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.error(`Failed to read/parse ${inputPath}:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const docText = await loadDocText();

  const verdictAcc = new Rate();
  const categoryAcc = new Rate();
  const citationDocMatch = new Rate();
  const needsReview = new Rate();
  const citationVerification = new Rate();

  const unmatchedSubmissions: string[] = [];
  const unmatchedLineItems: string[] = [];

  console.log("\n=== Submission / line-item evaluation ===\n");

  for (const expSub of parsed.submissions) {
    const submissionId = await resolveSubmissionId(expSub);
    const label = expSub.submissionId ?? expSub.employeeExternalId ?? "(unknown)";

    if (!submissionId) {
      unmatchedSubmissions.push(label);
      console.log(`! No stored submission matched ${label}`);
      continue;
    }

    const detail = await getSubmissionDetail(submissionId);
    if (!detail) {
      unmatchedSubmissions.push(label);
      continue;
    }

    if (expSub.expectedStatus) {
      const ok = detail.status === expSub.expectedStatus;
      console.log(
        `Submission ${label}: status ${detail.status} (expected ${expSub.expectedStatus}) ${ok ? "OK" : "MISS"}`,
      );
    }

    // System-health rates over every stored line item in this submission.
    for (const item of detail.lineItems) {
      if (item.verdict) {
        needsReview.add(item.verdict.status === "needs_review");
        for (const c of item.verdict.citations) {
          const source = docText.get(c.doc_id) ?? "";
          citationVerification.add(quoteAppearsInSource(c.quote, source));
        }
      }
    }

    // Per-expectation accuracy.
    for (const expItem of expSub.lineItems) {
      const item = findLineItem(detail.lineItems, expItem.receiptFilename);
      if (!item || !item.verdict) {
        unmatchedLineItems.push(`${label} / ${expItem.receiptFilename}`);
        continue;
      }

      if (expItem.expectedStatus) {
        const ok = item.verdict.status === expItem.expectedStatus;
        verdictAcc.add(ok);
        console.log(
          `  ${expItem.receiptFilename}: ${item.verdict.status} (expected ${expItem.expectedStatus}) ${ok ? "OK" : "MISS"}`,
        );
      }

      if (expItem.expectedCategory) {
        categoryAcc.add(
          item.verdict.category.toLowerCase() === expItem.expectedCategory.toLowerCase(),
        );
      }

      if (expItem.expectedCitationDocIds && expItem.expectedCitationDocIds.length > 0) {
        const storedDocs = new Set(item.verdict.citations.map((c) => c.doc_id));
        const overlap = expItem.expectedCitationDocIds.some((d) => storedDocs.has(d));
        citationDocMatch.add(overlap);
      }
    }
  }

  // Policy-chat tests run the live Q&A pipeline.
  const refusalAcc = new Rate();
  const chatCitationAcc = new Rate();

  if (parsed.policyChat.length > 0) {
    console.log("\n=== Policy-chat evaluation ===\n");
    for (const test of parsed.policyChat) {
      const { response } = await answerPolicyQuestion(test.question);

      if (test.expectRefusal !== undefined) {
        const ok = response.refused === test.expectRefusal;
        refusalAcc.add(ok);
        console.log(
          `Q: ${test.question}\n   refused=${response.refused} (expected ${test.expectRefusal}) ${ok ? "OK" : "MISS"}`,
        );
      }

      if (
        !response.refused &&
        test.expectCitationDocIds &&
        test.expectCitationDocIds.length > 0
      ) {
        const storedDocs = new Set(response.citations.map((c) => c.doc_id));
        chatCitationAcc.add(test.expectCitationDocIds.some((d) => storedDocs.has(d)));
      }
    }
  }

  console.log("\n=== Summary ===\n");
  console.log(`Verdict accuracy           : ${verdictAcc}`);
  console.log(`Category accuracy          : ${categoryAcc}`);
  console.log(`Citation doc match         : ${citationDocMatch}`);
  console.log(`needs_review rate          : ${needsReview}`);
  console.log(`Citation verification rate : ${citationVerification}`);
  console.log(`Policy-chat refusal acc.   : ${refusalAcc}`);
  console.log(`Policy-chat citation acc.  : ${chatCitationAcc}`);

  if (unmatchedSubmissions.length > 0) {
    console.log(`\nUnmatched submissions: ${unmatchedSubmissions.join(", ")}`);
  }
  if (unmatchedLineItems.length > 0) {
    console.log(`Unmatched line items: ${unmatchedLineItems.join(", ")}`);
  }
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
