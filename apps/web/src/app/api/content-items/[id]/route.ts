import {
  approvals,
  contentBriefs,
  contentItems,
  contentVersions,
  db,
  qaResults,
  researchFindings,
} from "@sma/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!item) {
    return NextResponse.json({ error: "Content item not found" }, { status: 404 });
  }

  const [brief] = await db.select().from(contentBriefs).where(eq(contentBriefs.id, item.briefId)).limit(1);

  const versions = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentItemId, id))
    .orderBy(desc(contentVersions.versionNumber));

  const [finding] = brief
    ? await db
        .select()
        .from(researchFindings)
        .where(eq(researchFindings.briefId, brief.id))
        .orderBy(desc(researchFindings.createdAt))
        .limit(1)
    : [];

  const qaHistory = await db
    .select()
    .from(qaResults)
    .where(eq(qaResults.contentItemId, id))
    .orderBy(desc(qaResults.createdAt));

  const approvalHistory = await db
    .select()
    .from(approvals)
    .where(eq(approvals.contentItemId, id))
    .orderBy(desc(approvals.decidedAt));

  return NextResponse.json({
    item,
    brief,
    versions,
    currentVersion: versions.find((v) => v.id === item.currentContentVersionId) ?? versions[0] ?? null,
    research: finding ?? null,
    qaHistory,
    approvalHistory,
  });
}
