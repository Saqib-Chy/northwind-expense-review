import { NextResponse } from "next/server";
import { listSampleSubmissions } from "@/lib/samples";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const samples = await listSampleSubmissions();
    return NextResponse.json({
      samples: samples.map((s) => ({
        folder: s.folder,
        employeeId: s.employeeId,
        employeeName: s.employeeName,
        tripPurpose: s.tripPurpose,
        tripStartDate: s.tripStartDate,
        tripEndDate: s.tripEndDate,
        receiptCount: s.receipts.length,
        receiptNames: s.receipts.map((r) => r.filename),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load samples" },
      { status: 500 },
    );
  }
}
