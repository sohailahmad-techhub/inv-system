import type { PropsWithChildren } from 'react';

type Variant = 'green' | 'orange' | 'red' | 'blue' | 'slate';

const variantClassName: Record<Variant, string> = {
  green: 'bg-green-100 text-green-800',
  orange: 'bg-orange-100 text-orange-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  slate: 'bg-slate-100 text-slate-800'
};

export function Badge({
  children,
  variant = 'slate'
}: PropsWithChildren<{ variant?: Variant }>) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${variantClassName[variant]}`}
    >
      {children}
    </span>
  );
}
