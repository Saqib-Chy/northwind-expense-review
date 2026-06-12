import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { policyChunks } from "./db/schema";
import { embedText } from "./embeddings";
import { RETRIEVAL_TOP_K, WEAK_RETRIEVAL_THRESHOLD } from "./types";

export interface RetrievedPolicyChunk {
  id: string;
  docId: string;
  section: string | null;
  content: string;
  similarity: number;
}

export async function retrievePolicyChunks(query: string): Promise<RetrievedPolicyChunk[]> {
  const db = getDb();
  const embedding = await embedText(query);

  const rows = await db
    .select({
      id: policyChunks.id,
      docId: policyChunks.docId,
      section: policyChunks.section,
      content: policyChunks.content,
      similarity: sql<number>`1 - (${policyChunks.embedding} <=> ${JSON.stringify(embedding)}::vector)`,
    })
    .from(policyChunks)
    .orderBy(sql`${policyChunks.embedding} <=> ${JSON.stringify(embedding)}::vector`)
    .limit(RETRIEVAL_TOP_K);

  return rows;
}

export function isWeakRetrieval(chunks: RetrievedPolicyChunk[]): boolean {
  if (chunks.length === 0) return true;
  return chunks[0].similarity < WEAK_RETRIEVAL_THRESHOLD;
}
