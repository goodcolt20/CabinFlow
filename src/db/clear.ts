/**
 * One-off script: wipes prep/sales/summary tables but leaves products intact.
 * Run with: npx tsx src/db/clear.ts
 */
import Database from "better-sqlite3";
import path from "path";

const db = new Database(path.join(process.cwd(), "data", "cabinflow.db"));

const counts = () => ({
  batches: (db.prepare("SELECT COUNT(*) as n FROM prep_batches").get() as { n: number }).n,
  sales: (db.prepare("SELECT COUNT(*) as n FROM sales_records").get() as { n: number }).n,
  summaries: (db.prepare("SELECT COUNT(*) as n FROM daily_summaries").get() as { n: number }).n,
  products: (db.prepare("SELECT COUNT(*) as n FROM products").get() as { n: number }).n,
});

console.log("before:", counts());
db.exec("DELETE FROM prep_batches; DELETE FROM sales_records; DELETE FROM daily_summaries;");
console.log("after: ", counts());

db.close();
