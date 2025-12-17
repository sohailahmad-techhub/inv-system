import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorList } from '@/components/ui/ErrorList';
import { apiClient } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/format';
import type { Invoice, User } from '@/types/api';

type UsersResponse = {
  success: boolean;
  data: {
    users: User[];
  };
};

type InvoicesResponse = {
  success: boolean;
  data: Invoice[];
};

export default function ClientsListPage() {
  const [clients, setClients] = useState<User[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrors([]);

    Promise.all([
      apiClient.get<UsersResponse>('/users', {
        params: { role: 'CLIENT', page: 1, limit: 500 }
      }),
      apiClient.get<InvoicesResponse>('/invoices', {
        params: { page: 1, limit: 500 }
      })
    ])
      .then(([usersRes, invoicesRes]) => {
        if (cancelled) return;
        setClients(usersRes.data.data.users);
        setInvoices(invoicesRes.data.data);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err?.response?.data?.message ?? err?.message ?? 'Failed to load clients';
        setErrors([msg]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const clientStats = useMemo(() => {
    const map = new Map<
      string,
      {
        totalInvoices: number;
        outstandingBalance: number;
      }
    >();

    for (const inv of invoices) {
      const id = typeof inv.clientId === 'string' ? inv.clientId : inv.clientId._id;
      const prev = map.get(id) ?? { totalInvoices: 0, outstandingBalance: 0 };
      const outstanding =
        inv.status === 'paid' ? 0 : inv.remainingBalance ?? inv.total ?? 0;

      map.set(id, {
        totalInvoices: prev.totalInvoices + 1,
        outstandingBalance: prev.outstandingBalance + outstanding
      });
    }

    return map;
  }, [invoices]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.toLowerCase();
      const company = c.companyName?.toLowerCase() ?? '';
      const email = c.email?.toLowerCase() ?? '';
      return name.includes(q) || company.includes(q) || email.includes(q);
    });
  }, [clients, search]);

  async function deleteClient(clientId: string) {
    const ok = window.confirm('Delete this client?');
    if (!ok) return;

    setErrors([]);
    try {
      await apiClient.delete(`/users/${clientId}`);
      setClients((prev) => prev.filter((c) => c._id !== clientId));
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? 'Failed to delete client';
      setErrors([msg]);
    }
  }

  return (
    <>
      <Head>
        <title>Clients - Invoice System</title>
      </Head>

      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Clients</h1>
            <p className="text-sm text-slate-700">Manage client profiles.</p>
          </div>
          <ButtonLink href="/clients/create">Add new client</ButtonLink>
        </div>

        <ErrorList errors={errors} title="Client action failed" />

        <div className="rounded border bg-white p-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Search
          </label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-auto rounded border bg-white">
          <table className="min-w-[950px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="p-3">Client</th>
                <th className="p-3">Email</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Total invoices</th>
                <th className="p-3">Outstanding balance</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredClients.map((c) => {
                const stats = clientStats.get(c._id) ?? {
                  totalInvoices: 0,
                  outstandingBalance: 0
                };

                return (
                  <tr key={c._id}>
                    <td className="p-3 font-medium">
                      {c.companyName ? `${c.companyName} — ` : ''}
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="p-3">{c.email}</td>
                    <td className="p-3">{c.phone ?? '—'}</td>
                    <td className="p-3">{stats.totalInvoices}</td>
                    <td className="p-3">
                      {formatCurrency(
                        stats.outstandingBalance,
                        c.preferences?.currency ?? 'USD'
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/clients/${c._id}/edit`} className="underline">
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => deleteClient(c._id)}
                        >
                          Delete
                        </button>
                        <Link href={`/invoices?clientId=${c._id}`} className="underline">
                          View invoices
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredClients.length === 0 ? (
                <tr>
                  <td className="p-4 text-sm text-slate-600" colSpan={6}>
                    {loading ? 'Loading…' : 'No clients found.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
