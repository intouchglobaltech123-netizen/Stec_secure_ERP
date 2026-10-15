// Step 3: Indian GST rules shared by the app and the server.
// Supply within Tamil Nadu → CGST + SGST (half the rate each); to another state → IGST (full rate).
import type { Customer, LineItem } from './stecsecure-types';

export const COMPANY_STATE_CODE = '33'; // Tamil Nadu (company GSTIN 33KDUPS8091G1ZL)

// GST state codes (first two digits of a GSTIN)
export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

// Older codes still found on some GSTINs
const LEGACY_STATE_NAMES: Record<string, string> = { '25': 'Daman and Diu', '28': 'Andhra Pradesh (old)' };

export const stateName = (code?: string) =>
  INDIAN_STATES.find((s) => s.code === code)?.name ?? (code ? LEGACY_STATE_NAMES[code] : undefined) ?? 'Unknown';

export const placeOfSupplyLabel = (code?: string) => `${stateName(code)} (${code ?? '—'})`;

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Format and check-digit validation (catches most typing mistakes)
export function isValidGstin(raw?: string): boolean {
  const gstin = (raw || '').trim().toUpperCase();
  if (!GSTIN_PATTERN.test(gstin)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

// The customer's state: from a valid GSTIN, else the state chosen on the customer, else Tamil Nadu
export function customerStateCode(customer?: Pick<Customer, 'gstin' | 'stateCode'>): string {
  if (customer?.gstin && isValidGstin(customer.gstin)) return customer.gstin.trim().slice(0, 2);
  return customer?.stateCode || COMPANY_STATE_CODE;
}

export const isInterState = (placeOfSupply: string) => placeOfSupply !== COMPANY_STATE_CODE;

const r2 = (n: number) => Number(n.toFixed(2));

// Recomputes each line's tax for intra- or inter-state supply
export function splitLineTax(item: LineItem, interState: boolean): LineItem {
  const amount = r2(item.qty * item.rate);
  const igst = interState ? r2((amount * item.gstRate) / 100) : 0;
  const half = interState ? 0 : r2((amount * item.gstRate) / 200);
  return { ...item, amount, cgst: half, sgst: half, igst, total: r2(amount + 2 * half + igst) };
}

export const splitTax = (items: LineItem[], interState: boolean) => items.map((i) => splitLineTax(i, interState));

// Totals rounded to paise first, then to the rupee with a round-off line
export function taxTotals(items: LineItem[]) {
  const sum = (pick: (i: LineItem) => number) => r2(items.reduce((acc, i) => acc + pick(i), 0));
  const totalAmount = sum((i) => i.amount);
  const totalCgst = sum((i) => i.cgst);
  const totalSgst = sum((i) => i.sgst);
  const totalIgst = sum((i) => i.igst || 0);
  const rawTotal = r2(totalAmount + totalCgst + totalSgst + totalIgst);
  const grandTotal = Math.round(rawTotal);
  return { totalAmount, totalCgst, totalSgst, totalIgst, roundOff: r2(grandTotal - rawTotal), grandTotal };
}

// HSN/SAC-wise summary printed under the line items
export function hsnSummary(items: LineItem[]) {
  const rows = new Map<string, { hsnSac: string; gstRate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const i of items) {
    const key = `${i.hsnSac || '—'}@${i.gstRate}`;
    const row = rows.get(key) ?? { hsnSac: i.hsnSac || '—', gstRate: i.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable = r2(row.taxable + i.amount);
    row.cgst = r2(row.cgst + i.cgst);
    row.sgst = r2(row.sgst + i.sgst);
    row.igst = r2(row.igst + (i.igst || 0));
    rows.set(key, row);
  }
  return [...rows.values()];
}

// Indian-style amount in words: "Rupees One Lakh Twenty Thousand Five Hundred and Fifty Paise Only"
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

function integerInWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount) + 1e-9);
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  return `Rupees ${integerInWords(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`;
}
