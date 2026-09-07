import { listFailedContentItemIds, retryContentItem } from "@sma/domain";
import { retryProductionRun } from "@sma/queue";
import { NextResponse } from "next/server";

export async function POST() {
  const ids = await listFailedContentItemIds();

  let retried = 0;
  for (const id of ids) {
    try {
      await retryContentItem(id);
      await retryProductionRun(id);
      retried++;
    } catch {
      // status flipped between the list query and here (e.g. another retry
      // already picked it up) - skip it rather than failing the whole batch.
    }
  }

  return NextResponse.json({ retried, total: ids.length });
}
