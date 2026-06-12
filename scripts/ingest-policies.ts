import "./load-env";
import { ingestPoliciesFromDir } from "../src/lib/ingest-policies";

async function main() {
  const result = await ingestPoliciesFromDir();
  console.log(
    `Ingested ${result.documentsProcessed} documents, ${result.chunksCreated} chunks.`,
  );
  if (result.skipped.length > 0) {
    console.log("Skipped:", result.skipped.join(", "));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
