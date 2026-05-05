import { pgTable, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { booksTable } from "./books";

export const readingProgressTable = pgTable("reading_progress", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().unique().references(() => booksTable.id, { onDelete: "cascade" }),
  currentChapter: integer("current_chapter").notNull().default(1),
  characterPosition: integer("character_position").notNull().default(0),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReadingProgressSchema = createInsertSchema(readingProgressTable).omit({ id: true });
export type InsertReadingProgress = z.infer<typeof insertReadingProgressSchema>;
export type ReadingProgress = typeof readingProgressTable.$inferSelect;
