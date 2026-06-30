import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { booksTable } from "./books";

export const KNOWLEDGE_ENTITY_TYPES = [
  "character",
  "organization",
  "faction",
  "kingdom",
  "location",
  "skill",
  "artifact",
  "event",
] as const;

export type KnowledgeEntityType = typeof KNOWLEDGE_ENTITY_TYPES[number];

export const bookKnowledgeTable = pgTable("book_knowledge", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => booksTable.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  firstAppearanceChapter: integer("first_appearance_chapter"),
  lastMentionedChapter: integer("last_mentioned_chapter"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookKnowledgeSchema = createInsertSchema(bookKnowledgeTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertBookKnowledge = z.infer<typeof insertBookKnowledgeSchema>;
export type BookKnowledge = typeof bookKnowledgeTable.$inferSelect;
