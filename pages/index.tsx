import Head from 'next/head';
import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Invoice System</title>
        <meta name="description" content="Invoice system scaffold" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Invoice System</h1>
        <p className="text-slate-700">
          Next.js frontend + Express/MongoDB backend scaffold, ready for invoice
          features.
        </p>

        <div className="flex gap-3">
          <Link
            href="/invoices"
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
          >
            View invoices
          </Link>
          <a
            href="http://localhost:5000/health"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-300 bg-white px-4 py-2 hover:bg-slate-100"
          >
            Backend health
          </a>
        </div>
      </section>
    </>
  );
}
