import fs from "fs/promises";
import path from "path";
import { EmployeeInfoSchema, parseTripDates } from "./types";
import { SUBMISSIONS_DIR } from "./seed-employees";

export interface SampleReceipt {
  filename: string;
  absolutePath: string;
  mimeType: string;
}

export interface SampleSubmission {
  folder: string;
  employeeId: string;
  employeeName: string;
  tripPurpose: string;
  tripStartDate: string;
  tripEndDate: string;
  receipts: SampleReceipt[];
}

export function mimeFromExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export async function listSampleSubmissions(): Promise<SampleSubmission[]> {
  let entries;
  try {
    entries = await fs.readdir(SUBMISSIONS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const samples: SampleSubmission[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(SUBMISSIONS_DIR, entry.name);

    let info;
    try {
      const raw = await fs.readFile(path.join(folderPath, "employee_info.json"), "utf8");
      info = EmployeeInfoSchema.parse(JSON.parse(raw));
    } catch {
      continue;
    }

    const { start, end } = parseTripDates(info.trip_dates);
    const receiptsDir = path.join(folderPath, "receipts");
    let receiptFiles: string[] = [];
    try {
      receiptFiles = (await fs.readdir(receiptsDir)).filter(
        (f) => !f.startsWith("."),
      );
    } catch {
      receiptFiles = [];
    }

    samples.push({
      folder: entry.name,
      employeeId: info.employee_id,
      employeeName: info.name,
      tripPurpose: info.trip_purpose,
      tripStartDate: start,
      tripEndDate: end,
      receipts: receiptFiles.sort().map((filename) => ({
        filename,
        absolutePath: path.join(receiptsDir, filename),
        mimeType: mimeFromExtension(filename),
      })),
    });
  }

  return samples;
}

export async function getSampleByFolder(folder: string): Promise<SampleSubmission | null> {
  const samples = await listSampleSubmissions();
  return samples.find((s) => s.folder === folder) ?? null;
}
