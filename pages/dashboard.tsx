import Head from 'next/head';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();

  const stats = [
    { label: 'Total Invoices', value: '24', icon: '📄' },
    { label: 'Pending Payments', value: '$5,200', icon: '💰' },
    { label: 'Clients', value: '12', icon: '👥' },
    { label: 'Reports', value: '8', icon: '📊' }
  ];

  return (
    <ProtectedRoute>
      <Head>
        <title>Dashboard - Invoice System</title>
      </Head>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {user?.name}!</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Here's your invoice management dashboard
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="dark:bg-gray-800 dark:border-gray-700">
              <CardBody className="space-y-2">
                <div className="text-3xl">{stat.icon}</div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="dark:border-gray-700">
            <h2 className="text-lg font-semibold">Recent Invoices</h2>
          </CardHeader>
          <CardBody>
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No invoices yet. Create your first invoice to get started.</p>
            </div>
          </CardBody>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="dark:border-gray-700">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="text-2xl mb-2">➕</div>
                <p className="font-medium">Create Invoice</p>
              </button>
              <button className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="text-2xl mb-2">👥</div>
                <p className="font-medium">Add Client</p>
              </button>
              <button className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="text-2xl mb-2">📊</div>
                <p className="font-medium">View Reports</p>
              </button>
            </div>
          </CardBody>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
