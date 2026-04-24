/** Returns today's date as YYYY-MM-DD in the local timezone. */
export function todayLocal(): string {
  return localDateStr(new Date());
}

/** Formats a Date object as YYYY-MM-DD using local (not UTC) date parts. */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Adds `days` to a YYYY-MM-DD string, returning a new YYYY-MM-DD string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00"); // parse as local midnight
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/**
 * Returns how many calendar days from `referenceDate` until `expiryDate`.
 * Negative = already past. referenceDate defaults to today.
 */
export function daysUntil(expiryDate: string, referenceDate?: string): number {
  const ref = referenceDate
    ? new Date(referenceDate + "T00:00:00")
    : new Date();
  ref.setHours(0, 0, 0, 0);
  const target = new Date(expiryDate + "T00:00:00");
  return Math.round((target.getTime() - ref.getTime()) / 86_400_000);
}
