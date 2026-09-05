import {
  contentBriefs,
  contentItems,
  contentItemStatusValues,
  db,
} from "@sma/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status") ?? "ready_for_review";

  if (!contentItemStatusValues.includes(statusParam as (typeof contentItemStatusValues)[number])) {
    return NextResponse.json({ error: `Invalid status: ${statusParam}` }, { status: 400 });
  }
  const status = statusParam as (typeof contentItemStatusValues)[number];

  const rows = await db
    .select({
      id: contentItems.id,
      status: contentItems.status,
      format: contentItems.format,
      qaRetryCount: contentItems.qaRetryCount,
      createdAt: contentItems.createdAt,
      topic: contentBriefs.topic,
    })
    .from(contentItems)
    .innerJoin(contentBriefs, eq(contentItems.briefId, contentBriefs.id))
    .where(eq(contentItems.status, status))
    .orderBy(desc(contentItems.createdAt));

  return NextResponse.json({ items: rows });
}
