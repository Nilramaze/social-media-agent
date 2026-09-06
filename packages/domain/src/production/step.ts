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

export async function getContentItemFormat(
  contentItemId: string,
  deps: { db?: Db } = {},
): Promise<"reel" | "carousel" | "post"> {
  const db = deps.db ?? defaultDb;
  const [item] = await db
    .select({ format: contentItems.format })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);
  return item.format;
}
