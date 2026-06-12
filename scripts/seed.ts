import "./load-env";
import { seedEmployees } from "../src/lib/seed-employees";

async function main() {
  const result = await seedEmployees();
  console.log(`Seeded ${result.inserted} employees from ${result.source}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
