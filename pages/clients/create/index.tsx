import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { ClientForm, type ClientFormValues } from '@/components/clients/ClientForm';
import { ErrorList } from '@/components/ui/ErrorList';
import { apiClient } from '@/lib/apiClient';
import type { User } from '@/types/api';

type CreateUserResponse = {
  success: boolean;
  data: {
    user: User;
  };
};

export default function CreateClientPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSubmit(values: ClientFormValues) {
    setErrors([]);

    try {
      await apiClient.post<CreateUserResponse>('/users', {
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        companyName: values.companyName || undefined,
        phone: values.phone || undefined,
        address: values.address,
        role: 'CLIENT',
        preferences: {
          currency: values.paymentCurrency,
          notifications: {
            email: values.notifyEmail,
            sms: values.notifySms
          }
        }
      });

      await router.push('/clients');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to create client';
      const backendErrors: string[] =
        err?.response?.data?.errors?.map((e: any) => e.msg) ?? [];
      setErrors(backendErrors.length > 0 ? backendErrors : [msg]);
      throw err;
    }
  }

  return (
    <>
      <Head>
        <title>Create Client - Invoice System</title>
      </Head>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Create client</h1>
          <Link href="/clients" className="text-sm underline">
            Back
          </Link>
        </div>

        <ErrorList errors={errors} title="Cannot create client" />

        <div className="rounded border bg-white p-4">
          <ClientForm
            mode="create"
            onSubmit={handleSubmit}
            submitLabel="Create client"
          />
        </div>
      </section>
    </>
  );
}
