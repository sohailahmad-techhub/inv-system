import Head from 'next/head';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';

export default function InvoicesPage() {
  const { user } = useAuth();

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
    <ProtectedRoute>
      <Head>
        <title>Invoices - Invoice System</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Invoices</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage all your invoices in one place
            </p>
          </div>
          {(user?.role === 'admin' || user?.role === 'accountant') && (
            <Button>Create Invoice</Button>
          )}
        </div>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="dark:border-gray-700">
            <h2 className="text-lg font-semibold">Recent Invoices</h2>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Invoice #</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Client</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td colSpan={6} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No invoices found. Create your first invoice to get started.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
