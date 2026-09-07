import { retryContentItem } from "@sma/domain";
import { retryProductionRun } from "@sma/queue";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await retryContentItem(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 409 });
  }

  await retryProductionRun(id);

  return NextResponse.json({ status: "queued" }, { status: 202 });
}
