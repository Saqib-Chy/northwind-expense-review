import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees, policyChunks } from "@/lib/db/schema";
import { policiesDirectoryExists } from "@/lib/ingest-policies";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const hasPoliciesDir = await policiesDirectoryExists();

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({
        ok: false,
        hasDatabase: false,
        hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
        hasPoliciesDir,
      });
    }

    const db = getDb();
    const [policyRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(policyChunks);
    const [employeeRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees);

    return NextResponse.json({
      ok: true,
      hasDatabase: true,
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      hasPoliciesDir,
      policyChunkCount: policyRow?.count ?? 0,
      employeeCount: employeeRow?.count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
