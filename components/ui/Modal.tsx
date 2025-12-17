import type { PropsWithChildren, ReactNode } from 'react';

import { Button } from '@/components/ui/Button';

export function Modal({
  open,
  title,
  onClose,
  footer,
  children
}: PropsWithChildren<{
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}>) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div className="text-base font-semibold">{title}</div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="max-h-[75vh] overflow-auto px-5 py-4">{children}</div>

        {footer ? <div className="border-t px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
