import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiClient } from '@/lib/apiClient';

type HealthResponse = {
  ok: boolean;
  db: {
    state: number;
    connected: boolean;
  };
  timestamp: string;
};

export default function InvoicesPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<HealthResponse>('/health')
      .then((res) => {
        if (cancelled) return;
        setHealth(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to reach backend');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <p className="text-slate-700">
          UI scaffold. Replace this page with invoice listing/creation.
        </p>
      </div>

      <div className="rounded border bg-white p-4">
        <div className="text-sm font-medium">Backend connectivity</div>
        <div className="mt-2 text-sm text-slate-700">
          {error ? (
            <span className="text-red-700">{error}</span>
          ) : health ? (
            <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs">
              {JSON.stringify(health, null, 2)}
            </pre>
          ) : (
            'Checking /health...'
          )}
        </div>
      </div>

      <Link href="/" className="text-sm text-slate-900 underline">
        Back to home
      </Link>
    </section>
  );
}
