import { contentItems, db as defaultDb, type Db } from "@sma/db";
import { eq } from "drizzle-orm";

export type ContentItemStep = "research" | "content" | "voice" | "creative" | "qa";

export async function markContentItemStep(
  contentItemId: string,
  step: ContentItemStep | null,
  deps: { db?: Db } = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;
  await db
    .update(contentItems)
    .set({ currentStep: step, currentStepStartedAt: step ? new Date() : null })
    .where(eq(contentItems.id, contentItemId));
}
