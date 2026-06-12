import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI } from "./embeddings";
import { retrievePolicyChunks, isWeakRetrieval, type RetrievedPolicyChunk } from "./retrieval";
import { verifyCitations } from "./citations";
import type { PolicyQueryResponse } from "./types";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

const QAResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      doc_id: z.string(),
      section: z.string().nullable(),
      quote: z.string(),
    }),
  ),
  refused: z.boolean(),
  confidence: z.number().nullable(),
  refusal_reason: z.string().nullable(),
});

const QA_SYSTEM = `You answer questions ONLY about Northwind Logistics' policy library, using the
provided policy excerpts. Rules:
- If the question cannot be answered from the excerpts, or is outside the policy library's scope,
  set refused=true, give a brief refusal_reason, and do not fabricate an answer.
- When you answer, quote the exact supporting text verbatim in each citation's "quote" field, and
  only cite doc_ids that appear in the excerpts.
- Do NOT name specific policy document IDs (e.g. "TEP-005") in the prose "answer" field. Put every
  document reference only in the citations array; in prose refer to policies by topic (e.g. "the air
  travel policy").
- confidence is 0..1 (or null if refused). Be honest about uncertainty.`;

// Matches policy document IDs like TEP-005, COC-001, SEC-201.
const DOC_ID_RE = /\b[A-Z]{2,5}-\d{2,4}\b/g;

function docIdsInText(text: string): string[] {
  return Array.from(new Set(text.match(DOC_ID_RE) ?? []));
}

function formatExcerpts(chunks: RetrievedPolicyChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[Excerpt ${i + 1}] doc_id=${c.docId}${c.section ? ` section=${c.section}` : ""}\n${c.content}`,
    )
    .join("\n\n");
}

export async function answerPolicyQuestion(
  question: string,
): Promise<{ response: PolicyQueryResponse; retrieved: RetrievedPolicyChunk[] }> {
  const retrieved = await retrievePolicyChunks(question);

  // No usable retrieval at all -> refuse outright without spending a model call on a guess.
  if (retrieved.length === 0 || isWeakRetrieval(retrieved)) {
    return {
      response: {
        answer:
          "I can't answer that from the Northwind policy library — I didn't find relevant policy text.",
        citations: [],
        refused: true,
        confidence: null,
        refusal_reason: "No sufficiently relevant policy content was retrieved.",
      },
      retrieved,
    };
  }

  const openai = getOpenAI();
  const completion = await openai.beta.chat.completions.parse({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: QA_SYSTEM },
      {
        role: "user",
        content: `Question: ${question}\n\nPolicy excerpts:\n${formatExcerpts(retrieved)}`,
      },
    ],
    response_format: zodResponseFormat(QAResponseSchema, "policy_answer"),
    temperature: 0,
  });

  const parsed = completion.choices[0].message.parsed;
  if (!parsed) {
    return {
      response: {
        answer: "I couldn't produce a grounded answer for that question.",
        citations: [],
        refused: true,
        confidence: null,
        refusal_reason: "Model did not return a structured response.",
      },
      retrieved,
    };
  }

  const citations = parsed.citations.map((c) => ({
    doc_id: c.doc_id,
    section: c.section ?? undefined,
    quote: c.quote,
  }));

  // Keep only citations whose quotes actually appear in retrieved chunks.
  const { verified } = verifyCitations(
    citations,
    retrieved.map((c) => ({ docId: c.docId, content: c.content })),
  );

  // If the model claimed an answer but no citation survives verification, downgrade to refusal.
  if (!parsed.refused && parsed.citations.length > 0 && verified.length === 0) {
    return {
      response: {
        answer:
          "I found related policy text but couldn't verify a faithful citation, so I'm declining rather than risk a wrong answer.",
        citations: [],
        refused: true,
        confidence: null,
        refusal_reason: "Citations failed verification against the source excerpts.",
      },
      retrieved,
    };
  }

  // Faithfulness guard: the prose answer must not assert a policy document ID that isn't backed by a
  // verified citation. (The model sometimes name-drops e.g. "TEP-003" in prose while the real
  // supporting clause came from a different doc.) If it does, decline rather than mislead.
  if (!parsed.refused) {
    const verifiedDocs = new Set(verified.map((c) => c.doc_id));
    const unsupportedDocs = docIdsInText(parsed.answer).filter((d) => !verifiedDocs.has(d));
    if (unsupportedDocs.length > 0) {
      return {
        response: {
          answer:
            "I drafted an answer but it referenced a policy document I couldn't verify against the source text, so I'm declining rather than risk citing the wrong policy.",
          citations: [],
          refused: true,
          confidence: null,
          refusal_reason: `Answer referenced unverified policy document(s): ${unsupportedDocs.join(", ")}.`,
        },
        retrieved,
      };
    }
  }

  return {
    response: {
      answer: parsed.answer,
      citations: verified,
      refused: parsed.refused,
      confidence: parsed.confidence,
      refusal_reason: parsed.refusal_reason,
    },
    retrieved,
  };
}
