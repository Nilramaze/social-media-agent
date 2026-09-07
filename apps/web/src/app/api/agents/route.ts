import { campaigns, contentBriefs, contentItems, db } from "@sma/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const items = await db
    .select({
      id: contentItems.id,
      status: contentItems.status,
      currentStep: contentItems.currentStep,
      currentStepStartedAt: contentItems.currentStepStartedAt,
      format: contentItems.format,
      scheduledFor: contentItems.scheduledFor,
      topic: contentBriefs.topic,
      campaignId: campaigns.id,
      campaignGoal: campaigns.goalText,
    })
    .from(contentItems)
    .innerJoin(contentBriefs, eq(contentItems.briefId, contentBriefs.id))
    .innerJoin(campaigns, eq(contentBriefs.campaignId, campaigns.id))
    .orderBy(desc(contentItems.createdAt))
    .limit(300);

  const planningCampaigns = await db
    .select({
      id: campaigns.id,
      goalText: campaigns.goalText,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(eq(campaigns.status, "draft"))
    .orderBy(desc(campaigns.createdAt));

  return NextResponse.json({ items, planningCampaigns, serverTime: new Date().toISOString() });
}
