import Link from 'next/link';
import { useRouter } from 'next/router';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';

import { clearAccessToken, getAccessToken } from '@/lib/auth';

export function Layout({ children }: PropsWithChildren) {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(Boolean(getAccessToken()));

    const onStorage = () => setHasToken(Boolean(getAccessToken()));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-lg font-semibold">
            Invoice System
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/" className="hover:underline">
              Home
            </Link>
            <Link href="/invoices" className="hover:underline">
              Invoices
            </Link>
            <Link href="/clients" className="hover:underline">
              Clients
            </Link>
            <Link href="/recurring-invoices" className="hover:underline">
              Recurring
            </Link>
            {hasToken ? (
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => {
                  clearAccessToken();
                  setHasToken(false);
                  router.push('/login');
                }}
              >
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">{children}</main>
    </div>
  );
}
