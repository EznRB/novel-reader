import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chaptersTable } from "./chapters";

export const chapterSummariesTable = pgTable("chapter_summaries", {
  id: serial("id").primaryKey(),
  chapterId: integer("chapter_id").notNull().unique().references(() => chaptersTable.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChapterSummarySchema = createInsertSchema(chapterSummariesTable).omit({ id: true, createdAt: true });
export type InsertChapterSummary = z.infer<typeof insertChapterSummarySchema>;
export type ChapterSummary = typeof chapterSummariesTable.$inferSelect;
