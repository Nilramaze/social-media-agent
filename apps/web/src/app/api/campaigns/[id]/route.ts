import { campaigns, contentBriefs, contentItems, contentPillars, db } from "@sma/db";
import { deleteCampaign } from "@sma/domain";
import { removeCampaignJobs, removeContentItemJobs } from "@sma/queue";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateCampaignSchema = z.object({
  designGuidelines: z.string().max(20_000).nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const pillars = await db
    .select()
    .from(contentPillars)
    .where(eq(contentPillars.campaignId, id));

  const briefs = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.campaignId, id));

  return NextResponse.json({ campaign, pillars, briefs });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [campaign] = await db
    .update(campaigns)
    .set({ designGuidelines: parsed.data.designGuidelines })
    .where(eq(campaigns.id, id))
    .returning();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const briefs = await db.select().from(contentBriefs).where(eq(contentBriefs.campaignId, id));
  for (const brief of briefs) {
    const items = await db.select().from(contentItems).where(eq(contentItems.briefId, brief.id));
    for (const item of items) {
      await removeContentItemJobs(item.id);
    }
  }
  await removeCampaignJobs(id);

  const result = await deleteCampaign(id);
  return NextResponse.json({ deleted: true, ...result });
}
