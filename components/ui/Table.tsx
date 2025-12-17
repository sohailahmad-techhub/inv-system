import { ReactNode } from 'react';

interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className = '' }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${className}`}>{children}</table>
    </div>
  );
}

interface TableHeadProps {
  children: ReactNode;
}

export function TableHead({ children }: TableHeadProps) {
  return <thead>{children}</thead>;
}

interface TableBodyProps {
  children: ReactNode;
}

export function TableBody({ children }: TableBodyProps) {
  return <tbody>{children}</tbody>;
}

interface TableRowProps {
  children: ReactNode;
  isHeader?: boolean;
}

export function TableRow({ children, isHeader = false }: TableRowProps) {
  const baseClass = 'border-b border-gray-200 dark:border-gray-700';
  const hoverClass = isHeader ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';
  
  return <tr className={`${baseClass} ${hoverClass}`}>{children}</tr>;
}

interface TableCellProps {
  children: ReactNode;
  isHeader?: boolean;
  align?: 'left' | 'center' | 'right';
}

export function TableCell({ children, isHeader = false, align = 'left' }: TableCellProps) {
  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right'
  };

  const cellClass = isHeader
    ? 'py-3 px-4 font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800'
    : 'py-3 px-4 text-gray-900 dark:text-gray-100';

  return <td className={`${cellClass} ${alignClass[align]}`}>{children}</td>;
}
