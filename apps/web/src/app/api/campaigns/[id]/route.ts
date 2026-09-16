import {
  campaigns,
  contentBriefFormatValues,
  contentBriefs,
  contentItems,
  contentPillars,
  db,
} from "@sma/db";
import { deleteCampaign } from "@sma/domain";
import { removeCampaignJobs, removeContentItemJobs } from "@sma/queue";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateCampaignSchema = z
  .object({
    designGuidelines: z.string().max(20_000).nullable(),
    // Follow-up direction for a running campaign. goalText is deliberately
    // NOT patchable - the original prompt stays the campaign's anchor.
    extraInstructions: z.string().max(5_000).nullable(),
    bannedTerms: z.array(z.string().min(1).max(60)).max(50),
    // Applies to briefs planned from here on; already-planned briefs keep
    // the format they were created with.
    allowedFormats: z.array(z.enum(contentBriefFormatValues)).min(1),
    autoReplenish: z.boolean(),
    autoReplenishBufferDays: z.number().int().min(1).max(30),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

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
    .set({
      ...parsed.data,
      ...(parsed.data.allowedFormats
        ? { allowedFormats: Array.from(new Set(parsed.data.allowedFormats)) }
        : {}),
    })
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
