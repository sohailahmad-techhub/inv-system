import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { ClientForm, type ClientFormValues } from '@/components/clients/ClientForm';
import { ErrorList } from '@/components/ui/ErrorList';
import { apiClient } from '@/lib/apiClient';
import type { User } from '@/types/api';

type UserResponse = {
  success: boolean;
  data: {
    user: User;
  };
};

export default function EditClientPage() {
  const router = useRouter();
  const clientId = typeof router.query.id === 'string' ? router.query.id : null;

  const [client, setClient] = useState<User | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;

    apiClient
      .get<UserResponse>(`/users/${clientId}`)
      .then((res) => {
        if (cancelled) return;
        setClient(res.data.data.user);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err?.response?.data?.message ?? err?.message ?? 'Failed to load client';
        setErrors([msg]);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function handleSubmit(values: ClientFormValues) {
    if (!clientId) return;

    setErrors([]);

    try {
      const res = await apiClient.put<UserResponse>(`/users/${clientId}`, {
        firstName: values.firstName,
        lastName: values.lastName,
        companyName: values.companyName || undefined,
        email: values.email, // ignored by backend update validator but kept here for future support
        phone: values.phone || undefined,
        address: values.address,
        preferences: {
          currency: values.paymentCurrency,
          notifications: {
            email: values.notifyEmail,
            sms: values.notifySms
          }
        }
      });

      setClient(res.data.data.user);
      await router.push('/clients');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to update client';
      const backendErrors: string[] =
        err?.response?.data?.errors?.map((e: any) => e.msg) ?? [];
      setErrors(backendErrors.length > 0 ? backendErrors : [msg]);
      throw err;
    }
  }

  return (
    <>
      <Head>
        <title>{client ? `Edit ${client.firstName}` : 'Edit client'} - Invoice System</title>
      </Head>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit client</h1>
          <Link href="/clients" className="text-sm underline">
            Back
          </Link>
        </div>

        <ErrorList errors={errors} title="Cannot update client" />

        <div className="rounded border bg-white p-4">
          {client ? (
            <ClientForm
              mode="edit"
              initialUser={client}
              onSubmit={handleSubmit}
              submitLabel="Save changes"
            />
          ) : (
            <div className="text-sm text-slate-600">Loading…</div>
          )}
        </div>
      </section>
    </>
  );
}
