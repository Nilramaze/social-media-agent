import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing required env var: DATABASE_URL");

  const migrationClient = postgres(url, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("[db] running migrations...");
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("[db] migrations complete");

  await migrationClient.end();
}

main().catch((err) => {
  console.error("[db] migration failed", err);
  process.exit(1);
});
