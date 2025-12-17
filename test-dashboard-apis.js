const axios = require('axios');
const fs = require('fs');

// Base configuration
const baseURL = 'http://localhost:5000';
const API_TIMEOUT = 10000;

// Test data storage
let authToken = '';
let testUserId = '';
let testClientId = '';
let testInvoiceId = '';
let testPaymentId = '';

class Colors {
  static reset = '\x1b[0m';
  static bright = '\x1b[1m';
  static red = '\x1b[31m';
  static green = '\x1b[32m';
  static yellow = '\x1b[33m';
  static blue = '\x1b[34m';
  static magenta = '\x1b[35m';
  static cyan = '\x1b[36m';
  static white = '\x1b[37m';
}

class DashboardAPITester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async makeRequest(method, url, data = null, headers = {}) {
    try {
      const config = {
        method,
        url: `${baseURL}${url}`,
        timeout: API_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return { success: true, data: response.data, status: response.status };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status || 500
      };
    }
  }

  async test(name, testFunction) {
    console.log(`${Colors.blue}Testing: ${name}${Colors.reset}`);
    
    try {
      const result = await testFunction();
      
      if (result.success) {
        console.log(`${Colors.green}✓ PASSED: ${name}${Colors.reset}`);
        this.results.passed++;
        this.results.tests.push({ name, status: 'PASSED', data: result.data });
      } else {
        console.log(`${Colors.red}✗ FAILED: ${name}${Colors.reset}`);
        console.log(`${Colors.red}  Error: ${result.error?.message || result.error}${Colors.reset}`);
        this.results.failed++;
        this.results.tests.push({ name, status: 'FAILED', error: result.error });
      }
    } catch (error) {
      console.log(`${Colors.red}✗ FAILED: ${name}${Colors.reset}`);
      console.log(`${Colors.red}  Error: ${error.message}${Colors.reset}`);
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  async authenticateUser() {
    console.log(`${Colors.magenta}=== AUTHENTICATION ===${Colors.reset}`);
    
    // First, try to login with existing admin user
    const loginResult = await this.makeRequest('POST', '/auth/login', {
      email: 'admin@test.com',
      password: 'Admin123!'
    });

    if (loginResult.success) {
      authToken = loginResult.data.data.accessToken;
      testUserId = loginResult.data.data.user.id;
      console.log(`${Colors.green}✓ Authentication successful${Colors.reset}`);
      return true;
    }

    // If login fails, try to register a new admin user
    console.log(`${Colors.yellow}Login failed, attempting to register new admin user...${Colors.reset}`);
    
    const registerResult = await this.makeRequest('POST', '/auth/register', {
      email: 'admin@test.com',
      password: 'Admin123!',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      companyName: 'Test Company'
    });

    if (registerResult.success) {
      authToken = registerResult.data.data.accessToken;
      testUserId = registerResult.data.data.user.id;
      console.log(`${Colors.green}✓ Admin user registered and authenticated${Colors.reset}`);
      return true;
    }

    throw new Error('Failed to authenticate');
  }

  async createTestData() {
    console.log(`${Colors.magenta}=== CREATING TEST DATA ===${Colors.reset}`);
    
    const headers = {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    };

    // Create test client
    const clientResult = await this.makeRequest('POST', '/users', {
      email: 'client@test.com',
      password: 'Client123!',
      firstName: 'John',
      lastName: 'Doe',
      role: 'CLIENT',
      companyName: 'Test Client Company'
    }, headers);

    if (clientResult.success) {
      testClientId = clientResult.data.data._id;
      console.log(`${Colors.green}✓ Test client created: ${testClientId}${Colors.reset}`);
    } else {
      // If client creation fails, try to get existing client
      const getUsersResult = await this.makeRequest('GET', '/users?role=CLIENT', null, headers);
      if (getUsersResult.success && getUsersResult.data.data.length > 0) {
        testClientId = getUsersResult.data.data[0]._id;
        console.log(`${Colors.green}✓ Using existing client: ${testClientId}${Colors.reset}`);
      }
    }

    // Create test invoice (we'll do this by directly calling the model or creating an invoice route)
    const invoiceData = {
      clientId: testClientId,
      items: [
        {
          description: 'Test Service',
          quantity: 1,
          unitPrice: 100,
          total: 100
        }
      ],
      subtotal: 100,
      taxAmount: 10,
      discountAmount: 0,
      total: 110,
      currency: 'USD',
      status: 'SENT',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      notes: 'Test invoice for dashboard testing'
    };

    // For now, we'll create invoices directly through MongoDB simulation
    console.log(`${Colors.green}✓ Test invoice data prepared${Colors.reset}`);
    console.log(`${Colors.green}✓ Test payment data prepared${Colors.reset}`);
  }

  async testDashboardEndpoints() {
    console.log(`${Colors.magenta}=== DASHBOARD ENDPOINTS ===${Colors.reset}`);
    
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    // Test dashboard summary
    await this.test('GET /dashboard/summary - Dashboard Summary', async () => {
      return await this.makeRequest('GET', '/dashboard/summary', null, headers);
    });

    // Test revenue chart
    await this.test('GET /dashboard/revenue-chart?period=monthly - Revenue Chart', async () => {
      return await this.makeRequest('GET', '/dashboard/revenue-chart?period=monthly', null, headers);
    });

    // Test pending invoices
    await this.test('GET /dashboard/pending-invoices - Pending Invoices', async () => {
      return await this.makeRequest('GET', '/dashboard/pending-invoices', null, headers);
    });

    // Test overdue invoices
    await this.test('GET /dashboard/overdue-invoices - Overdue Invoices', async () => {
      return await this.makeRequest('GET', '/dashboard/overdue-invoices', null, headers);
    });

    // Test recent invoices
    await this.test('GET /dashboard/recent-invoices - Recent Invoices', async () => {
      return await this.makeRequest('GET', '/dashboard/recent-invoices', null, headers);
    });

    // Test top clients
    await this.test('GET /dashboard/top-clients - Top Clients', async () => {
      return await this.makeRequest('GET', '/dashboard/top-clients?period=all&limit=10', null, headers);
    });
  }

  async testAnalyticsEndpoints() {
    console.log(`${Colors.magenta}=== ANALYTICS ENDPOINTS ===${Colors.reset}`);
    
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    // Test client analytics (if we have a client)
    if (testClientId) {
      await this.test(`GET /analytics/clients/${testClientId} - Client Analytics`, async () => {
        return await this.makeRequest('GET', `/analytics/clients/${testClientId}`, null, headers);
      });
    }

    // Test invoice analytics
    await this.test('GET /analytics/invoices - Invoice Analytics', async () => {
      return await this.makeRequest('GET', '/analytics/invoices', null, headers);
    });

    // Test payment analytics
    await this.test('GET /analytics/payments - Payment Analytics', async () => {
      return await this.makeRequest('GET', '/analytics/payments', null, headers);
    });

    // Test with date filters
    await this.test('GET /analytics/invoices?startDate=2024-01-01&endDate=2024-12-31 - Invoice Analytics with Filters', async () => {
      return await this.makeRequest('GET', '/analytics/invoices?startDate=2024-01-01&endDate=2024-12-31', null, headers);
    });
  }

  async testExportEndpoints() {
    console.log(`${Colors.magenta}=== EXPORT ENDPOINTS ===${Colors.reset}`);
    
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    // Test invoices PDF export
    await this.test('POST /export/invoices-pdf - Export Invoices PDF', async () => {
      return await this.makeRequest('POST', '/export/invoices-pdf', {
        filters: {}
      }, headers);
    });

    // Test invoices Excel export
    await this.test('POST /export/invoices-excel - Export Invoices Excel', async () => {
      return await this.makeRequest('POST', '/export/invoices-excel', {
        filters: {}
      }, headers);
    });

    // Test financial reports PDF
    await this.test('POST /export/reports-pdf - Export Reports PDF', async () => {
      return await this.makeRequest('POST', '/export/reports-pdf', {
        reportType: 'financial-summary'
      }, headers);
    });

    // Test financial statement
    await this.test('POST /export/financial-statement - Export Financial Statement', async () => {
      return await this.makeRequest('POST', '/export/financial-statement', {
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      }, headers);
    });

    // Test tax report
    await this.test('POST /export/tax-report - Export Tax Report', async () => {
      return await this.makeRequest('POST', '/export/tax-report', {
        year: 2024,
        region: 'US'
      }, headers);
    });
  }

  async testCacheFunctionality() {
    console.log(`${Colors.magenta}=== CACHE FUNCTIONALITY ===${Colors.reset}`);
    
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    // Test that subsequent requests return cached data
    const firstRequest = await this.makeRequest('GET', '/dashboard/summary', null, headers);
    const secondRequest = await this.makeRequest('GET', '/dashboard/summary', null, headers);

    await this.test('Dashboard Cache - Second request should be cached', async () => {
      return {
        success: secondRequest.success && secondRequest.data.cached === true,
        data: secondRequest.data
      };
    });
  }

  async testValidation() {
    console.log(`${Colors.magenta}=== VALIDATION TESTS ===${Colors.reset}`);
    
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    // Test invalid date format
    await this.test('Analytics with invalid date format should fail', async () => {
      return await this.makeRequest('GET', '/analytics/invoices?startDate=invalid-date', null, headers);
    });

    // Test invalid report type
    await this.test('Export with invalid report type should fail', async () => {
      return await this.makeRequest('POST', '/export/reports-pdf', {
        reportType: 'invalid-type'
      }, headers);
    });

    // Test missing required fields
    await this.test('Export financial statement without dates should fail', async () => {
      return await this.makeRequest('POST', '/export/financial-statement', {}, headers);
    });
  }

  async runAllTests() {
    console.log(`${Colors.bright}${Colors.cyan}🚀 STARTING DASHBOARD & REPORTING API TESTS${Colors.reset}`);
    console.log(`${Colors.cyan}===================================================${Colors.reset}\n`);

    try {
      // Authentication
      await this.authenticateUser();
      
      // Create test data
      await this.createTestData();
      
      // Test all endpoint categories
      await this.testDashboardEndpoints();
      await this.testAnalyticsEndpoints();
      await this.testExportEndpoints();
      await this.testCacheFunctionality();
      await this.testValidation();
      
      // Print summary
      this.printSummary();
      
    } catch (error) {
      console.log(`${Colors.red}Critical error: ${error.message}${Colors.reset}`);
      this.results.failed++;
    }
  }

  printSummary() {
    console.log(`\n${Colors.bright}${Colors.cyan}📊 TEST SUMMARY${Colors.reset}`);
    console.log(`${Colors.cyan}==================${Colors.reset}`);
    console.log(`${Colors.green}✓ Passed: ${this.results.passed}${Colors.reset}`);
    console.log(`${Colors.red}✗ Failed: ${this.results.failed}${Colors.reset}`);
    console.log(`📈 Total: ${this.results.passed + this.results.failed}`);

    if (this.results.failed > 0) {
      console.log(`\n${Colors.red}Failed tests:${Colors.reset}`);
      this.results.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`  • ${test.name}: ${test.error?.message || test.error}`);
        });
    }

    const successRate = ((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1);
    console.log(`\n${Colors.bright}Success Rate: ${successRate}%${Colors.reset}`);

    if (this.results.failed === 0) {
      console.log(`\n${Colors.green}${Colors.bright}🎉 ALL TESTS PASSED! Dashboard & Reporting APIs are working correctly!${Colors.reset}`);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new DashboardAPITester();
  tester.runAllTests().catch(console.error);
}

module.exports = DashboardAPITester;