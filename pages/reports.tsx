import Head from 'next/head';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

export default function ReportsPage() {
  // Only accountant and admin can view reports
  const allowedRoles = ['admin', 'accountant'];

  return (
    <ProtectedRoute requiredRoles={allowedRoles as any}>
      <Head>
        <title>Reports - Invoice System</title>
      </Head>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Analyze your business metrics and performance
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="dark:border-gray-700">
              <h2 className="text-lg font-semibold">Revenue Trend</h2>
            </CardHeader>
            <CardBody>
              <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-400">
                Chart placeholder
              </div>
            </CardBody>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="dark:border-gray-700">
              <h2 className="text-lg font-semibold">Invoice Status</h2>
            </CardHeader>
            <CardBody>
              <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-400">
                Chart placeholder
              </div>
            </CardBody>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="dark:border-gray-700">
              <h2 className="text-lg font-semibold">Payment Overview</h2>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Paid</span>
                  <span className="font-semibold">$45,200</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Pending</span>
                  <span className="font-semibold">$8,500</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Overdue</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">$2,100</span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="dark:border-gray-700">
              <h2 className="text-lg font-semibold">Top Clients</h2>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Client {i}</span>
                    <span className="font-semibold">${i * 5000}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
