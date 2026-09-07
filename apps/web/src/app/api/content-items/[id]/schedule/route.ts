import { rescheduleContentItem } from "@sma/domain";
import { reschedulePublish } from "@sma/queue";
import { NextResponse } from "next/server";
import { z } from "zod";

const scheduleSchema = z.object({
  scheduledFor: z.string().datetime(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const newScheduledFor = new Date(parsed.data.scheduledFor);

  let result: { status: string };
  try {
    result = await rescheduleContentItem(id, newScheduledFor);
  } catch {
    return NextResponse.json({ error: "Content item not found" }, { status: 404 });
  }

  if (result.status === "scheduled") {
    // Already approved and queued for the old date - re-time the pending
    // delayed publish job instead of leaving it firing on the stale date.
    const delayMs = Math.max(0, newScheduledFor.getTime() - Date.now());
    await reschedulePublish(id, delayMs);
  }

  return NextResponse.json({ scheduledFor: newScheduledFor.toISOString(), status: result.status });
}
