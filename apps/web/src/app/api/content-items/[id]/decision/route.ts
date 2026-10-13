import { contentItems, db } from "@sma/db";
import { statusAfterDecision, type ApprovalStage } from "@sma/domain";
import { enqueueResumeGraph } from "@sma/queue";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const decisionSchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  target: z.enum(["content", "creative"]).optional(),
  feedback: z.string().optional(),
  decidedBy: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!item) {
    return NextResponse.json({ error: "Content item not found" }, { status: 404 });
  }
  // Two gates resume the same graph thread: script_review (after the content
  // agent) and ready_for_review (after QA).
  const stage: ApprovalStage | null =
    item.status === "script_review" ? "script" : item.status === "ready_for_review" ? "final" : null;
  if (!stage) {
    return NextResponse.json(
      { error: `Content item is not awaiting review (status: ${item.status})` },
      { status: 409 },
    );
  }

  if (parsed.data.decision === "changes_requested" && !parsed.data.feedback) {
    return NextResponse.json(
      { error: "feedback is required for changes_requested" },
      { status: 400 },
    );
  }

  // Claim the decision before queueing it: a second submit (double click,
  // second tab) would otherwise resume the thread again - and after a script
  // approval the next pause is the final media review. The worker sets the
  // same status again when it records the decision.
  const claimed = await db
    .update(contentItems)
    .set({ status: statusAfterDecision(stage, parsed.data.decision) })
    .where(and(eq(contentItems.id, id), eq(contentItems.status, item.status)))
    .returning({ id: contentItems.id });
  if (claimed.length === 0) {
    return NextResponse.json({ error: "Decision was already submitted" }, { status: 409 });
  }

  try {
    await enqueueResumeGraph({
      contentItemId: id,
      resumeValue: {
        decision: parsed.data.decision,
        target: stage === "script" ? "content" : parsed.data.target,
        feedback: parsed.data.feedback,
        decidedBy: parsed.data.decidedBy ?? "agency-user",
        stage,
      },
    });
  } catch (err) {
    // Nothing was queued - hand the item back to the review queue.
    await db.update(contentItems).set({ status: item.status }).where(eq(contentItems.id, id));
    throw err;
  }

  return NextResponse.json({ status: "queued" }, { status: 202 });
}
