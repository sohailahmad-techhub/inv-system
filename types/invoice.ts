export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  customerName: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: string;
}
