import { Badge } from '@/components/ui/Badge';
import { getInvoiceUiStatus } from '@/lib/invoiceStatus';
import type { Invoice } from '@/types/api';

export function InvoiceStatusBadge({ invoice }: { invoice: Invoice }) {
  const { label, variant } = getInvoiceUiStatus(invoice);
  return <Badge variant={variant}>{label}</Badge>;
}
