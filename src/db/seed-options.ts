/**
 * Seeds the categories and units option tables.
 * - Defaults: common kitchen units and any categories already in use.
 * - Idempotent: skips inserts that violate UNIQUE.
 *
 * Run with: npx tsx src/db/seed-options.ts
 */
import Database from "better-sqlite3";
import path from "path";

const db = new Database(path.join(process.cwd(), "data", "cabinflow.db"));

const DEFAULT_UNITS = ["portions", "lbs", "oz", "units", "kg", "g", "ea"];
const DEFAULT_CATEGORIES = ["proteins", "sides", "sauces", "produce", "uncategorized"];

const existingUnits = db
  .prepare("SELECT DISTINCT unit FROM products WHERE unit IS NOT NULL AND unit != ''")
  .all() as { unit: string }[];
const existingCategories = db
  .prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''")
  .all() as { category: string }[];

const unitsToSeed = new Set([...DEFAULT_UNITS, ...existingUnits.map((r) => r.unit)]);
const categoriesToSeed = new Set([...DEFAULT_CATEGORIES, ...existingCategories.map((r) => r.category)]);

const insertUnit = db.prepare("INSERT OR IGNORE INTO units (name) VALUES (?)");
const insertCategory = db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");

for (const name of unitsToSeed) insertUnit.run(name);
for (const name of categoriesToSeed) insertCategory.run(name);

const units = db.prepare("SELECT * FROM units ORDER BY name").all();
const categories = db.prepare("SELECT * FROM categories ORDER BY name").all();

console.log("units:", units);
console.log("categories:", categories);

db.close();
