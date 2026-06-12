import { eq, sql } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { getDb } from "./db";
import { policyChunks, policyDocuments } from "./db/schema";
import { embedTexts } from "./embeddings";
import {
  chunkPolicyText,
  extractPdfText,
  inferDocId,
  listPolicyPdfFiles,
} from "./policy-ingestion";

export interface IngestPoliciesResult {
  documentsProcessed: number;
  chunksCreated: number;
  skipped: string[];
}

export async function ingestPoliciesFromDir(
  policiesDir = path.join(process.cwd(), "policies"),
): Promise<IngestPoliciesResult> {
  const db = getDb();
  let documentsProcessed = 0;
  let chunksCreated = 0;
  const skipped: string[] = [];

  let files: string[];
  try {
    files = await listPolicyPdfFiles(policiesDir);
  } catch {
    return { documentsProcessed: 0, chunksCreated: 0, skipped: ["policies directory not found"] };
  }

  if (files.length === 0) {
    return { documentsProcessed: 0, chunksCreated: 0, skipped: ["no PDF files in policies/"] };
  }

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const { text, pages } = await extractPdfText(filePath);
    if (!text.trim()) {
      skipped.push(`${filename} (empty text)`);
      continue;
    }

    const docId = inferDocId(filename, text);
    const existing = await db
      .select({ id: policyDocuments.id })
      .from(policyDocuments)
      .where(eq(policyDocuments.docId, docId))
      .limit(1);

    if (existing.length > 0) {
      skipped.push(`${filename} (already ingested as ${docId})`);
      continue;
    }

    const [document] = await db
      .insert(policyDocuments)
      .values({
        docId,
        filename,
        title: docId,
        pageCount: pages,
      })
      .returning();

    const chunks = chunkPolicyText(text, docId);
    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      await db.insert(policyChunks).values({
        documentId: document.id,
        docId: chunk.docId,
        section: chunk.section,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        embedding: sql`${JSON.stringify(embedding)}::vector`,
      });
      chunksCreated += 1;
    }

    documentsProcessed += 1;
  }

  return { documentsProcessed, chunksCreated, skipped };
}

export async function countPolicyChunks(): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(policyChunks);
  return row?.count ?? 0;
}

export async function policiesDirectoryExists(): Promise<boolean> {
  const policiesDir = path.join(process.cwd(), "policies");
  try {
    await fs.access(policiesDir);
    return true;
  } catch {
    return false;
  }
}
