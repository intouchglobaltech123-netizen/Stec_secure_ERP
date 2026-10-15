// Document numbering and local-date helpers.
// Numbers are max-existing + 1 (never array length), so deleting a record can't cause a duplicate.

// Indian financial year (April–March) start year, in local (IST) time
export function financialYearStart(d: Date = new Date()): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

// Local calendar date as YYYY-MM-DD. toISOString() gives the UTC date, which is
// the previous day between 00:00 and 05:30 IST.
export function localDateISO(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Highest numeric suffix among values that start with `prefix` (0 if none)
export function maxSequence(values: (string | undefined)[], prefix: string): number {
  let max = 0;
  for (const v of values) {
    if (!v || !v.startsWith(prefix)) continue;
    const n = parseInt(v.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}
