import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { lineItems, verdictOverrides, verdicts } from "@/lib/db/schema";
import { VerdictStatusSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { newStatus?: string; comment?: string };

    const parsedStatus = VerdictStatusSchema.safeParse(body.newStatus);
    if (!parsedStatus.success) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (!body.comment || !body.comment.trim()) {
      return NextResponse.json({ error: "A comment is required for an override" }, { status: 400 });
    }

    const db = getDb();

    const [item] = await db
      .select({ id: lineItems.id })
      .from(lineItems)
      .where(eq(lineItems.id, id))
      .limit(1);
    if (!item) {
      return NextResponse.json({ error: "Line item not found" }, { status: 404 });
    }

    const [verdict] = await db
      .select({ status: verdicts.status })
      .from(verdicts)
      .where(eq(verdicts.lineItemId, id))
      .limit(1);

    // Latest override wins as the "previous" status if one already exists.
    const [latestOverride] = await db
      .select({ newStatus: verdictOverrides.newStatus })
      .from(verdictOverrides)
      .where(eq(verdictOverrides.lineItemId, id))
      .orderBy(verdictOverrides.createdAt);

    const previousStatus = latestOverride?.newStatus ?? verdict?.status ?? "needs_review";

    const [override] = await db
      .insert(verdictOverrides)
      .values({
        lineItemId: id,
        previousStatus,
        newStatus: parsedStatus.data,
        comment: body.comment.trim(),
      })
      .returning();

    return NextResponse.json({ override }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply override" },
      { status: 500 },
    );
  }
}
