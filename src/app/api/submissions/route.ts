import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { listSubmissions } from "@/lib/queries";
import { createAndProcessSubmission, type ReceiptInput } from "@/lib/process-submission";
import { getSampleByFolder } from "@/lib/samples";
import { seedEmployees } from "@/lib/seed-employees";

export const dynamic = "force-dynamic";
// Receipt processing is synchronous and may take a while for many receipts.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const rows = await listSubmissions({ employeeId, status });
    return NextResponse.json({ submissions: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load submissions" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return await handleSampleSubmission(req);
    }
    return await handleUploadSubmission(req);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create submission" },
      { status: 500 },
    );
  }
}

async function handleUploadSubmission(req: NextRequest) {
  const form = await req.formData();
  const employeeId = String(form.get("employeeId") ?? "");
  const tripPurpose = String(form.get("tripPurpose") ?? "");
  const tripStartDate = String(form.get("tripStartDate") ?? "");
  const tripEndDate = String(form.get("tripEndDate") ?? "");
  const files = form.getAll("receipts").filter((f): f is File => f instanceof File);

  if (!employeeId || !tripPurpose || !tripStartDate || !tripEndDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "At least one receipt is required" }, { status: 400 });
  }

  const receipts: ReceiptInput[] = [];
  for (const file of files) {
    receipts.push({
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
    });
  }

  const result = await createAndProcessSubmission({
    employeeId,
    tripPurpose,
    tripStartDate,
    tripEndDate,
    receipts,
  });
  return NextResponse.json(result, { status: 201 });
}

async function handleSampleSubmission(req: NextRequest) {
  const body = (await req.json()) as { folder?: string };
  if (!body.folder) {
    return NextResponse.json({ error: "folder is required" }, { status: 400 });
  }

  const sample = await getSampleByFolder(body.folder);
  if (!sample) {
    return NextResponse.json({ error: "Sample not found" }, { status: 404 });
  }

  const db = getDb();
  let [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.externalId, sample.employeeId))
    .limit(1);

  if (!employee) {
    await seedEmployees();
    [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.externalId, sample.employeeId))
      .limit(1);
  }
  if (!employee) {
    return NextResponse.json({ error: "Employee for sample not found" }, { status: 404 });
  }

  const receipts: ReceiptInput[] = [];
  for (const r of sample.receipts) {
    receipts.push({
      buffer: await fs.readFile(r.absolutePath),
      filename: r.filename,
      mimeType: r.mimeType,
    });
  }

  const result = await createAndProcessSubmission({
    employeeId: employee.id,
    tripPurpose: sample.tripPurpose,
    tripStartDate: sample.tripStartDate,
    tripEndDate: sample.tripEndDate,
    receipts,
  });
  return NextResponse.json(result, { status: 201 });
}
