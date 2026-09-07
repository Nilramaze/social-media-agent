import { campaigns, contentBriefs, contentItems, db } from "@sma/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db
    .select({
      id: contentItems.id,
      status: contentItems.status,
      currentStep: contentItems.currentStep,
      currentStepStartedAt: contentItems.currentStepStartedAt,
      format: contentItems.format,
      qaRetryCount: contentItems.qaRetryCount,
      scheduledFor: contentItems.scheduledFor,
      lastError: contentItems.lastError,
      topic: contentBriefs.topic,
      campaignId: campaigns.id,
      campaignGoal: campaigns.goalText,
    })
    .from(contentItems)
    .innerJoin(contentBriefs, eq(contentItems.briefId, contentBriefs.id))
    .innerJoin(campaigns, eq(contentBriefs.campaignId, campaigns.id))
    .orderBy(desc(contentItems.createdAt))
    .limit(200);

  return NextResponse.json({ items: rows, serverTime: new Date().toISOString() });
}
