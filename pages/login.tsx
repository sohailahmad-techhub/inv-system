import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorList } from '@/components/ui/ErrorList';
import { setAccessToken } from '@/lib/auth';
import { apiClient } from '@/lib/apiClient';

type LoginResponse = {
  success: boolean;
  message?: string;
  data: {
    accessToken: string;
    refreshToken: string;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleLogin() {
    const nextErrors: string[] = [];
    if (!email.trim()) nextErrors.push('Email is required');
    if (!password) nextErrors.push('Password is required');
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    setSubmitting(true);
    try {
      const res = await apiClient.post<LoginResponse>('/auth/login', {
        email,
        password
      });

      setAccessToken(res.data.data.accessToken);
      await router.push('/invoices');
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Failed to login';
      setErrors([message]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Login - Invoice System</title>
      </Head>

      <section className="mx-auto max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Login</h1>
          <p className="text-sm text-slate-700">
            Sign in to manage invoices and clients.
          </p>
        </div>

        <ErrorList errors={errors} title="Login failed" />

        <div className="space-y-4 rounded border bg-white p-5">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button onClick={handleLogin} disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <div className="text-xs text-slate-600">
            Tip: run <code>npm run seed</code> to create demo users, then login.
          </div>
        </div>
      </section>
    </>
  );
}
