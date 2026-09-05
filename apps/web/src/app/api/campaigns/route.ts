import { campaigns, db, workspaces } from "@sma/db";
import { enqueuePlanningJob } from "@sma/queue";
import { NextResponse } from "next/server";
import { z } from "zod";

const createCampaignSchema = z.object({
  workspaceId: z.string().optional(),
  goalText: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let workspaceId = parsed.data.workspaceId;
  if (!workspaceId) {
    const [workspace] = await db.select().from(workspaces).limit(1);
    if (!workspace) {
      return NextResponse.json(
        { error: "No workspace found. Run `pnpm --filter @sma/db seed` first." },
        { status: 400 },
      );
    }
    workspaceId = workspace.id;
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({ workspaceId, goalText: parsed.data.goalText })
    .returning();
  if (!campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  await enqueuePlanningJob({ campaignId: campaign.id });

  return NextResponse.json({ campaignId: campaign.id, status: campaign.status }, { status: 202 });
}
