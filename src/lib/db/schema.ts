import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  grade: text("grade").notNull(),
  manager: text("manager").notNull(),
  department: text("department").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  tripPurpose: text("trip_purpose").notNull(),
  tripStartDate: date("trip_start_date").notNull(),
  tripEndDate: date("trip_end_date").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lineItems = pgTable("line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  receiptFilename: text("receipt_filename").notNull(),
  receiptMimeType: text("receipt_mime_type").notNull(),
  vendor: text("vendor"),
  expenseDate: date("expense_date"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  currency: text("currency").default("USD"),
  description: text("description"),
  categoryHint: text("category_hint"),
  extractedRaw: jsonb("extracted_raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verdicts = pgTable("verdicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  lineItemId: uuid("line_item_id")
    .notNull()
    .unique()
    .references(() => lineItems.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  status: text("status").notNull(),
  confidence: real("confidence").notNull(),
  reasoning: text("reasoning").notNull(),
  citations: jsonb("citations").notNull().default([]),
  needsHumanReview: boolean("needs_human_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verdictOverrides = pgTable("verdict_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  lineItemId: uuid("line_item_id")
    .notNull()
    .references(() => lineItems.id, { onDelete: "cascade" }),
  previousStatus: text("previous_status").notNull(),
  newStatus: text("new_status").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const policyDocuments = pgTable("policy_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  docId: text("doc_id").notNull().unique(),
  filename: text("filename").notNull(),
  title: text("title"),
  pageCount: integer("page_count"),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
});

export const policyChunks = pgTable("policy_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => policyDocuments.id, { onDelete: "cascade" }),
  docId: text("doc_id").notNull(),
  section: text("section"),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const policyQueries = pgTable("policy_queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  citations: jsonb("citations").notNull().default([]),
  refused: boolean("refused").notNull().default(false),
  confidence: real("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
