import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCreatedBy(
  userId: string | undefined,
  users: Array<{ id: string; name: string; role: string }>
): string {
  if (!userId) return 'Created by: Suresh Kannan (CEO)';
  const u = users.find((x) => x.id === userId);
  if (!u) return 'Created by: Management';
  return `Created by: ${u.name} (${u.role})`;
}

// Plain words for status / type codes shown to people: IN_STOCK → "In stock", FAULT_REPORTED → "Fault reported"
const HUMAN_LABELS: Record<string, string> = {
  CEO: 'CEO',
  AMC: 'AMC',
  OTHERS: 'Other',
  AWAITING_OTP: 'Awaiting sign-off',
  OTP: 'OTP',
};
export function humanize(code?: string | null): string {
  if (!code) return '';
  if (HUMAN_LABELS[code]) return HUMAN_LABELS[code];
  const words = code.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
