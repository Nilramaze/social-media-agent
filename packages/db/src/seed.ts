import { eq } from "drizzle-orm";
import { db } from "./client";
import { brandProfiles, workspaces } from "./schema";

const AGENCY_WORKSPACE_NAME = "Interne Agentur";

async function main() {
  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, AGENCY_WORKSPACE_NAME))
    .limit(1);

  if (existing.length > 0) {
    console.log("[seed] workspace already exists, skipping");
    return;
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: AGENCY_WORKSPACE_NAME })
    .returning();

  if (!workspace) throw new Error("Failed to create workspace");

  await db.insert(brandProfiles).values({
    workspaceId: workspace.id,
    voice:
      "Direkt, verständlich, technisch kompetent. Für kleine Unternehmen erklärbar, keine Buzzword-Flut.",
    guidelines:
      "Keine unseriösen KI-Versprechen. Konkrete Probleme und Lösungen statt Hype.",
    targetAudience:
      "Inhaber:innen kleiner Unternehmen, die an KI-Automatisierung interessiert sind, aber technisch nicht tief involviert sein wollen.",
  });

  console.log(`[seed] created workspace ${workspace.id}`);
}

main()
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
