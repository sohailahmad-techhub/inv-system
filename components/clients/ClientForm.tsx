import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorList } from '@/components/ui/ErrorList';
import type { Address, User } from '@/types/api';

export type ClientFormValues = {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: Address;
  country: string;
  taxId: string;
  paymentCurrency: string;
  notifyEmail: boolean;
  notifySms: boolean;
  password: string;
};

function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = `${upper}${lower}${digits}`;

  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

  const raw = [pick(upper), pick(lower), pick(digits)];
  for (let i = 0; i < 9; i++) raw.push(pick(all));

  return raw.sort(() => Math.random() - 0.5).join('');
}

export function ClientForm({
  mode,
  initialUser,
  onSubmit,
  submitLabel
}: {
  mode: 'create' | 'edit';
  initialUser?: User;
  onSubmit: (values: ClientFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const [values, setValues] = useState<ClientFormValues>(() => ({
    companyName: initialUser?.companyName ?? '',
    firstName: initialUser?.firstName ?? '',
    lastName: initialUser?.lastName ?? '',
    email: initialUser?.email ?? '',
    phone: initialUser?.phone ?? '',
    address: {
      street: initialUser?.address?.street ?? '',
      city: initialUser?.address?.city ?? '',
      state: initialUser?.address?.state ?? '',
      zipCode: initialUser?.address?.zipCode ?? '',
      country: initialUser?.address?.country ?? ''
    },
    country: initialUser?.address?.country ?? '',
    taxId: '',
    paymentCurrency: initialUser?.preferences?.currency ?? 'USD',
    notifyEmail: initialUser?.preferences?.notifications?.email ?? true,
    notifySms: initialUser?.preferences?.notifications?.sms ?? false,
    password: ''
  }));

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const isCreate = mode === 'create';

  const normalizedAddress: Address = useMemo(
    () => ({
      street: values.address.street?.trim() || undefined,
      city: values.address.city?.trim() || undefined,
      state: values.address.state?.trim() || undefined,
      zipCode: values.address.zipCode?.trim() || undefined,
      country: values.country?.trim() || values.address.country?.trim() || undefined
    }),
    [values.address, values.country]
  );

  async function handleSubmit() {
    const nextErrors: string[] = [];
    if (!values.email.trim()) nextErrors.push('Email is required');
    if (!values.firstName.trim()) nextErrors.push('First name is required');
    if (!values.lastName.trim()) nextErrors.push('Last name is required');
    if (isCreate && values.password.trim().length < 6) {
      nextErrors.push('Password must be at least 6 characters');
    }

    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    setSaving(true);
    try {
      await onSubmit({
        ...values,
        address: normalizedAddress,
        country: normalizedAddress.country ?? ''
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorList errors={errors} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Business name</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.companyName}
            onChange={(e) => setValues((v) => ({ ...v, companyName: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Tax ID / Company ID</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.taxId}
            onChange={(e) => setValues((v) => ({ ...v, taxId: e.target.value }))}
          />
          <div className="mt-1 text-xs text-slate-600">
            Stored locally in UI (backend schema does not currently persist this field).
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">First name</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.firstName}
            onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Last name</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.lastName}
            onChange={(e) => setValues((v) => ({ ...v, lastName: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Phone</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Street</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.address.street ?? ''}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                address: { ...v.address, street: e.target.value }
              }))
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium">City</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.address.city ?? ''}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                address: { ...v.address, city: e.target.value }
              }))
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium">State</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.address.state ?? ''}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                address: { ...v.address, state: e.target.value }
              }))
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Zip code</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.address.zipCode ?? ''}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                address: { ...v.address, zipCode: e.target.value }
              }))
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Country</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.country}
            onChange={(e) => setValues((v) => ({ ...v, country: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Payment currency</label>
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            value={values.paymentCurrency}
            onChange={(e) => setValues((v) => ({ ...v, paymentCurrency: e.target.value }))}
          >
            {['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Payment preferences</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.notifyEmail}
            onChange={(e) => setValues((v) => ({ ...v, notifyEmail: e.target.checked }))}
          />
          Email notifications
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.notifySms}
            onChange={(e) => setValues((v) => ({ ...v, notifySms: e.target.checked }))}
          />
          SMS notifications
        </label>
      </div>

      {isCreate ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Password</label>
            <button
              type="button"
              className="text-sm text-slate-900 underline"
              onClick={() => setValues((v) => ({ ...v, password: generatePassword() }))}
            >
              Generate
            </button>
          </div>
          <input
            type="text"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={values.password}
            onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
            placeholder="Min 6 chars, include upper/lower/number"
          />
          <div className="text-xs text-slate-600">
            Backend validation requires at least one uppercase, one lowercase, and one number.
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
