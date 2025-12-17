import type { Invoice } from '@/types/api';

export type InvoiceUiStatus =
  | { label: 'Paid'; variant: 'green' }
  | { label: 'Partially Paid'; variant: 'blue' }
  | { label: 'Overdue'; variant: 'red' }
  | { label: 'Unpaid'; variant: 'orange' }
  | { label: 'Draft'; variant: 'slate' };

export function getInvoiceUiStatus(invoice: Invoice): InvoiceUiStatus {
  const dueDate = new Date(invoice.dueDate);
  const now = new Date();

  if (invoice.status === 'paid') return { label: 'Paid', variant: 'green' };

  const totalPaid = invoice.totalPaid ?? 0;
  if (totalPaid > 0) return { label: 'Partially Paid', variant: 'blue' };

  if (invoice.status === 'overdue' || (!Number.isNaN(dueDate.getTime()) && now > dueDate)) {
    return { label: 'Overdue', variant: 'red' };
  }

  if (invoice.status === 'draft') return { label: 'Draft', variant: 'slate' };

  return { label: 'Unpaid', variant: 'orange' };
}
