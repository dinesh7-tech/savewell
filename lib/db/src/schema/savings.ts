import { createInsertSchema } from "drizzle-zod";
import { date, boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";
import { goalsTable } from "./goals";

export const savingsTable = pgTable("savewell_savings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id, { onDelete: "restrict" }),
  goalId: integer("goal_id").references(() => goalsTable.id, {
    onDelete: "set null",
  }),
  amountPaise: integer("amount_paise").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  note: text("note"),
  isGoalLinked: boolean("is_goal_linked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSavingSchema = createInsertSchema(savingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSaving = z.infer<typeof insertSavingSchema>;
export type Saving = typeof savingsTable.$inferSelect;