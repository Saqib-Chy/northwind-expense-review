import fs from "fs/promises";
import path from "path";
import pdf from "pdf-parse";

const DOC_ID_PATTERN = /\b([A-Z]{2,5}-\d{3})\b/;

export interface PolicyChunkInput {
  docId: string;
  section: string | null;
  content: string;
  chunkIndex: number;
}

export function inferDocId(filename: string, text: string): string {
  const fromName = filename.match(DOC_ID_PATTERN)?.[1];
  if (fromName) return fromName;

  const fromText = text.slice(0, 500).match(DOC_ID_PATTERN)?.[1];
  if (fromText) return fromText;

  return path.basename(filename, path.extname(filename)).toUpperCase();
}

export function chunkPolicyText(text: string, docId: string): PolicyChunkInput[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: PolicyChunkInput[] = [];
  let buffer = "";
  let chunkIndex = 0;
  const maxChars = 900;
  const overlapChars = 120;

  const flush = (section: string | null) => {
    const content = buffer.trim();
    if (!content) return;
    chunks.push({ docId, section, content, chunkIndex });
    chunkIndex += 1;
    buffer = content.slice(Math.max(0, content.length - overlapChars));
  };

  for (const paragraph of paragraphs) {
    const sectionMatch = paragraph.match(/§\s*[\d.]+|[A-Z]{2,5}-\d{3}\s*§\s*[\d.]+/);
    const section = sectionMatch?.[0] ?? null;

    if ((buffer + "\n\n" + paragraph).length > maxChars) {
      flush(section);
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }

  flush(null);
  return chunks;
}

export async function extractPdfText(filePath: string): Promise<{ text: string; pages: number }> {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdf(buffer);
  return { text: parsed.text, pages: parsed.numpages };
}

export async function listPolicyPdfFiles(policiesDir: string): Promise<string[]> {
  const entries = await fs.readdir(policiesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(policiesDir, entry.name))
    .sort();
}
