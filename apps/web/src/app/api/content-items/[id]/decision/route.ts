import { contentItems, db } from "@sma/db";
import { enqueueResumeGraph } from "@sma/queue";
import { eq } from "drizzle-orm";
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
  if (item.status !== "ready_for_review") {
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

  await enqueueResumeGraph({
    contentItemId: id,
    resumeValue: {
      decision: parsed.data.decision,
      target: parsed.data.target,
      feedback: parsed.data.feedback,
      decidedBy: parsed.data.decidedBy ?? "agency-user",
    },
  });

  return NextResponse.json({ status: "queued" }, { status: 202 });
}
