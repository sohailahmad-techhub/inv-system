import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

import { ClientForm, type ClientFormValues } from '@/components/clients/ClientForm';
import { ClientSelect } from '@/components/clients/ClientSelect';
import {
  InvoiceItemsTable,
  type EditableInvoiceItem
} from '@/components/invoices/InvoiceItemsTable';
import { Button } from '@/components/ui/Button';
import { ErrorList } from '@/components/ui/ErrorList';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/apiClient';
import { formatCurrency, toISODateInputValue } from '@/lib/format';
import {
  buildTaxBreakdown,
  calculateEditableInvoiceTotals,
  toBackendTaxRate
} from '@/lib/invoiceMath';
import type { Invoice, User } from '@/types/api';

type CreateInvoiceResponse = {
  success: boolean;
  data: Invoice;
};

type CreateUserResponse = {
  success: boolean;
  data: {
    user: User;
  };
};

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function CreateInvoicePage() {
  const router = useRouter();

  const [templateId, setTemplateId] = useState('classic');
  const [issueDate, setIssueDate] = useState(() => toISODateInputValue(new Date()));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toISODateInputValue(d);
  });
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('USD');

  const [client, setClient] = useState<User | null>(null);
  const [items, setItems] = useState<EditableInvoiceItem[]>([
    { description: '', quantity: 1, rate: 0, discountPercent: 0, taxPercent: 0 }
  ]);

  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Net 30 days');

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const totals = useMemo(() => calculateEditableInvoiceTotals(items), [items]);
  const taxBreakdown = useMemo(() => buildTaxBreakdown(items), [items]);

  const submitPayload = useMemo(() => {
    const backendTaxRate = toBackendTaxRate(totals.subtotal, totals.taxTotal);

    return {
      clientId: client?._id,
      items: items.map((it) => {
        const effectiveUnitPrice = it.rate * (1 - it.discountPercent / 100);
        return {
          description: it.description,
          quantity: it.quantity,
          unitPrice: Number.isFinite(effectiveUnitPrice) ? effectiveUnitPrice : 0
        };
      }),
      taxRate: backendTaxRate,
      currency,
      issueDate: new Date(issueDate).toISOString(),
      dueDate: new Date(dueDate).toISOString(),
      notes,
      paymentTerms: terms,
      templateId,
      language,
      logo: logoDataUrl
    };
  }, [client?._id, currency, dueDate, issueDate, items, language, logoDataUrl, notes, templateId, terms, totals.subtotal, totals.taxTotal]);

  function validate() {
    const next: string[] = [];

    if (!client) next.push('Client is required');

    if (!issueDate) next.push('Issue date is required');
    if (!dueDate) next.push('Due date is required');

    const issue = new Date(issueDate);
    const due = new Date(dueDate);
    if (!Number.isNaN(issue.getTime()) && !Number.isNaN(due.getTime()) && due < issue) {
      next.push('Due date must be on or after issue date');
    }

    const nonEmptyItems = items.filter((it) => it.description.trim());
    if (nonEmptyItems.length === 0) next.push('Add at least one item');

    for (const [idx, it] of items.entries()) {
      if (!it.description.trim()) continue;
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        next.push(`Item ${idx + 1}: quantity must be > 0`);
      }
      if (!Number.isFinite(it.rate) || it.rate < 0) {
        next.push(`Item ${idx + 1}: rate must be >= 0`);
      }
      if (!Number.isFinite(it.discountPercent) || it.discountPercent < 0) {
        next.push(`Item ${idx + 1}: discount must be >= 0`);
      }
      if (!Number.isFinite(it.taxPercent) || it.taxPercent < 0) {
        next.push(`Item ${idx + 1}: tax must be >= 0`);
      }
    }

    setErrors(next);
    return next.length === 0;
  }

  async function createInvoice() {
    if (!validate()) return null;

    setSaving(true);
    setErrors([]);

    try {
      const res = await apiClient.post<CreateInvoiceResponse>('/invoices', submitPayload);
      setCreatedInvoice(res.data.data);
      setSendEmail(
        typeof res.data.data.clientId === 'string'
          ? ''
          : res.data.data.clientId.email
      );
      return res.data.data;
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to create invoice';
      const backendErrors: string[] =
        err?.response?.data?.errors?.map((e: any) => e.msg) ?? [];
      setErrors(backendErrors.length > 0 ? backendErrors : [msg]);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    const invoice = await createInvoice();
    if (!invoice) return;
    await router.push(`/invoices/${invoice._id}/edit`);
  }

  async function handleOpenPreview() {
    let invoice = createdInvoice;
    if (!invoice) {
      invoice = await createInvoice();
    }
    if (!invoice) return;

    const res = await apiClient.get(`/invoices/${invoice._id}/pdf`, {
      responseType: 'blob'
    });

    const url = URL.createObjectURL(res.data);
    setPdfPreviewUrl(url);
    setPdfPreviewOpen(true);
  }

  async function handleSend() {
    let invoice = createdInvoice;
    if (!invoice) {
      invoice = await createInvoice();
    }
    if (!invoice) return;

    setErrors([]);
    try {
      await apiClient.post(`/invoices/${invoice._id}/send`, {
        to: sendEmail,
        message: sendMessage
      });
      await router.push(`/invoices/${invoice._id}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to send invoice';
      setErrors([msg]);
    }
  }

  async function quickAddClient(values: ClientFormValues) {
    setErrors([]);

    try {
      const res = await apiClient.post<CreateUserResponse>('/users', {
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        companyName: values.companyName || undefined,
        phone: values.phone || undefined,
        address: values.address,
        role: 'CLIENT',
        preferences: {
          currency: values.paymentCurrency,
          notifications: {
            email: values.notifyEmail,
            sms: values.notifySms
          }
        }
      });

      setClient(res.data.data.user);
      setQuickAddOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to create client';
      const backendErrors: string[] =
        err?.response?.data?.errors?.map((e: any) => e.msg) ?? [];
      setErrors(backendErrors.length > 0 ? backendErrors : [msg]);
    }
  }

  return (
    <>
      <Head>
        <title>Create Invoice - Invoice System</title>
      </Head>

      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Create invoice</h1>
            <p className="text-sm text-slate-700">
              Fill out invoice details. Totals update in real-time.
            </p>
          </div>

          <Link href="/invoices" className="text-sm underline">
            Back to invoices
          </Link>
        </div>

        <ErrorList errors={errors} title="Cannot save invoice" />

        <div className="space-y-6">
          <div className="rounded border bg-white p-4">
            <h2 className="text-base font-semibold">1) Invoice header</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-sm font-medium">Number</label>
                <input
                  disabled
                  className="mt-1 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                  value={createdInvoice?.invoiceNumber ?? 'Auto-generated'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Template</label>
                <select
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
                  type="date"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Due date</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Currency</label>
                <select
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

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Brand logo</label>
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 w-full text-sm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const url = await toDataUrl(file);
                    setLogoDataUrl(url);
                  }}
                />
                {logoDataUrl ? (
                  <div className="mt-2">
                    <img
                      src={logoDataUrl}
                      alt="Logo preview"
                      className="h-10 w-auto rounded border bg-white p-1"
                    />
                  </div>
                ) : null}
              </div>
              <div className="text-xs text-slate-600">
                Template/language/logo fields are used for UI preview and included in the send payload for future backend support.
              </div>
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <h2 className="text-base font-semibold">2) Client</h2>
            <div className="mt-4">
              <ClientSelect value={client} onChange={setClient} onQuickAdd={() => setQuickAddOpen(true)} />
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <h2 className="text-base font-semibold">3) Items</h2>
            <div className="mt-4">
              <InvoiceItemsTable items={items} onChange={setItems} />
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <h2 className="text-base font-semibold">4) Totals</h2>
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
            <h2 className="text-base font-semibold">5) Notes & terms</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Notes</label>
                <textarea
                  className="mt-1 h-32 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes (supports plain text)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Terms</label>
                <textarea
                  className="mt-1 h-32 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
                <div className="mt-1 text-xs text-slate-600">
                  Saved to backend as <code>paymentTerms</code>.
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-end gap-2 sm:flex-row">
            <Button variant="secondary" onClick={handleOpenPreview} disabled={saving}>
              Preview PDF
            </Button>
            <Button variant="secondary" onClick={handleSaveDraft} disabled={saving}>
              Save as draft
            </Button>
            <Button onClick={() => setSendOpen(true)} disabled={saving}>
              Send invoice
            </Button>
          </div>
        </div>
      </section>

      <Modal
        open={quickAddOpen}
        title="Quick add new client"
        onClose={() => setQuickAddOpen(false)}
      >
        <ClientForm
          mode="create"
          onSubmit={quickAddClient}
          submitLabel="Create client"
        />
      </Modal>

      <Modal
        open={sendOpen}
        title="Send invoice"
        onClose={() => setSendOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend}>Send</Button>
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
              placeholder="client@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Custom message (optional)</label>
            <textarea
              className="mt-1 h-28 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={sendMessage}
              onChange={(e) => setSendMessage(e.target.value)}
              placeholder="Hi! Please find your invoice attached…"
            />
          </div>
          <div className="text-xs text-slate-600">
            Sending marks the invoice as "Sent" and stores the send timestamp.
          </div>
        </div>
      </Modal>

      <Modal
        open={pdfPreviewOpen}
        title="PDF preview"
        onClose={() => {
          setPdfPreviewOpen(false);
          if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl(null);
        }}
      >
        {pdfPreviewUrl ? (
          <iframe className="h-[70vh] w-full" src={pdfPreviewUrl} />
        ) : (
          <div className="text-sm text-slate-600">Loading preview…</div>
        )}
      </Modal>
    </>
  );
}
