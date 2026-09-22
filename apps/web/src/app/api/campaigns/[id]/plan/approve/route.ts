import { approvePlan, planEditsSchema, PlanReviewError } from "@sma/domain";
import { enqueueProductionRun } from "@sma/queue";
import { NextResponse } from "next/server";

const PLAN_REVIEW_ERROR_STATUS = {
  not_found: 404,
  not_in_review: 409,
  empty_plan: 400,
  invalid_edit: 400,
} as const;

/**
 * Plan review "Freigeben": applies the reviewer's edits to pillars/briefs,
 * activates the campaign and starts production (research first) for every
 * brief that is still in the plan.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = planEditsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { contentItemIds } = await approvePlan(id, parsed.data);
    for (const contentItemId of contentItemIds) {
      await enqueueProductionRun({ contentItemId });
    }
    return NextResponse.json({ approved: true, contentItems: contentItemIds.length });
  } catch (err) {
    if (err instanceof PlanReviewError) {
      return NextResponse.json(
        { error: err.message },
        { status: PLAN_REVIEW_ERROR_STATUS[err.code] },
      );
    }
    throw err;
  }
}
