import { approvals, contentItems, db as defaultDb, type Db } from "@sma/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  target: z.enum(["content", "creative"]).optional(),
  feedback: z.string().optional(),
  decidedBy: z.string(),
  /** Which gate the reviewer answered; checked against the paused node. */
  stage: z.enum(["script", "final"]).optional(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

/**
 * "script": text-only gate right after the content agent, before any
 * voice/image/render spend. "final": review of the finished media after QA.
 */
export type ApprovalStage = "script" | "final";

export function statusAfterDecision(
  stage: ApprovalStage,
  decision: ApprovalDecisionInput["decision"],
): "rejected" | "drafting" | "in_qa" | "approved" {
  if (decision === "rejected") return "rejected";
  if (decision === "changes_requested") return "drafting";
  // An approved script moves on to voice/creative/QA production.
  return stage === "script" ? "in_qa" : "approved";
}

/** Puts an item back into the review queue of the given gate. */
export async function reopenReview(
  contentItemId: string,
  stage: ApprovalStage,
  deps: RecordApprovalDeps = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;
  await db
    .update(contentItems)
    .set({ status: stage === "script" ? "script_review" : "ready_for_review" })
    .where(eq(contentItems.id, contentItemId));
}

export interface RecordApprovalDeps {
  db?: Db;
}

export async function recordApprovalDecision(
  contentItemId: string,
  stage: ApprovalStage,
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

  // At the script stage only the text exists, so a change request can only
  // ever target it - whatever the client sent.
  const target = stage === "script" ? "content" : input.target;

  await db.insert(approvals).values({
    workspaceId: item.workspaceId,
    contentItemId,
    stage,
    decision: input.decision,
    target,
    feedback: input.feedback,
    decidedBy: input.decidedBy,
  });

  await db
    .update(contentItems)
    .set({ status: statusAfterDecision(stage, input.decision) })
    .where(eq(contentItems.id, contentItemId));
}
