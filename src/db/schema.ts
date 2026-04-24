import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("portions"), // portions, lbs, oz, units, etc.
  category: text("category").notNull().default("uncategorized"),
  defaultShelfLifeDays: integer("default_shelf_life_days"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(date('now'))`),
});

// Each time product is prepped, a new batch row is created.
// Multiple batches of the same product track separately (FIFO).
export const prepBatches = sqliteTable("prep_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  datePrepped: text("date_prepped").notNull(), // YYYY-MM-DD
  quantityPrepped: real("quantity_prepped").notNull(),
  quantityRemaining: real("quantity_remaining").notNull(),
  shelfLifeDays: integer("shelf_life_days").notNull(),
  expiryDate: text("expiry_date").notNull(), // YYYY-MM-DD (datePrepped + shelfLifeDays)
  notes: text("notes"),
  status: text("status").notNull().default("active"), // active | expired | depleted
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Sales records - one row per product per day.
// source allows future POS integration: 'manual' | 'pos_import' | 'pos_webhook'
export const salesRecords = sqliteTable("sales_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  saleDate: text("sale_date").notNull(), // YYYY-MM-DD
  quantitySold: real("quantity_sold").notNull(),
  source: text("source").notNull().default("manual"), // manual | pos_import | pos_webhook
  externalRef: text("external_ref"), // POS transaction/batch ID for dedup
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Denormalized daily summary - refreshed at EOD, used for analytics queries.
export const dailySummaries = sqliteTable("daily_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  summaryDate: text("summary_date").notNull(), // YYYY-MM-DD
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  totalPrepped: real("total_prepped").notNull().default(0),
  totalSold: real("total_sold").notNull().default(0),
  totalWaste: real("total_waste").notNull().default(0), // expired before sold
  closingStock: real("closing_stock").notNull().default(0),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Option lists — just drive the dropdowns. Product.category/unit remain plain strings
// so renaming an option doesn't silently alter existing product data.
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const units = sqliteTable("units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// User-defined kitchen locations (walk-in, line, freezer, prep station, etc.)
export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Physical count of a product at a specific location on a specific date.
// Upsert on (productId, locationId, countDate) — a re-count overwrites.
export const counts = sqliteTable("counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  countDate: text("count_date").notNull(), // YYYY-MM-DD
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  quantity: real("quantity").notNull(),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type PrepBatch = typeof prepBatches.$inferSelect;
export type NewPrepBatch = typeof prepBatches.$inferInsert;
export type SalesRecord = typeof salesRecords.$inferSelect;
export type NewSalesRecord = typeof salesRecords.$inferInsert;
export type DailySummary = typeof dailySummaries.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Count = typeof counts.$inferSelect;
export type NewCount = typeof counts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
