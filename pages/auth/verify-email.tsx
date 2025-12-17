import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { token } = router.query;
  const [isVerifying, setIsVerifying] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    const verifyEmail = async () => {
      try {
        // In a real implementation, call the backend to verify the email
        // For now, we'll just simulate the verification
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setIsVerified(true);
      } catch (err: any) {
        setError(err.message || 'Failed to verify email');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <>
      <Head>
        <title>Verify Email - Invoice System</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-blue-600 dark:bg-blue-500 mb-4">
              <span className="text-2xl font-bold text-white">I</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verify Email</h1>
          </div>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardBody className="space-y-4">
              {isVerifying ? (
                <div className="py-8">
                  <LoadingSpinner message="Verifying your email..." />
                </div>
              ) : isVerified ? (
                <>
                  <Alert
                    type="success"
                    message="Email verified successfully!"
                  >
                    Your email has been verified. You can now access your account.
                  </Alert>
                  <Link href="/auth/login">
                    <Button fullWidth>
                      Go to Login
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Alert
                    type="error"
                    message="Verification Failed"
                  >
                    {error || 'Unable to verify your email. The link may have expired.'}
                  </Alert>
                  <Link href="/auth/login">
                    <Button fullWidth>
                      Back to Login
                    </Button>
                  </Link>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
