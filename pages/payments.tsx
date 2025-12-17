import Head from 'next/head';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';

export default function PaymentsPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <Head>
        <title>Payments - Invoice System</title>
      </Head>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Track and manage all your payments
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardBody className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Received</p>
              <p className="text-3xl font-bold">$12,450</p>
              <p className="text-xs text-green-600 dark:text-green-400">+2.5% this month</p>
            </CardBody>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardBody className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
              <p className="text-3xl font-bold">$5,200</p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">3 unpaid invoices</p>
            </CardBody>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardBody className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
              <p className="text-3xl font-bold">95%</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Excellent</p>
            </CardBody>
          </Card>
        </div>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="dark:border-gray-700">
            <h2 className="text-lg font-semibold">Payment History</h2>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Invoice</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td colSpan={4} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No payments found.
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
