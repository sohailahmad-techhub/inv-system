import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorList } from '@/components/ui/ErrorList';
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/apiClient';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Invoice, User } from '@/types/api';

type InvoicesResponse = {
  success: boolean;
  data: Invoice[];
  pagination: {
    current: number;
    pages: number;
    total: number;
  };
};

type UsersResponse = {
  success: boolean;
  data: {
    users: User[];
  };
};

type StatusFilter = 'all' | 'paid' | 'unpaid' | 'overdue';

type SortKey = 'invoiceNumber' | 'total' | 'issueDate' | 'status';

function invoiceClientDisplay(client: Invoice['clientId']) {
  if (typeof client === 'string') return client;
  return client.companyName
    ? `${client.companyName}`
    : `${client.firstName} ${client.lastName}`;
}

export default function InvoicesListPage() {
  const router = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<User[]>([]);

  const [status, setStatus] = useState<StatusFilter>('all');
  const [clientId, setClientId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const [sortKey, setSortKey] = useState<SortKey>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [reloadSeq, setReloadSeq] = useState(0);

  useEffect(() => {
    if (!router.isReady) return;

    const q = router.query.clientId;
    if (typeof q === 'string') {
      setClientId(q);
    }
  }, [router.isReady, router.query.clientId]);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<UsersResponse>('/users', {
        params: {
          role: 'CLIENT',
          page: 1,
          limit: 200
        }
      })
      .then((res) => {
        if (cancelled) return;
        setClients(res.data.data.users);
      })
      .catch(() => {
        // Non-admin users may not have access; UI still works without this dropdown.
        if (cancelled) return;
        setClients([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrors([]);

    apiClient
      .get<InvoicesResponse>('/invoices', {
        params: {
          page,
          limit: pageSize,
          status: status === 'paid' ? 'paid' : status === 'overdue' ? 'overdue' : undefined,
          clientId: clientId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined
        }
      })
      .then((res) => {
        if (cancelled) return;
        setInvoices(res.data.data);
        setTotalPages(res.data.pagination.pages || 1);
        setSelectedIds([]);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to load invoices';
        setErrors([msg]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, status, clientId, dateFrom, dateTo, reloadSeq]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = status === 'unpaid'
      ? invoices.filter((inv) => {
          const isPaid = inv.status === 'paid';
          const isOverdue = inv.status === 'overdue';
          return !isPaid && !isOverdue;
        })
      : invoices;

    if (!q) return list;

    return list.filter((inv) => {
      const invNumber = inv.invoiceNumber?.toLowerCase() ?? '';
      const clientName = invoiceClientDisplay(inv.clientId).toLowerCase();
      return invNumber.includes(q) || clientName.includes(q);
    });
  }, [invoices, search, status]);

  const sortedInvoices = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1;

    return [...filteredInvoices].sort((a, b) => {
      const av = a as any;
      const bv = b as any;

      switch (sortKey) {
        case 'invoiceNumber':
          return String(av.invoiceNumber).localeCompare(String(bv.invoiceNumber)) * direction;
        case 'total':
          return ((a.total ?? 0) - (b.total ?? 0)) * direction;
        case 'issueDate':
          return (new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()) * direction;
        case 'status':
          return String(a.status).localeCompare(String(b.status)) * direction;
      }
    });
  }, [filteredInvoices, sortDir, sortKey]);

  const allChecked =
    sortedInvoices.length > 0 && selectedIds.length === sortedInvoices.length;

  async function downloadPdf(invoiceId: string, invoiceNumber: string) {
    const res = await apiClient.get(`/invoices/${invoiceId}/pdf`, {
      responseType: 'blob'
    });

    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteInvoices(ids: string[]) {
    if (ids.length === 0) return;

    const ok = window.confirm(
      `Delete ${ids.length} invoice${ids.length === 1 ? '' : 's'}? This cannot be undone.`
    );
    if (!ok) return;

    setLoading(true);
    setErrors([]);

    try {
      await Promise.all(ids.map((id) => apiClient.delete(`/invoices/${id}`)));
      setSelectedIds([]);
      setPage(1);
      setReloadSeq((s) => s + 1);
    } catch (err: any) {
      setErrors([
        err?.response?.data?.message ?? err?.message ?? 'Failed to delete invoices'
      ]);
    } finally {
      setLoading(false);
    }
  }

  function exportCsv(ids: string[]) {
    const rows = sortedInvoices.filter((inv) => ids.includes(inv._id));
    const header = ['Invoice #', 'Client', 'Total', 'Currency', 'Status', 'Issue Date', 'Due Date'];

    const csv = [header, ...rows.map((inv) => [
      inv.invoiceNumber,
      invoiceClientDisplay(inv.clientId),
      String(inv.total ?? 0),
      inv.currency,
      inv.status,
      inv.issueDate,
      inv.dueDate
    ])]
      .map((r) => r.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function duplicateInvoice(invoiceId: string) {
    setErrors([]);

    const res = await apiClient.get<{ success: boolean; data: Invoice }>(
      `/invoices/${invoiceId}`
    );
    const inv = res.data.data;

    const payload = {
      clientId: typeof inv.clientId === 'string' ? inv.clientId : inv.clientId._id,
      items: inv.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice
      })),
      taxRate: inv.taxRate,
      currency: inv.currency,
      issueDate: new Date().toISOString(),
      dueDate: inv.dueDate,
      notes: inv.notes,
      paymentTerms: inv.paymentTerms
    };

    const created = await apiClient.post<{ success: boolean; data: Invoice }>(
      '/invoices',
      payload
    );

    window.location.href = `/invoices/${created.data.data._id}/edit`;
  }

  return (
    <>
      <Head>
        <title>Invoices - Invoice System</title>
      </Head>

      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Invoices</h1>
            <p className="text-sm text-slate-700">
              Search, filter, bulk delete/export, and manage invoice actions.
            </p>
          </div>

          <ButtonLink href="/invoices/create">Create invoice</ButtonLink>
        </div>

        <ErrorList errors={errors} title="Could not load invoices" />

        <div className="space-y-3 rounded border bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Status
              </label>
              <select
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value as StatusFilter);
                }}
              >
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Client
              </label>
              <select
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={clientId}
                onChange={(e) => {
                  setPage(1);
                  setClientId(e.target.value);
                }}
              >
                <option value="">All</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.companyName ? `${c.companyName} — ` : ''}
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Date from
              </label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={dateFrom}
                onChange={(e) => {
                  setPage(1);
                  setDateFrom(e.target.value);
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Date to
              </label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={dateTo}
                onChange={(e) => {
                  setPage(1);
                  setDateTo(e.target.value);
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Search
              </label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Invoice # or client"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium">Sort:</div>
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="invoiceNumber">Number</option>
                <option value="total">Amount</option>
                <option value="issueDate">Date</option>
                <option value="status">Status</option>
              </select>
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>

              <div className="ml-2 flex items-center gap-2">
                <span className="text-sm font-medium">Page size:</span>
                <select
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1);
                    setPageSize(Number(e.target.value));
                  }}
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={selectedIds.length === 0}
                onClick={() => exportCsv(selectedIds)}
              >
                Export
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={selectedIds.length === 0}
                onClick={() => deleteInvoices(selectedIds)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-auto rounded border bg-white">
          <table className="min-w-[950px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => {
                      setSelectedIds(
                        e.target.checked ? sortedInvoices.map((inv) => inv._id) : []
                      );
                    }}
                  />
                </th>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Client</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedInvoices.map((inv) => (
                <tr key={inv._id} className="align-top">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(inv._id)}
                      onChange={(e) => {
                        setSelectedIds((prev) =>
                          e.target.checked
                            ? [...prev, inv._id]
                            : prev.filter((id) => id !== inv._id)
                        );
                      }}
                    />
                  </td>
                  <td className="p-3 font-medium">{inv.invoiceNumber}</td>
                  <td className="p-3">{invoiceClientDisplay(inv.clientId)}</td>
                  <td className="p-3">
                    {formatCurrency(inv.total ?? 0, inv.currency)}
                  </td>
                  <td className="p-3">
                    <InvoiceStatusBadge invoice={inv} />
                  </td>
                  <td className="p-3">{formatDate(inv.issueDate)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/invoices/${inv._id}`} className="underline">
                        View
                      </Link>
                      <Link href={`/invoices/${inv._id}/edit`} className="underline">
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => duplicateInvoice(inv._id)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => deleteInvoices([inv._id])}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => downloadPdf(inv._id, inv.invoiceNumber)}
                      >
                        Download PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {sortedInvoices.length === 0 ? (
                <tr>
                  <td className="p-4 text-sm text-slate-600" colSpan={7}>
                    {loading ? 'Loading…' : 'No invoices found.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </section>
    </>
  );
}
