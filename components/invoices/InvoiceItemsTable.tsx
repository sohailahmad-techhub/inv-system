import { Button } from '@/components/ui/Button';

export type EditableInvoiceItem = {
  description: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxPercent: number;
};

export function InvoiceItemsTable({
  items,
  onChange,
  disabled
}: {
  items: EditableInvoiceItem[];
  onChange: (items: EditableInvoiceItem[]) => void;
  disabled?: boolean;
}) {
  function updateRow(index: number, next: Partial<EditableInvoiceItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...next } : item)));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded border bg-white">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="p-3">Description</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Rate</th>
              <th className="p-3">Discount %</th>
              <th className="p-3">Tax %</th>
              <th className="p-3">Line total</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, idx) => {
              const lineSubtotal = item.quantity * item.rate;
              const discountAmount = (lineSubtotal * item.discountPercent) / 100;
              const taxableBase = lineSubtotal - discountAmount;
              const taxAmount = (taxableBase * item.taxPercent) / 100;
              const lineTotal = taxableBase + taxAmount;

              return (
                <tr key={idx} className="align-top">
                  <td className="p-3">
                    <input
                      disabled={disabled}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                      value={item.description}
                      onChange={(e) => updateRow(idx, { description: e.target.value })}
                      placeholder="Description"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      disabled={disabled}
                      type="number"
                      className="w-24 rounded border border-slate-300 px-3 py-2"
                      min={0}
                      value={item.quantity}
                      onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      disabled={disabled}
                      type="number"
                      className="w-28 rounded border border-slate-300 px-3 py-2"
                      min={0}
                      step={0.01}
                      value={item.rate}
                      onChange={(e) => updateRow(idx, { rate: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      disabled={disabled}
                      type="number"
                      className="w-28 rounded border border-slate-300 px-3 py-2"
                      min={0}
                      step={0.01}
                      value={item.discountPercent}
                      onChange={(e) => updateRow(idx, { discountPercent: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      disabled={disabled}
                      type="number"
                      className="w-24 rounded border border-slate-300 px-3 py-2"
                      min={0}
                      step={0.01}
                      value={item.taxPercent}
                      onChange={(e) => updateRow(idx, { taxPercent: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-3 font-medium">{lineTotal.toFixed(2)}</td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disabled || items.length <= 1}
                      onClick={() => onChange(items.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...items,
              {
                description: '',
                quantity: 1,
                rate: 0,
                discountPercent: 0,
                taxPercent: 0
              }
            ])
          }
        >
          + Add item
        </Button>

        <div className="text-xs text-slate-600">
          Totals are calculated in real-time (discount applied before tax).
        </div>
      </div>
    </div>
  );
}
