import Head from 'next/head';
import { FormEvent, useState } from 'react';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/context/AuthContext';

interface FormErrors {
  general?: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [success, setSuccess] = useState('');
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    invoiceReminders: true,
    paymentAlerts: true,
    weeklyReports: false
  });
  const [companySettings, setCompanySettings] = useState({
    companyName: '',
    taxId: '',
    address: '',
    currency: 'USD'
  });

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleCompanySettingsChange = (key: keyof typeof companySettings, value: string) => {
    setCompanySettings((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveNotifications = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccess('');
    setErrors({});
    setIsLoading(true);

    try {
      // Call API to save notification settings
      setSuccess('Notification settings saved successfully');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save settings';
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCompanySettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccess('');
    setErrors({});
    setIsLoading(true);

    try {
      // Call API to save company settings
      setSuccess('Company settings saved successfully');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save settings';
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Settings - Invoice System</title>
      </Head>

      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Manage your account and system preferences</p>
        </div>

        {/* Notification Settings */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="dark:border-gray-700">
            <h2 className="text-lg font-semibold">Notification Settings</h2>
          </CardHeader>
          <CardBody>
            {success && <Alert type="success" message={success} />}
            {errors.general && <Alert type="error" message={errors.general} />}

            <form onSubmit={handleSaveNotifications} className="space-y-4">
              <Checkbox
                label="Email Notifications"
                checked={notifications.emailNotifications}
                onChange={() => handleNotificationChange('emailNotifications')}
              />
              <Checkbox
                label="Invoice Reminders"
                checked={notifications.invoiceReminders}
                onChange={() => handleNotificationChange('invoiceReminders')}
              />
              <Checkbox
                label="Payment Alerts"
                checked={notifications.paymentAlerts}
                onChange={() => handleNotificationChange('paymentAlerts')}
              />
              <Checkbox
                label="Weekly Reports"
                checked={notifications.weeklyReports}
                onChange={() => handleNotificationChange('weeklyReports')}
              />

              <Button type="submit" isLoading={isLoading}>
                Save Preferences
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Company Settings */}
        {(user?.role === 'admin' || user?.role === 'accountant') && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="dark:border-gray-700">
              <h2 className="text-lg font-semibold">Company Settings</h2>
            </CardHeader>
            <CardBody>
              <form onSubmit={handleSaveCompanySettings} className="space-y-4">
                <Input
                  label="Company Name"
                  placeholder="Your Company"
                  value={companySettings.companyName}
                  onChange={(e) => handleCompanySettingsChange('companyName', e.target.value)}
                  disabled={isLoading}
                />
                <Input
                  label="Tax ID / VAT Number"
                  placeholder="123456789"
                  value={companySettings.taxId}
                  onChange={(e) => handleCompanySettingsChange('taxId', e.target.value)}
                  disabled={isLoading}
                />
                <Input
                  label="Address"
                  placeholder="Your company address"
                  value={companySettings.address}
                  onChange={(e) => handleCompanySettingsChange('address', e.target.value)}
                  disabled={isLoading}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Currency
                  </label>
                  <select
                    value={companySettings.currency}
                    onChange={(e) => handleCompanySettingsChange('currency', e.target.value)}
                    disabled={isLoading}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                    <option value="CAD">CAD (Canadian Dollar)</option>
                    <option value="AUD">AUD (Australian Dollar)</option>
                  </select>
                </div>

                <Button type="submit" isLoading={isLoading}>
                  Save Company Settings
                </Button>
              </form>
            </CardBody>
          </Card>
        )}

        {/* Danger Zone */}
        <Card className="dark:bg-gray-800 dark:border-gray-700 border-red-200 dark:border-red-900">
          <CardHeader className="dark:border-gray-700 border-b border-red-200 dark:border-red-900">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              These actions cannot be undone. Please be careful.
            </p>
            <Button variant="danger">Delete Account</Button>
          </CardBody>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
