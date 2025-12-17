import Head from 'next/head';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';

export default function ClientsPage() {
  const { user } = useAuth();

  // Only accountant and admin can view clients
  const allowedRoles = ['admin', 'accountant'];

  return (
    <ProtectedRoute requiredRoles={allowedRoles as any}>
      <Head>
        <title>Clients - Invoice System</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Clients</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage your client contacts and information
            </p>
          </div>
          <Button>Add Client</Button>
        </div>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="dark:border-gray-700">
            <h2 className="text-lg font-semibold">Client Directory</h2>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Email</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Phone</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Invoices</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No clients found. Add your first client to get started.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
