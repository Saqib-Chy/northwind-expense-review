import pdf from "pdf-parse";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI } from "./embeddings";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";

// Strict-output friendly: every field present, nullable instead of optional.
const ExtractionResponseSchema = z.object({
  vendor: z.string().nullable(),
  date: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  description: z.string().nullable(),
  category_hint: z.string().nullable(),
});

export type ExtractionResult = z.infer<typeof ExtractionResponseSchema>;

const EXTRACTION_SYSTEM = `You extract a single expense line item from a receipt.
Return the merchant/vendor, the transaction date (ISO YYYY-MM-DD), the total amount as a number,
the ISO currency code, a short description of what was purchased, and a coarse category hint
(e.g. airfare, lodging, ground_transport, meals, conference, other). If a field is not present,
return null for it. Extract only what the receipt shows — do not invent values.`;

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function isPdf(mimeType: string, filename: string): boolean {
  return mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const parsed = await pdf(buffer);
    return parsed.text?.trim() ?? "";
  } catch {
    return "";
  }
}

async function extractFromText(rawText: string): Promise<ExtractionResult> {
  const openai = getOpenAI();
  const completion = await openai.beta.chat.completions.parse({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM },
      { role: "user", content: `Receipt text:\n\n${rawText.slice(0, 6000)}` },
    ],
    response_format: zodResponseFormat(ExtractionResponseSchema, "line_item"),
    temperature: 0,
  });
  return completion.choices[0].message.parsed ?? emptyResult();
}

async function extractFromImage(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
  const openai = getOpenAI();
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const completion = await openai.beta.chat.completions.parse({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the expense line item from this receipt image." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: zodResponseFormat(ExtractionResponseSchema, "line_item"),
    temperature: 0,
  });
  return completion.choices[0].message.parsed ?? emptyResult();
}

function emptyResult(): ExtractionResult {
  return {
    vendor: null,
    date: null,
    amount: null,
    currency: null,
    description: null,
    category_hint: null,
  };
}

export interface ExtractReceiptInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export async function extractReceipt({
  buffer,
  filename,
  mimeType,
}: ExtractReceiptInput): Promise<{ result: ExtractionResult; source: "text" | "vision" | "txt" }> {
  if (isImage(mimeType)) {
    return { result: await extractFromImage(buffer, mimeType), source: "vision" };
  }

  if (isPdf(mimeType, filename)) {
    const text = await extractPdfText(buffer);
    // Scanned PDFs yield little/no text — fall back to vision on the raw bytes is not
    // possible without rendering, so we extract from whatever text we have. For truly
    // empty PDFs the verdict layer will see a sparse item and route to needs_review.
    return { result: await extractFromText(text || `(no extractable text in ${filename})`), source: "text" };
  }

  // Plain text and unknown formats: treat bytes as UTF-8 text.
  const text = buffer.toString("utf8");
  return { result: await extractFromText(text), source: "txt" };
}

export function normalizeExtractedDate(date: string | null): string | null {
  if (!date) return null;
  const match = date.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}
