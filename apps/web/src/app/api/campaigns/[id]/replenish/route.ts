import { campaigns, contentPillars, db } from "@sma/db";
import { MAX_REPLENISH_COUNT } from "@sma/domain";
import { enqueueReplenishJob } from "@sma/queue";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const replenishSchema = z.object({
  count: z.number().int().min(1).max(MAX_REPLENISH_COUNT),
});

/** Manual "Neue Inhalte generieren": plans `count` more briefs for the campaign. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = replenishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "active") {
    return NextResponse.json(
      { error: "Kampagne ist nicht aktiv - Nachplanung nur fuer aktive Kampagnen moeglich." },
      { status: 409 },
    );
  }

  const [pillar] = await db
    .select({ id: contentPillars.id })
    .from(contentPillars)
    .where(eq(contentPillars.campaignId, id))
    .limit(1);
  if (!pillar) {
    return NextResponse.json(
      { error: "Die Erstplanung ist noch nicht abgeschlossen." },
      { status: 409 },
    );
  }

  const queued = await enqueueReplenishJob({
    campaignId: id,
    count: parsed.data.count,
    trigger: "manual",
  });
  if (!queued) {
    return NextResponse.json({ error: "Eine Nachplanung laeuft bereits." }, { status: 409 });
  }

  return NextResponse.json({ queued: true, count: parsed.data.count }, { status: 202 });
}
