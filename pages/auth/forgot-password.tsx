import Head from 'next/head';
import Link from 'next/link';
import { FormEvent, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { authService } from '@/lib/auth';

interface FormErrors {
  email?: string;
  general?: string;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [success, setSuccess] = useState('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccess('');
    setErrors({});

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      await authService.forgotPassword({ email });
      setSuccess('Check your email for password reset instructions');
      setEmail('');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to send reset email';
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Forgot Password - Invoice System</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-blue-600 dark:bg-blue-500 mb-4">
              <span className="text-2xl font-bold text-white">I</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reset Password</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Enter your email to receive reset instructions</p>
          </div>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardBody className="space-y-4">
              {errors.general && <Alert type="error" message={errors.general} />}
              {success && <Alert type="success" message={success} />}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={errors.email}
                  required
                  disabled={isLoading}
                />

                <Button type="submit" fullWidth isLoading={isLoading}>
                  Send Reset Link
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Remember your password?</span>
                </div>
              </div>

              <Link href="/auth/login">
                <Button type="button" variant="outline" fullWidth>
                  Back to Login
                </Button>
              </Link>
            </CardBody>
          </Card>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
            Didn't receive the email?{' '}
            <button
              onClick={() => {
                if (email) {
                  handleSubmit({ preventDefault: () => {} } as FormEvent<HTMLFormElement>);
                }
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Try again
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
