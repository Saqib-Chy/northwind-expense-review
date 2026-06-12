import { NextRequest, NextResponse } from "next/server";
import { getSubmissionDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const detail = await getSubmissionDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    return NextResponse.json({ submission: detail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load submission" },
      { status: 500 },
    );
  }
}
