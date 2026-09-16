import {
  contentBriefs,
  contentItems,
  db as defaultDb,
  researchFindings,
  type Db,
} from "@sma/db";
import type { LLMProvider, SearchProvider, ToolSpec } from "@sma/providers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { NODE_MODELS } from "../model-config";
import { buildGuardrailBlock, getCampaignGuardrailsForBrief } from "./campaign-context";
import { researchOutputSchema } from "./schema";

const RESEARCH_SYSTEM_PROMPT = `Du bist der Research-Agent einer Social-Media-Marketing-Pipeline.
Du recherchierst Fakten, Trends und Zielgruppen-Probleme - immer streng innerhalb des Kampagnen-Briefings im Prompt. Suchanfragen, die das Kampagnenthema verlassen, stellst du nicht.
Nutze das "search"-Tool so oft wie noetig (aber sparsam), um belastbare, aktuelle Informationen zu sammeln.
Rufe erst "submit_findings" auf, wenn du genug recherchiert hast. Jede Aussage in der Zusammenfassung muss durch mindestens eine der angegebenen Quellen gedeckt sein.`;

export interface RunResearchDeps {
  llm: LLMProvider;
  search: SearchProvider;
  db?: Db;
}

export async function runResearch(
  contentItemId: string,
  deps: RunResearchDeps,
): Promise<{ researchFindingId: string }> {
  const db = deps.db ?? defaultDb;

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);

  const [brief] = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.id, item.briefId))
    .limit(1);
  if (!brief) throw new Error(`Content brief not found: ${item.briefId}`);

  const searchTool: ToolSpec<{ query: string }> = {
    name: "search",
    description: "Search the web for current information related to the topic.",
    inputSchema: z.object({ query: z.string().min(1) }),
    execute: async ({ query }) => {
      const results = await deps.search.search(query);
      return JSON.stringify(results.slice(0, 5));
    },
  };

  const guardrails = await getCampaignGuardrailsForBrief(brief.id, { db });
  if (!guardrails) {
    throw new Error(`No campaign for brief: ${brief.id}`);
  }

  const prompt = `${buildGuardrailBlock(guardrails)}

Recherchiere zum Thema: "${brief.topic}" (Format: ${brief.format}).
Ziel: belastbares Material fuer einen Social-Media-Post sammeln, der auf das Kampagnen-Briefing oben einzahlt.
Deine Zusammenfassung darf nur Material enthalten, das direkt zum Kampagnen-Briefing gehoert.`;

  const output = await deps.llm.runAgenticStructured({
    system: RESEARCH_SYSTEM_PROMPT,
    prompt,
    model: NODE_MODELS.research,
    schema: researchOutputSchema,
    tools: [searchTool],
    maxIterations: 6,
  });

  const [finding] = await db
    .insert(researchFindings)
    .values({
      workspaceId: item.workspaceId,
      briefId: brief.id,
      topic: brief.topic,
      summary: output.summary,
      sources: output.sources,
    })
    .returning();
  if (!finding) throw new Error("Failed to insert research finding");

  await db
    .update(contentItems)
    .set({ status: "drafting" })
    .where(eq(contentItems.id, item.id));

  return { researchFindingId: finding.id };
}
