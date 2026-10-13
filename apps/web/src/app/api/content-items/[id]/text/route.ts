import { contentBriefs, contentItems, contentVersions, db, researchFindings } from "@sma/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Plain-text export of the item's current script - available from the script review on. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!item) {
    return NextResponse.json({ error: "Content item not found" }, { status: 404 });
  }
  if (!item.currentContentVersionId) {
    return NextResponse.json({ error: "Content item has no script yet" }, { status: 409 });
  }

  const [version] = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.id, item.currentContentVersionId))
    .limit(1);
  if (!version) {
    return NextResponse.json({ error: "Content version not found" }, { status: 404 });
  }

  const [brief] = await db.select().from(contentBriefs).where(eq(contentBriefs.id, item.briefId)).limit(1);
  const [research] = await db
    .select()
    .from(researchFindings)
    .where(eq(researchFindings.briefId, item.briefId))
    .orderBy(desc(researchFindings.createdAt))
    .limit(1);

  const topic = brief?.topic ?? "Content";
  const sections = [
    `${topic}\n${item.format} · Version ${version.versionNumber}`,
    `HOOK\n${version.hook}`,
    `SKRIPT\n${version.script}`,
    `CAPTION\n${version.caption}`,
    `CTA\n${version.cta}`,
    `HASHTAGS\n${version.hashtags.join(" ")}`,
  ];
  if (research) {
    const sources = research.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
    sections.push(`RECHERCHE\n${research.summary}${sources ? `\n\nQuellen:\n${sources}` : ""}`);
  }

  const slug =
    topic
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "content";
  const filename = `${slug}-v${version.versionNumber}.txt`;

  return new NextResponse(`${sections.join("\n\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
