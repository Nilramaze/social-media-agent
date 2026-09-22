import { discardPlan, PlanReviewError } from "@sma/domain";
import { requeuePlanningJob } from "@sma/queue";
import { NextResponse } from "next/server";
import { z } from "zod";

const replanSchema = z.object({
  feedback: z.string().trim().max(5_000).optional(),
});

/**
 * Plan review "Neu planen": discards the current pillars/briefs and lets the
 * strategist plan again, with the reviewer's feedback in the prompt.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = replanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await discardPlan(id);
  } catch (err) {
    if (err instanceof PlanReviewError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  await requeuePlanningJob({ campaignId: id, feedback: parsed.data.feedback || undefined });
  return NextResponse.json({ queued: true }, { status: 202 });
}
