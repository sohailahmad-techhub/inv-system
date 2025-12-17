import Link from 'next/link';
import type { PropsWithChildren } from 'react';

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-semibold">
            Invoice System
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="hover:underline">
              Home
            </Link>
            <Link href="/invoices" className="hover:underline">
              Invoices
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">{children}</main>
    </div>
  );
}
