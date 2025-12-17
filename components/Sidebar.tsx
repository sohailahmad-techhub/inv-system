import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { useAuth } from '@/context/AuthContext';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  requiredRoles?: ('admin' | 'accountant' | 'client')[];
}

const navigationItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: '📊',
    requiredRoles: ['admin', 'accountant', 'client']
  },
  {
    label: 'Invoices',
    href: '/invoices',
    icon: '📄',
    requiredRoles: ['admin', 'accountant', 'client']
  },
  {
    label: 'Clients',
    href: '/clients',
    icon: '👥',
    requiredRoles: ['admin', 'accountant']
  },
  {
    label: 'Payments',
    href: '/payments',
    icon: '💳',
    requiredRoles: ['admin', 'accountant', 'client']
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: '📈',
    requiredRoles: ['admin', 'accountant']
  },
  {
    label: 'Users',
    href: '/users',
    icon: '👨‍💼',
    requiredRoles: ['admin']
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: '⚙️',
    requiredRoles: ['admin']
  }
];

export function Sidebar() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  const visibleItems = navigationItems.filter((item) => {
    if (!user) return false;
    if (item.requiredRoles) {
      return item.requiredRoles.includes(user.role);
    }
    return true;
  });

  const isActive = (href: string) => router.pathname === href || router.pathname.startsWith(href + '/');

  return (
    <aside
      className={`${
        isOpen ? 'w-64' : 'w-20'
      } bg-gray-900 dark:bg-gray-950 text-white transition-all duration-300 flex flex-col border-r border-gray-800`}
    >
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        {isOpen && <h2 className="text-sm font-semibold">Menu</h2>}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 rounded-lg hover:bg-gray-800 transition-colors ml-auto"
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? '◀' : '▶'}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive(item.href)
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
            title={!isOpen ? item.label : undefined}
          >
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            {isOpen && <span className="text-sm font-medium truncate">{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="border-t border-gray-800 p-3">
        {isOpen && <p className="text-xs text-gray-400 px-3">© 2024 Invoice System</p>}
      </div>
    </aside>
  );
}
