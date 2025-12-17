import { useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/lib/apiClient';
import type { User } from '@/types/api';

type UsersResponse = {
  success: boolean;
  data: {
    users: User[];
  };
};

export function ClientSelect({
  value,
  onChange,
  onQuickAdd
}: {
  value: User | null;
  onChange: (client: User | null) => void;
  onQuickAdd?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => search.trim(), [search]);

  useEffect(() => {
    let cancelled = false;

    if (!query) {
      setOptions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    apiClient
      .get<UsersResponse>('/users', {
        params: {
          page: 1,
          limit: 10,
          role: 'CLIENT',
          search: query
        }
      })
      .then((res) => {
        if (cancelled) return;
        setOptions(res.data.data.users);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message ?? err?.message ?? 'Failed to load clients');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <label className="block text-sm font-medium">Client</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder={value ? `${value.firstName} ${value.lastName}` : 'Search by name/email/company...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {onQuickAdd ? (
          <button
            type="button"
            className="mt-6 rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            onClick={onQuickAdd}
          >
            + Add new
          </button>
        ) : null}
      </div>

      {value ? (
        <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div>
            <div className="font-medium">
              {value.companyName ? `${value.companyName} — ` : ''}
              {value.firstName} {value.lastName}
            </div>
            <div className="text-slate-600">{value.email}</div>
          </div>
          <button
            type="button"
            className="text-sm text-slate-900 underline"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        </div>
      ) : null}

      {loading ? <div className="text-sm text-slate-600">Searching…</div> : null}
      {error ? <div className="text-sm text-red-700">{error}</div> : null}

      {options.length > 0 ? (
        <div className="rounded border border-slate-200 bg-white">
          <ul className="divide-y">
            {options.map((client) => (
              <li key={client._id} className="p-2">
                <button
                  type="button"
                  className="w-full text-left text-sm hover:underline"
                  onClick={() => {
                    onChange(client);
                    setSearch('');
                    setOptions([]);
                  }}
                >
                  <div className="font-medium">
                    {client.companyName ? `${client.companyName} — ` : ''}
                    {client.firstName} {client.lastName}
                  </div>
                  <div className="text-slate-600">{client.email}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && query && options.length === 0 && !error ? (
        <div className="text-sm text-slate-600">No clients found.</div>
      ) : null}
    </div>
  );
}
