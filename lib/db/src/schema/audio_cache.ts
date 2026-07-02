import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";

export const audioCacheTable = pgTable("audio_cache", {
  id: serial("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  path: text("path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AudioCache = typeof audioCacheTable.$inferSelect;
