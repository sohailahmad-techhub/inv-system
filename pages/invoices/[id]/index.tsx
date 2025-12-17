import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorList } from '@/components/ui/ErrorList';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/apiClient';
import { formatCurrency, formatDate } from '@/lib/format';
import { getInvoiceUiStatus } from '@/lib/invoiceStatus';
import type { Invoice, Payment, User } from '@/types/api';

type InvoiceResponse = {
  success: boolean;
  data: Invoice;
};

export default function ViewInvoicePage() {
  const router = useRouter();
  const invoiceId = typeof router.query.id === 'string' ? router.query.id : null;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const uiStatus = invoice ? getInvoiceUiStatus(invoice) : null;

  const client = useMemo(() => {
    if (!invoice) return null;
    return typeof invoice.clientId === 'string' ? null : invoice.clientId;
  }, [invoice]);

  async function refresh() {
    if (!invoiceId) return;

    setLoading(true);
    setErrors([]);

    try {
      const res = await apiClient.get<InvoiceResponse>(`/invoices/${invoiceId}`);
      setInvoice(res.data.data);
      if (typeof res.data.data.clientId !== 'string') {
        setSendEmail(res.data.data.clientId.email);
      }

      const remaining = res.data.data.remainingBalance ?? (res.data.data.total ?? 0);
      setPaymentAmount(remaining.toFixed(2));
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to load invoice';
      setErrors([msg]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const canEdit = invoice ? invoice.status !== 'paid' : false;

  async function downloadPdf() {
    if (!invoice) return;

    const res = await apiClient.get(`/invoices/${invoice._id}/pdf`, {
      responseType: 'blob'
    });

    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openPdfPreview() {
    if (!invoice) return;

    const res = await apiClient.get(`/invoices/${invoice._id}/pdf`, {
      responseType: 'blob'
    });

    const url = URL.createObjectURL(res.data);
    setPdfUrl(url);
    setPdfOpen(true);
  }

  async function deleteInvoice() {
    if (!invoice) return;

    const ok = window.confirm('Delete this invoice? This cannot be undone.');
    if (!ok) return;

    await apiClient.delete(`/invoices/${invoice._id}`);
    await router.push('/invoices');
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

  async function sendInvoice() {
    if (!invoice) return;

    setErrors([]);
    try {
      await apiClient.post(`/invoices/${invoice._id}/send`, {
        to: sendEmail,
        message: sendMessage
      });
      setSendOpen(false);
      await refresh();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to send invoice';
      setErrors([msg]);
    }
  }

  async function recordPayment() {
    if (!invoice) return;

    setErrors([]);
    try {
      await apiClient.post<{ success: boolean; data: Payment }>('/payments', {
        invoiceId: invoice._id,
        amount: Number(paymentAmount),
        method: paymentMethod,
        reference: paymentReference || undefined,
        notes: paymentNotes || undefined,
        paymentDate: new Date().toISOString()
      });

      setPaymentOpen(false);
      setPaymentReference('');
      setPaymentNotes('');
      await refresh();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to record payment';
      setErrors([msg]);
    }
  }

  function clientName(u: User | null) {
    if (!u) return '';
    return u.companyName ? u.companyName : `${u.firstName} ${u.lastName}`;
  }

  return (
    <>
      <Head>
        <title>{invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice'} - Invoice System</title>
      </Head>

      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">
              {invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice'}
            </h1>
            {invoice ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <InvoiceStatusBadge invoice={invoice} />
                <span>Issued {formatDate(invoice.issueDate)}</span>
                <span>• Due {formatDate(invoice.dueDate)}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/invoices" className="text-sm underline">
              Back
            </Link>
            <Button variant="secondary" size="sm" onClick={openPdfPreview} disabled={!invoice}>
              Preview PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadPdf} disabled={!invoice}>
              Download PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSendOpen(true)} disabled={!invoice}>
              Send
            </Button>
            <Button variant="secondary" size="sm" onClick={duplicateInvoice} disabled={!invoice}>
              Duplicate
            </Button>
            {invoice ? (
              <ButtonLink
                href={`/invoices/${invoice._id}/edit`}
                size="sm"
                className={canEdit ? '' : 'pointer-events-none opacity-50'}
              >
                Edit
              </ButtonLink>
            ) : (
              <Button size="sm" disabled>
                Edit
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={deleteInvoice} disabled={!invoice}>
              Delete
            </Button>
          </div>
        </div>

        <ErrorList errors={errors} title="Action failed" />

        {loading && !invoice ? <div className="text-sm text-slate-600">Loading…</div> : null}

        {invoice ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded border bg-white p-4">
                <h2 className="text-base font-semibold">Invoice details</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Client
                    </div>
                    <div className="mt-1 text-sm font-medium">{clientName(client)}</div>
                    {client?.email ? (
                      <div className="text-sm text-slate-600">{client.email}</div>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Payment status
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="font-medium">{uiStatus?.label}</span>
                      {typeof invoice.remainingBalance === 'number' ? (
                        <div className="text-slate-600">
                          Remaining: {formatCurrency(invoice.remainingBalance, invoice.currency)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-auto rounded border">
                  <table className="min-w-[700px] w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="p-2">Description</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">Rate</th>
                        <th className="p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {invoice.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2">{it.description}</td>
                          <td className="p-2">{it.quantity}</td>
                          <td className="p-2">{formatCurrency(it.unitPrice, invoice.currency)}</td>
                          <td className="p-2 font-medium">{formatCurrency(it.total, invoice.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-700">Subtotal</span>
                    <span className="font-medium">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-700">Tax ({invoice.taxRate.toFixed(2)}%)</span>
                    <span className="font-medium">{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold">{formatCurrency(invoice.total, invoice.currency)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded border bg-white p-4">
                <h2 className="text-base font-semibold">Notes & terms</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Notes
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                      {invoice.notes || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Terms
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                      {invoice.paymentTerms || '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded border bg-white p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-base font-semibold">Payments</h2>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPaymentOpen(true)}
                    disabled={!invoice}
                  >
                    Record payment
                  </Button>
                </div>

                <div className="mt-4 overflow-auto rounded border">
                  <table className="min-w-[700px] w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Amount</th>
                        <th className="p-2">Method</th>
                        <th className="p-2">Reference</th>
                        <th className="p-2">Processor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(invoice.payments ?? []).map((p, idx) => {
                        const payment = typeof p.paymentId === 'string' ? null : p.paymentId;
                        return (
                          <tr key={idx}>
                            <td className="p-2">{formatDate(p.date)}</td>
                            <td className="p-2">{formatCurrency(p.amount, invoice.currency)}</td>
                            <td className="p-2">{p.method ?? payment?.method ?? '—'}</td>
                            <td className="p-2">{payment?.reference ?? '—'}</td>
                            <td className="p-2">{payment?.externalData?.processor ?? '—'}</td>
                          </tr>
                        );
                      })}
                      {(invoice.payments ?? []).length === 0 ? (
                        <tr>
                          <td className="p-3 text-slate-600" colSpan={5}>
                            No payments recorded.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded border bg-white p-4">
                <h2 className="text-base font-semibold">Client information</h2>
                {client ? (
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="font-medium">{clientName(client)}</div>
                    <div className="text-slate-700">{client.email}</div>
                    {client.phone ? (
                      <div className="text-slate-700">{client.phone}</div>
                    ) : null}
                    {client.address?.street || client.address?.city ? (
                      <div className="text-slate-700">
                        {client.address?.street}
                        {client.address?.street ? <br /> : null}
                        {client.address?.city} {client.address?.state} {client.address?.zipCode}
                        {client.address?.country ? <>, {client.address.country}</> : null}
                      </div>
                    ) : null}

                    <div className="pt-2">
                      <Link href={`/invoices?clientId=${client._id}`} className="text-sm underline">
                        View client invoices
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-slate-600">Client details unavailable.</div>
                )}
              </div>

              <div className="rounded border bg-white p-4">
                <h2 className="text-base font-semibold">Audit trail</h2>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-700">Created</span>
                    <span className="font-medium">{formatDate(invoice.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-700">Last modified</span>
                    <span className="font-medium">{formatDate(invoice.updatedAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-700">Sent</span>
                    <span className="font-medium">{formatDate(invoice.lastSent)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-700">Paid</span>
                    <span className="font-medium">{formatDate(invoice.paidDate)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <Modal
        open={sendOpen}
        title="Send invoice"
        onClose={() => setSendOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendInvoice}>
              Send
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Email to client</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Custom message (optional)</label>
            <textarea
              className="mt-1 h-28 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={sendMessage}
              onChange={(e) => setSendMessage(e.target.value)}
            />
          </div>
          <div className="text-xs text-slate-600">
            Marks the invoice as sent and stores send timestamp.
          </div>
        </div>
      </Modal>

      <Modal
        open={paymentOpen}
        title="Record payment"
        onClose={() => setPaymentOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={recordPayment}>Record</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Amount</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Method</label>
            <select
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {['CASH', 'BANK_TRANSFER', 'CARD', 'STRIPE', 'PAYPAL', 'OTHER'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Reference (optional)</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Notes (optional)</label>
            <textarea
              className="mt-1 h-24 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />
          </div>
        </div>
      </Modal>

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
