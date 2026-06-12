import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { policyQueries } from "@/lib/db/schema";
import { answerPolicyQuestion } from "@/lib/policy-qa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { question?: string };
    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json({ error: "A question is required" }, { status: 400 });
    }

    const { response } = await answerPolicyQuestion(question);

    // Persist the Q&A for auditability.
    try {
      const db = getDb();
      await db.insert(policyQueries).values({
        question,
        answer: response.answer,
        citations: response.citations,
        refused: response.refused,
        confidence: response.confidence,
      });
    } catch {
      // logging failure shouldn't break the answer
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to answer question" },
      { status: 500 },
    );
  }
}
