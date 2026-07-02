import { pgTable, text, json, timestamp, serial } from "drizzle-orm/pg-core";

export const aiCacheTable = pgTable("ai_cache", {
  id: serial("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  result: json("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AICache = typeof aiCacheTable.$inferSelect;
