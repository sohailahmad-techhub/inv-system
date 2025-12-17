import { ReactNode } from 'react';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  type: AlertType;
  message: string;
  onClose?: () => void;
  children?: ReactNode;
}

export function Alert({ type, message, onClose, children }: AlertProps) {
  const colors = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: '✓'
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: '✕'
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      icon: '!'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: 'ⓘ'
    }
  };

  const color = colors[type];

  return (
    <div className={`${color.bg} ${color.border} ${color.text} rounded-lg border px-4 py-3 flex items-start gap-3`}>
      <span className="flex-shrink-0">{color.icon}</span>
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
        {children && <div className="mt-2 text-sm">{children}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 text-lg leading-none hover:opacity-70 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}
