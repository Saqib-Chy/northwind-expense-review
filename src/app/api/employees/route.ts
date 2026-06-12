import { NextResponse } from "next/server";
import { listEmployees } from "@/lib/queries";
import { seedEmployees } from "@/lib/seed-employees";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let rows = await listEmployees();
    if (rows.length === 0) {
      // Lazily seed the five sample employees on first use.
      await seedEmployees();
      rows = await listEmployees();
    }
    return NextResponse.json({ employees: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load employees" },
      { status: 500 },
    );
  }
}
