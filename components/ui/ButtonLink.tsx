import Link from 'next/link';
import type { LinkProps } from 'next/link';
import type { PropsWithChildren } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Size = 'sm' | 'md';

const variantClassName: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800',
  secondary: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'text-slate-900 hover:bg-slate-100'
};

const sizeClassName: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm'
};

export function ButtonLink({
  href,
  children,
  className,
  variant = 'primary',
  size = 'md'
}: PropsWithChildren<{
  href: LinkProps['href'];
  className?: string;
  variant?: Variant;
  size?: Size;
}>) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded font-medium ${variantClassName[variant]} ${sizeClassName[size]} ${className ?? ''}`}
    >
      {children}
    </Link>
  );
}
