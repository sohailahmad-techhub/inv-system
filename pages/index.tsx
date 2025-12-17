import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  if (isAuthenticated) {
    return (
      <>
        <Head>
          <title>Invoice System</title>
          <meta name="description" content="Complete invoice management system" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Welcome to Invoice System</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage your invoices, clients, and payments all in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardBody className="space-y-3">
                <h3 className="text-lg font-semibold">📄 Invoices</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Create, manage, and track your invoices easily.
                </p>
                <Link href="/invoices">
                  <Button size="sm" variant="outline">
                    View Invoices
                  </Button>
                </Link>
              </CardBody>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardBody className="space-y-3">
                <h3 className="text-lg font-semibold">💳 Payments</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Track payments and payment status.
                </p>
                <Link href="/payments">
                  <Button size="sm" variant="outline">
                    View Payments
                  </Button>
                </Link>
              </CardBody>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardBody className="space-y-3">
                <h3 className="text-lg font-semibold">👥 Clients</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Manage your client contacts and information.
                </p>
                <Link href="/clients">
                  <Button size="sm" variant="outline">
                    View Clients
                  </Button>
                </Link>
              </CardBody>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardBody className="space-y-3">
                <h3 className="text-lg font-semibold">⚙️ Settings</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Customize your preferences and company details.
                </p>
                <Link href="/settings">
                  <Button size="sm" variant="outline">
                    Go to Settings
                  </Button>
                </Link>
              </CardBody>
            </Card>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Invoice System</title>
        <meta name="description" content="Complete invoice management system" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-8">
          <div>
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-lg bg-blue-600 dark:bg-blue-500 mb-4">
              <span className="text-4xl font-bold text-white">I</span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mt-4">Invoice System</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-3 text-lg">
              Complete invoice management system with authentication and role-based access
            </p>
          </div>

          <div className="space-y-3">
            <Button
              fullWidth
              onClick={() => router.push('/auth/login')}
              size="lg"
            >
              Sign In
            </Button>
            <Button
              fullWidth
              variant="outline"
              onClick={() => router.push('/auth/register')}
              size="lg"
            >
              Create Account
            </Button>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            Features: JWT Authentication • Role-Based Access Control • Invoice Management • Payment Tracking • Dark Mode
          </p>
        </div>
      </div>
    </>
  );
}
