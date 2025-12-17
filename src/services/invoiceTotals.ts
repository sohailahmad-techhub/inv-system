import { Prisma } from "@prisma/client";

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  rate: Prisma.Decimal;
  discount: Prisma.Decimal;
  taxable: boolean;
};

export type ComputedInvoiceItem = InvoiceItemInput & {
  amount: Prisma.Decimal;
};

function toDecimal(value: Prisma.Decimal | number | string) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function computeInvoiceItems(
  items: Array<{ description: string; quantity: number; rate: number; discount?: number; taxable?: boolean }>
): ComputedInvoiceItem[] {
  return items.map((item) => {
    const quantity = item.quantity;
    const rate = toDecimal(item.rate);
    const discount = toDecimal(item.discount ?? 0);
    const taxable = item.taxable ?? true;

    const gross = rate.times(quantity);
    const discountFactor = new Prisma.Decimal(1).minus(discount.dividedBy(100));
    const amount = gross.times(discountFactor);

    return {
      description: item.description,
      quantity,
      rate,
      discount,
      taxable,
      amount,
    };
  });
}

export function computeTotals(
  items: ComputedInvoiceItem[],
  taxRatePercent: Prisma.Decimal
): { subtotal: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal } {
  const subtotal = items.reduce((acc, item) => acc.plus(item.amount), new Prisma.Decimal(0));
  const taxableSubtotal = items
    .filter((i) => i.taxable)
    .reduce((acc, item) => acc.plus(item.amount), new Prisma.Decimal(0));

  const tax = taxableSubtotal.times(taxRatePercent.dividedBy(100));
  const total = subtotal.plus(tax);

  return { subtotal, tax, total };
}
