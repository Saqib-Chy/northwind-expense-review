import type { PolicyCitation, Verdict } from "./types";

export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function quoteAppearsInSource(quote: string, sourceContent: string): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  const normalizedSource = normalizeForMatch(sourceContent);
  if (!normalizedQuote) return false;

  if (normalizedSource.includes(normalizedQuote)) return true;

  // Fallback: match on a prefix for minor OCR / formatting drift.
  const prefix = normalizedQuote.slice(0, Math.min(80, normalizedQuote.length));
  return prefix.length >= 20 && normalizedSource.includes(prefix);
}

export function verifyCitations(
  citations: PolicyCitation[],
  sourceChunks: Array<{ docId: string; content: string }>,
): { verified: PolicyCitation[]; allVerified: boolean } {
  const verified: PolicyCitation[] = [];

  for (const citation of citations) {
    const source = sourceChunks.find((chunk) => chunk.docId === citation.doc_id);
    if (source && quoteAppearsInSource(citation.quote, source.content)) {
      verified.push(citation);
    }
  }

  return { verified, allVerified: verified.length === citations.length && citations.length > 0 };
}

export function applyCitationGuardrails(
  verdict: Verdict,
  sourceChunks: Array<{ docId: string; content: string }>,
): Verdict {
  const { verified, allVerified } = verifyCitations(verdict.citations, sourceChunks);

  if (verdict.citations.length === 0 || !allVerified) {
    return {
      ...verdict,
      citations: verified,
      confidence: Math.min(verdict.confidence, 0.45),
      status: "needs_review",
      needs_human_review: true,
      reasoning: `${verdict.reasoning} Citation verification failed or was incomplete — routed to human review.`,
    };
  }

  return { ...verdict, citations: verified };
}
