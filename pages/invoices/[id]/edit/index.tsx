import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

import { ClientSelect } from '@/components/clients/ClientSelect';
import {
  InvoiceItemsTable,
  type EditableInvoiceItem
} from '@/components/invoices/InvoiceItemsTable';
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { Button } from '@/components/ui/Button';
import { ErrorList } from '@/components/ui/ErrorList';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/apiClient';
import { formatCurrency, formatDate, toISODateInputValue } from '@/lib/format';
import {
  buildTaxBreakdown,
  calculateEditableInvoiceTotals,
  toBackendTaxRate
} from '@/lib/invoiceMath';
import type { Invoice, Payment, User } from '@/types/api';

type InvoiceResponse = {
  success: boolean;
  data: Invoice;
};

export default function EditInvoicePage() {
  const router = useRouter();
  const invoiceId = typeof router.query.id === 'string' ? router.query.id : null;

  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const [templateId, setTemplateId] = useState('classic');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('USD');

  const [client, setClient] = useState<User | null>(null);
  const [items, setItems] = useState<EditableInvoiceItem[]>([
    { description: '', quantity: 1, rate: 0, discountPercent: 0, taxPercent: 0 }
  ]);

  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const totals = useMemo(() => calculateEditableInvoiceTotals(items), [items]);
  const taxBreakdown = useMemo(() => buildTaxBreakdown(items), [items]);

  const locked = invoice?.status === 'paid';

  useEffect(() => {
    if (!invoiceId) return;

    let cancelled = false;
    setErrors([]);

    apiClient
      .get<InvoiceResponse>(`/invoices/${invoiceId}`)
      .then((res) => {
        if (cancelled) return;
        const inv = res.data.data;
        setInvoice(inv);

        setIssueDate(toISODateInputValue(new Date(inv.issueDate)));
        setDueDate(toISODateInputValue(new Date(inv.dueDate)));
        setCurrency(inv.currency);
        setNotes(inv.notes ?? '');
        setTerms(inv.paymentTerms ?? '');

        const c = typeof inv.clientId === 'string' ? null : inv.clientId;
        setClient(c);

        setItems(
          inv.items.length > 0
            ? inv.items.map((it) => ({
                description: it.description,
                quantity: it.quantity,
                rate: it.unitPrice,
                discountPercent: 0,
                taxPercent: inv.taxRate
              }))
            : [{ description: '', quantity: 1, rate: 0, discountPercent: 0, taxPercent: inv.taxRate }]
        );
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err?.response?.data?.message ?? err?.message ?? 'Failed to load invoice';
        setErrors([msg]);
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const submitPayload = useMemo(() => {
    const backendTaxRate = toBackendTaxRate(totals.subtotal, totals.taxTotal);

    return {
      items: items
        .filter((it) => it.description.trim())
        .map((it) => {
          const effectiveUnitPrice = it.rate * (1 - it.discountPercent / 100);
          return {
            description: it.description,
            quantity: it.quantity,
            unitPrice: Number.isFinite(effectiveUnitPrice) ? effectiveUnitPrice : 0
          };
        }),
      taxRate: backendTaxRate,
      currency,
      dueDate: new Date(dueDate).toISOString(),
      notes,
      paymentTerms: terms,
      templateId,
      language
    };
  }, [currency, dueDate, items, language, notes, templateId, terms, totals.subtotal, totals.taxTotal]);

  function validate() {
    const next: string[] = [];

    if (!client) next.push('Client is required');
    if (!issueDate) next.push('Issue date is required');
    if (!dueDate) next.push('Due date is required');

    if (items.filter((it) => it.description.trim()).length === 0) {
      next.push('Add at least one item');
    }

    setErrors(next);
    return next.length === 0;
  }

  async function save() {
    if (!invoiceId) return;
    if (locked) {
      setErrors(['Invoice is locked because it is paid']);
      return;
    }

    if (!validate()) return;

    setSaving(true);
    setErrors([]);

    try {
      await apiClient.put(`/invoices/${invoiceId}`, {
        ...submitPayload,
        clientId: client?._id
      });
      await router.push(`/invoices/${invoiceId}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to update invoice';
      const backendErrors: string[] =
        err?.response?.data?.errors?.map((e: any) => e.msg) ?? [];
      setErrors(backendErrors.length > 0 ? backendErrors : [msg]);
    } finally {
      setSaving(false);
    }
  }

  async function duplicateInvoice() {
    if (!invoice) return;

    const payload = {
      clientId: typeof invoice.clientId === 'string' ? invoice.clientId : invoice.clientId._id,
      items: invoice.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice
      })),
      taxRate: invoice.taxRate,
      currency: invoice.currency,
      issueDate: new Date().toISOString(),
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms
    };

    const created = await apiClient.post<{ success: boolean; data: Invoice }>(
      '/invoices',
      payload
    );

    await router.push(`/invoices/${created.data.data._id}/edit`);
  }

  async function openPdfPreview() {
    if (!invoiceId || !invoice) return;

    const res = await apiClient.get(`/invoices/${invoiceId}/pdf`, {
      responseType: 'blob'
    });

    const url = URL.createObjectURL(res.data);
    setPdfUrl(url);
    setPdfOpen(true);
  }

  const paymentHistory = (invoice?.payments ?? []).map((p) => {
    const payment = typeof p.paymentId === 'string' ? null : (p.paymentId as Payment);
    return {
      date: p.date,
      amount: p.amount,
      method: p.method ?? payment?.method ?? '—',
      reference: payment?.reference ?? '—'
    };
  });

  return (
    <>
      <Head>
        <title>{invoice ? `Edit ${invoice.invoiceNumber}` : 'Edit invoice'} - Invoice System</title>
      </Head>

      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">
              {invoice ? `Edit invoice ${invoice.invoiceNumber}` : 'Edit invoice'}
            </h1>
            {invoice ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <InvoiceStatusBadge invoice={invoice} />
                <span>Issued {formatDate(invoice.issueDate)}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={invoice ? `/invoices/${invoice._id}` : '/invoices'} className="text-sm underline">
              Back
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={openPdfPreview}
              disabled={!invoice}
            >
              Preview PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={duplicateInvoice} disabled={!invoice}>
              Duplicate
            </Button>
            <Button onClick={save} disabled={saving || !invoice || locked}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {locked ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            This invoice is locked because it is marked as paid.
          </div>
        ) : null}

        <ErrorList errors={errors} title="Cannot update invoice" />

        {invoice ? (
          <div className="space-y-6">
            <div className="rounded border bg-white p-4">
              <h2 className="text-base font-semibold">Header</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium">Number</label>
                  <input
                    disabled
                    className="mt-1 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    value={invoice.invoiceNumber}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Template</label>
                  <select
                    disabled={locked}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    <option value="classic">Classic</option>
                    <option value="modern">Modern</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium">Language</label>
                  <select
                    disabled={locked}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium">Issue date</label>
                  <input
                    disabled
                    type="date"
                    className="mt-1 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                  <div className="mt-1 text-xs text-slate-600">
                    Issue date is not editable in current backend.
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium">Due date</label>
                  <input
                    disabled={locked}
                    type="date"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Currency</label>
                  <select
                    disabled={locked}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded border bg-white p-4">
              <h2 className="text-base font-semibold">Client</h2>
              <div className="mt-4">
                <ClientSelect value={client} onChange={setClient} />
              </div>
            </div>

            <div className="rounded border bg-white p-4">
              <h2 className="text-base font-semibold">Items</h2>
              <div className="mt-4">
                <InvoiceItemsTable items={items} onChange={setItems} disabled={locked} />
              </div>
            </div>

            <div className="rounded border bg-white p-4">
              <h2 className="text-base font-semibold">Totals</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-700">Subtotal</span>
                    <span className="font-medium">{formatCurrency(totals.subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-700">Tax</span>
                    <span className="font-medium">{formatCurrency(totals.taxTotal, currency)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold">{formatCurrency(totals.total, currency)}</span>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium">Tax breakdown</div>
                  <div className="mt-2 overflow-auto rounded border">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="p-2">Tax %</th>
                          <th className="p-2">Base</th>
                          <th className="p-2">Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {taxBreakdown.map((row) => (
                          <tr key={row.taxPercent}>
                            <td className="p-2">{row.taxPercent.toFixed(2)}%</td>
                            <td className="p-2">{formatCurrency(row.base, currency)}</td>
                            <td className="p-2">{formatCurrency(row.tax, currency)}</td>
                          </tr>
                        ))}
                        {taxBreakdown.length === 0 ? (
                          <tr>
                            <td className="p-2 text-slate-600" colSpan={3}>
                              No tax applied.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded border bg-white p-4">
              <h2 className="text-base font-semibold">Notes & terms</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Notes</label>
                  <textarea
                    disabled={locked}
                    className="mt-1 h-32 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Terms</label>
                  <textarea
                    disabled={locked}
                    className="mt-1 h-32 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="rounded border bg-white p-4">
              <h2 className="text-base font-semibold">Payment history</h2>
              <div className="mt-4 overflow-auto rounded border">
                <table className="min-w-[700px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Method</th>
                      <th className="p-2">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paymentHistory.map((p, idx) => (
                      <tr key={idx}>
                        <td className="p-2">{formatDate(p.date)}</td>
                        <td className="p-2">{formatCurrency(p.amount, invoice.currency)}</td>
                        <td className="p-2">{p.method}</td>
                        <td className="p-2">{p.reference}</td>
                      </tr>
                    ))}
                    {paymentHistory.length === 0 ? (
                      <tr>
                        <td className="p-2 text-slate-600" colSpan={4}>
                          No payments recorded.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">Loading…</div>
        )}
      </section>

      <Modal
        open={pdfOpen}
        title="PDF preview"
        onClose={() => {
          setPdfOpen(false);
          if (pdfUrl) URL.revokeObjectURL(pdfUrl);
          setPdfUrl(null);
        }}
      >
        {pdfUrl ? (
          <iframe className="h-[70vh] w-full" src={pdfUrl} />
        ) : (
          <div className="text-sm text-slate-600">Loading preview…</div>
        )}
      </Modal>
    </>
  );
}
