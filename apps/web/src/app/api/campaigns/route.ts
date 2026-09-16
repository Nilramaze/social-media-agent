import { campaigns, contentBriefFormatValues, db, workspaces } from "@sma/db";
import { enqueuePlanningJob } from "@sma/queue";
import { NextResponse } from "next/server";
import { z } from "zod";

const createCampaignSchema = z.object({
  workspaceId: z.string().optional(),
  goalText: z.string().min(1),
  designGuidelines: z.string().max(20_000).optional(),
  extraInstructions: z.string().max(5_000).optional(),
  bannedTerms: z.array(z.string().min(1).max(60)).max(50).optional(),
  // At least one format: a campaign that may produce nothing would leave the
  // strategist with no valid output.
  allowedFormats: z.array(z.enum(contentBriefFormatValues)).min(1).optional(),
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
    .values({
      workspaceId,
      goalText: parsed.data.goalText,
      designGuidelines: parsed.data.designGuidelines || null,
      extraInstructions: parsed.data.extraInstructions || null,
      bannedTerms: parsed.data.bannedTerms ?? [],
      ...(parsed.data.allowedFormats
        ? { allowedFormats: Array.from(new Set(parsed.data.allowedFormats)) }
        : {}),
    })
    .returning();
  if (!campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  await enqueuePlanningJob({ campaignId: campaign.id });

  return NextResponse.json({ campaignId: campaign.id, status: campaign.status }, { status: 202 });
}
