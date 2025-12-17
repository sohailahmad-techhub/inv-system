import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ClientSelect } from '@/components/clients/ClientSelect';
import {
  InvoiceItemsTable,
  type EditableInvoiceItem
} from '@/components/invoices/InvoiceItemsTable';
import { Button } from '@/components/ui/Button';
import { ErrorList } from '@/components/ui/ErrorList';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/apiClient';
import { formatCurrency, formatDate, toISODateInputValue } from '@/lib/format';
import { calculateEditableInvoiceTotals, toBackendTaxRate } from '@/lib/invoiceMath';
import type { Invoice, User } from '@/types/api';

type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

type RecurringTemplate = {
  id: string;
  name: string;
  client: User;
  frequency: Frequency;
  nextDate: string; // ISO
  active: boolean;
  currency: string;
  items: EditableInvoiceItem[];
  notes: string;
  terms: string;
  generatedInvoiceIds: string[];
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = 'invoiceSystem.recurringTemplates.v1';

function loadTemplates(): RecurringTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecurringTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: RecurringTemplate[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function addFrequency(date: Date, frequency: Frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

export default function RecurringInvoicesPage() {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [client, setClient] = useState<User | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextDate, setNextDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toISODateInputValue(d);
  });
  const [currency, setCurrency] = useState('USD');
  const [items, setItems] = useState<EditableInvoiceItem[]>([
    { description: '', quantity: 1, rate: 0, discountPercent: 0, taxPercent: 0 }
  ]);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Net 30 days');

  const totals = useMemo(() => calculateEditableInvoiceTotals(items), [items]);

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  function openCreate() {
    setEditingId(null);
    setName('');
    setClient(null);
    setFrequency('monthly');
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setNextDate(toISODateInputValue(d));
    setCurrency('USD');
    setItems([{ description: '', quantity: 1, rate: 0, discountPercent: 0, taxPercent: 0 }]);
    setNotes('');
    setTerms('Net 30 days');
    setModalOpen(true);
  }

  function openEdit(t: RecurringTemplate) {
    setEditingId(t.id);
    setName(t.name);
    setClient(t.client);
    setFrequency(t.frequency);
    setNextDate(toISODateInputValue(new Date(t.nextDate)));
    setCurrency(t.currency);
    setItems(t.items);
    setNotes(t.notes);
    setTerms(t.terms);
    setModalOpen(true);
  }

  function upsertTemplate(active: boolean) {
    const nextErrors: string[] = [];
    if (!name.trim()) nextErrors.push('Template name is required');
    if (!client) nextErrors.push('Client is required');
    if (items.filter((i) => i.description.trim()).length === 0) nextErrors.push('Add at least one item');

    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    const now = new Date().toISOString();

    setTemplates((prev) => {
      const next: RecurringTemplate[] = [...prev];
      const existingIndex = editingId ? next.findIndex((t) => t.id === editingId) : -1;

      const template: RecurringTemplate = {
        id:
          editingId ??
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        name: name.trim(),
        client: client!,
        frequency,
        nextDate: new Date(nextDate).toISOString(),
        active,
        currency,
        items,
        notes,
        terms,
        generatedInvoiceIds: existingIndex >= 0 ? next[existingIndex].generatedInvoiceIds : [],
        createdAt: existingIndex >= 0 ? next[existingIndex].createdAt : now,
        updatedAt: now
      };

      if (existingIndex >= 0) next[existingIndex] = template;
      else next.unshift(template);

      saveTemplates(next);
      return next;
    });

    setModalOpen(false);
  }

  async function generateNow(t: RecurringTemplate) {
    setErrors([]);
    try {
      const { subtotal, taxTotal } = calculateEditableInvoiceTotals(t.items);
      const backendTaxRate = toBackendTaxRate(subtotal, taxTotal);

      const payload = {
        clientId: t.client._id,
        items: t.items
          .filter((it) => it.description.trim())
          .map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.rate * (1 - it.discountPercent / 100)
          })),
        taxRate: backendTaxRate,
        currency: t.currency,
        issueDate: new Date().toISOString(),
        dueDate: addFrequency(new Date(), 'monthly').toISOString(),
        notes: t.notes,
        paymentTerms: t.terms
      };

      const res = await apiClient.post<{ success: boolean; data: Invoice }>('/invoices', payload);
      const created = res.data.data;

      setTemplates((prev) => {
        const next = prev.map((tpl) => {
          if (tpl.id !== t.id) return tpl;

          const nextGen = addFrequency(new Date(tpl.nextDate), tpl.frequency).toISOString();
          return {
            ...tpl,
            nextDate: nextGen,
            updatedAt: new Date().toISOString(),
            generatedInvoiceIds: [created._id, ...tpl.generatedInvoiceIds]
          };
        });

        saveTemplates(next);
        return next;
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to generate invoice';
      setErrors([msg]);
    }
  }

  function toggleTemplate(id: string) {
    setTemplates((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, active: !t.active, updatedAt: new Date().toISOString() } : t));
      saveTemplates(next);
      return next;
    });
  }

  function deleteTemplate(id: string) {
    const ok = window.confirm('Delete this recurring template?');
    if (!ok) return;

    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTemplates(next);
      return next;
    });
  }

  return (
    <>
      <Head>
        <title>Recurring invoices - Invoice System</title>
      </Head>

      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Recurring invoices</h1>
            <p className="text-sm text-slate-700">
              Create recurring templates and generate invoices on demand.
            </p>
          </div>

          <Button onClick={openCreate}>Create recurring invoice</Button>
        </div>

        <ErrorList errors={errors} title="Recurring invoice error" />

        <div className="overflow-auto rounded border bg-white">
          <table className="min-w-[950px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Client</th>
                <th className="p-3">Frequency</th>
                <th className="p-3">Next generation</th>
                <th className="p-3">Enabled</th>
                <th className="p-3">Generated</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className="p-3 font-medium">{t.name}</td>
                  <td className="p-3">
                    {t.client.companyName ? `${t.client.companyName} — ` : ''}
                    {t.client.firstName} {t.client.lastName}
                  </td>
                  <td className="p-3">{t.frequency}</td>
                  <td className="p-3">{formatDate(t.nextDate)}</td>
                  <td className="p-3">
                    <button type="button" className="underline" onClick={() => toggleTemplate(t.id)}>
                      {t.active ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="p-3">{t.generatedInvoiceIds.length}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="underline" onClick={() => openEdit(t)}>
                        Edit
                      </button>
                      <button type="button" className="underline" onClick={() => generateNow(t)} disabled={!t.active}>
                        Generate now
                      </button>
                      <button type="button" className="underline" onClick={() => deleteTemplate(t.id)}>
                        Delete
                      </button>
                    </div>
                    {t.generatedInvoiceIds.length > 0 ? (
                      <div className="mt-2 text-xs text-slate-600">
                        Latest: <Link className="underline" href={`/invoices/${t.generatedInvoiceIds[0]}`}>View invoice</Link>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}

              {templates.length === 0 ? (
                <tr>
                  <td className="p-4 text-sm text-slate-600" colSpan={7}>
                    No recurring templates yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          Note: Recurring templates are currently stored in browser localStorage. "Generate now" creates a real invoice via the backend API.
        </div>
      </section>

      <Modal
        open={modalOpen}
        title={editingId ? 'Edit recurring invoice' : 'Create recurring invoice'}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => upsertTemplate(false)}>
              Save disabled
            </Button>
            <Button onClick={() => upsertTemplate(true)}>Save enabled</Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium">Template name</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monthly retainer"
            />
          </div>

          <ClientSelect value={client} onChange={setClient} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium">Frequency</label>
              <select
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Next generation date</label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
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

          <div>
            <div className="text-sm font-medium">Items</div>
            <div className="mt-2">
              <InvoiceItemsTable items={items} onChange={setItems} />
            </div>
          </div>

          <div className="rounded border bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span>Estimated total</span>
              <span className="font-semibold">{formatCurrency(totals.total, currency)}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Notes</label>
              <textarea
                className="mt-1 h-24 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Terms</label>
              <textarea
                className="mt-1 h-24 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
