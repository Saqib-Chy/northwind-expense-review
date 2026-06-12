import "./load-env";
import fs from "fs/promises";
import path from "path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(url);
  const migrationPath = path.join(process.cwd(), "drizzle", "0000_init.sql");
  const migration = await fs.readFile(migrationPath, "utf8");

  // Create pgvector first and wait until the `vector` type is visible. Over Neon's
  // HTTP driver each statement is its own request, and on a fresh database the type
  // can lag behind CREATE EXTENSION — so poll before running table DDL that uses it.
  await sql("CREATE EXTENSION IF NOT EXISTS vector");
  for (let i = 0; i < 10; i++) {
    const rows = (await sql(
      "SELECT 1 FROM pg_type WHERE typname = 'vector'",
    )) as unknown[];
    if (rows.length > 0) break;
    if (i === 9) {
      throw new Error("pgvector 'vector' type not available after creating extension");
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Run remaining statements one at a time — Neon HTTP driver runs one command per call.
  const statements = migration
    .split(";")
    .map((s) => s.trim())
    .filter(
      (s) => s.length > 0 && !s.startsWith("--") && !/create\s+extension/i.test(s),
    );

  for (const statement of statements) {
    try {
      await sql(statement);
    } catch (error) {
      console.error("Failed statement:\n", statement, "\n");
      throw error;
    }
  }

  console.log("Migration complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
