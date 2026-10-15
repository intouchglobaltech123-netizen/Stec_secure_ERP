// Phase 22: quotation lifecycle — labels and badge colours shared by every screen
import type { QuotationStatus } from './stecsecure-types';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'orange' | 'outline';

export const QUOTATION_STATUS_META: Record<QuotationStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SENT: { label: 'Sent', variant: 'default' },
  ACCEPTED: { label: 'Accepted', variant: 'orange' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  LOST: { label: 'Lost', variant: 'outline' },
  CONVERTED: { label: 'Invoiced', variant: 'success' },
};

export const quotationStatusMeta = (status?: QuotationStatus) => QUOTATION_STATUS_META[status ?? 'DRAFT'];

// Statuses a person can set by hand; "Invoiced" is set only by raising the invoice
export const MANUAL_QUOTATION_STATUSES: QuotationStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'LOST'];
