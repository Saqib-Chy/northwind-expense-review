import fs from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { employees } from "./db/schema";
import { EmployeeInfoSchema, type EmployeeInfo } from "./types";

export const SUBMISSIONS_DIR = path.join(process.cwd(), "submissions");

function deriveEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  return `${slug || "employee"}@northwindlogistics.com`;
}

/** Read every employee_info.json under submissions/ that parses cleanly. */
export async function loadEmployeesFromSubmissions(): Promise<EmployeeInfo[]> {
  const loaded: EmployeeInfo[] = [];
  let entries;
  try {
    entries = await fs.readdir(SUBMISSIONS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const infoPath = path.join(SUBMISSIONS_DIR, entry.name, "employee_info.json");
    try {
      const raw = await fs.readFile(infoPath, "utf8");
      loaded.push(EmployeeInfoSchema.parse(JSON.parse(raw)));
    } catch {
      // skip malformed / missing employee_info.json
    }
  }

  return loaded;
}

export async function seedEmployees(): Promise<{ inserted: number; source: string }> {
  const db = getDb();
  const fromSubmissions = await loadEmployeesFromSubmissions();

  let inserted = 0;
  for (const employee of fromSubmissions) {
    const externalId = employee.employee_id;
    const existing = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.externalId, externalId))
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(employees).values({
      externalId,
      name: employee.name,
      email: deriveEmail(employee.name),
      grade: employee.grade,
      manager: employee.manager_id ?? "—",
      department: employee.department,
    });
    inserted += 1;
  }

  return { inserted, source: "submissions/" };
}
