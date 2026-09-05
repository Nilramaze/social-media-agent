import { approvals, contentItems, db as defaultDb, type Db } from "@sma/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  target: z.enum(["content", "creative"]).optional(),
  feedback: z.string().optional(),
  decidedBy: z.string(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export interface RecordApprovalDeps {
  db?: Db;
}

export async function recordApprovalDecision(
  contentItemId: string,
  input: ApprovalDecisionInput,
  deps: RecordApprovalDeps = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);

  await db.insert(approvals).values({
    workspaceId: item.workspaceId,
    contentItemId,
    decision: input.decision,
    target: input.target,
    feedback: input.feedback,
    decidedBy: input.decidedBy,
  });

  const nextStatus =
    input.decision === "approved"
      ? "approved"
      : input.decision === "rejected"
        ? "rejected"
        : "drafting";

  await db
    .update(contentItems)
    .set({ status: nextStatus })
    .where(eq(contentItems.id, contentItemId));
}
