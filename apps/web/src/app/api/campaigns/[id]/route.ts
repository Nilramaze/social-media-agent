import { campaigns, contentBriefs, contentPillars, db } from "@sma/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

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
