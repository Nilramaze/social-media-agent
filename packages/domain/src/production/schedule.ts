import { campaigns, contentBriefs, contentItems, db as defaultDb, type Db } from "@sma/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";

/** One slot per day, at this UTC hour, unless a slot is explicitly overridden via the calendar. */
export const SCHEDULE_HOUR_UTC = 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function atScheduleHour(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(SCHEDULE_HOUR_UTC, 0, 0, 0);
  return d;
}

/**
 * Auto-assigns the next free daily calendar slot for a campaign once QA
 * passes - one post/day, starting from the later of "now" and the
 * campaign's start date, stacking after whatever slot the campaign's other
 * items already occupy. Idempotent: never overwrites an existing slot, so a
 * QA retry loop or a manual reschedule from the calendar isn't undone.
 */
export async function assignScheduledSlot(
  contentItemId: string,
  deps: { db?: Db } = {},
): Promise<Date> {
  const db = deps.db ?? defaultDb;

  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);
  if (item.scheduledFor) return item.scheduledFor;

  const [brief] = await db.select().from(contentBriefs).where(eq(contentBriefs.id, item.briefId)).limit(1);
  if (!brief) throw new Error(`Content brief not found: ${item.briefId}`);

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, brief.campaignId)).limit(1);
  if (!campaign) throw new Error(`Campaign not found: ${brief.campaignId}`);

  const [latest] = await db
    .select({ scheduledFor: contentItems.scheduledFor })
    .from(contentItems)
    .innerJoin(contentBriefs, eq(contentItems.briefId, contentBriefs.id))
    .where(and(eq(contentBriefs.campaignId, brief.campaignId), isNotNull(contentItems.scheduledFor)))
    .orderBy(desc(contentItems.scheduledFor))
    .limit(1);

  const now = new Date();
  const earliestBase = campaign.startDate && campaign.startDate > now ? campaign.startDate : now;

  let slot = atScheduleHour(earliestBase);
  if (slot <= now) slot = new Date(slot.getTime() + ONE_DAY_MS);

  if (latest?.scheduledFor) {
    const afterLatest = new Date(atScheduleHour(latest.scheduledFor).getTime() + ONE_DAY_MS);
    if (afterLatest > slot) slot = afterLatest;
  }

  await db.update(contentItems).set({ scheduledFor: slot }).where(eq(contentItems.id, contentItemId));
  return slot;
}

/** Manual override from the calendar view (e.g. drag-to-reschedule). */
export async function rescheduleContentItem(
  contentItemId: string,
  newScheduledFor: Date,
  deps: { db?: Db } = {},
): Promise<{ status: string }> {
  const db = deps.db ?? defaultDb;
  const [item] = await db
    .update(contentItems)
    .set({ scheduledFor: newScheduledFor })
    .where(eq(contentItems.id, contentItemId))
    .returning({ status: contentItems.status });
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);
  return item;
}

export async function getContentItemSchedule(
  contentItemId: string,
  deps: { db?: Db } = {},
): Promise<Date | null> {
  const db = deps.db ?? defaultDb;
  const [item] = await db
    .select({ scheduledFor: contentItems.scheduledFor })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);
  return item.scheduledFor;
}

export async function markContentItemScheduled(
  contentItemId: string,
  deps: { db?: Db } = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;
  await db.update(contentItems).set({ status: "scheduled" }).where(eq(contentItems.id, contentItemId));
}
