// Document numbering and business-date helpers.
// Numbers are max-existing + 1 (never array length), so deleting a record can't cause a duplicate.
// Dates are always computed in India time: the server runs in UTC, and toISOString() gives the UTC
// date, which is the previous day between 00:00 and 05:30 IST.

const IST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Calendar date in India as YYYY-MM-DD
export function localDateISO(d: Date = new Date()): string {
  return IST_DATE.format(d);
}

// Indian financial year (April–March) start year, in India time
export function financialYearStart(d: Date = new Date()): number {
  const [year, month] = localDateISO(d).split('-').map(Number);
  return month >= 4 ? year : year - 1;
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

// Next number in a series, e.g. nextDocNumber('INV-2026-', invoiceNos) → 'INV-2026-004'
export function nextDocNumber(prefix: string, existing: (string | undefined)[], pad = 3): string {
  return `${prefix}${String(maxSequence(existing, prefix) + 1).padStart(pad, '0')}`;
}
