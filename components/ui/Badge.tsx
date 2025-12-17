import { ReactNode } from 'react';

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  size?: 'sm' | 'md';
}

export function Badge({ variant = 'primary', children, size = 'md' }: BadgeProps) {
  const variants = {
    primary: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100',
    secondary: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100',
    success: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100',
    warning: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100',
    danger: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
    info: 'bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-100'
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs font-medium',
    md: 'px-3 py-1 text-sm font-medium'
  };

  return (
    <span className={`${variants[variant]} ${sizes[size]} rounded-full inline-block`}>
      {children}
    </span>
  );
}
