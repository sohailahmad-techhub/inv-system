import type { EditableInvoiceItem } from '@/components/invoices/InvoiceItemsTable';

export function calculateEditableInvoiceTotals(items: EditableInvoiceItem[]) {
  const lines = items.map((item) => {
    const lineSubtotal = item.quantity * item.rate;
    const discountAmount = (lineSubtotal * item.discountPercent) / 100;
    const taxableBase = lineSubtotal - discountAmount;
    const taxAmount = (taxableBase * item.taxPercent) / 100;
    const total = taxableBase + taxAmount;

    return {
      lineSubtotal,
      discountAmount,
      taxableBase,
      taxAmount,
      total,
      taxPercent: item.taxPercent
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.taxableBase, 0);
  const discountTotal = lines.reduce((sum, l) => sum + l.discountAmount, 0);
  const taxTotal = lines.reduce((sum, l) => sum + l.taxAmount, 0);
  const total = subtotal + taxTotal;

  return {
    subtotal,
    discountTotal,
    taxTotal,
    total,
    lines
  };
}

export function toBackendTaxRate(subtotal: number, taxTotal: number) {
  if (subtotal <= 0) return 0;
  return (taxTotal / subtotal) * 100;
}

export function buildTaxBreakdown(items: EditableInvoiceItem[]) {
  const breakdown = new Map<number, { base: number; tax: number }>();

  for (const item of items) {
    const lineSubtotal = item.quantity * item.rate;
    const discountAmount = (lineSubtotal * item.discountPercent) / 100;
    const taxableBase = lineSubtotal - discountAmount;
    const taxAmount = (taxableBase * item.taxPercent) / 100;

    const key = item.taxPercent;
    const prev = breakdown.get(key) ?? { base: 0, tax: 0 };
    breakdown.set(key, { base: prev.base + taxableBase, tax: prev.tax + taxAmount });
  }

  return Array.from(breakdown.entries())
    .map(([taxPercent, v]) => ({ taxPercent, base: v.base, tax: v.tax }))
    .sort((a, b) => b.taxPercent - a.taxPercent);
}
