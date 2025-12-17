const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

// Test credentials
const adminCredentials = {
  email: 'admin@test.com',
  password: 'Admin123!'
};

const clientCredentials = {
  email: 'client@test.com',
  password: 'Client123!'
};

let adminToken = '';
let clientToken = '';
let testInvoiceId = '';
let testPaymentId = '';
let testClientId = '';

// Helper function to make API calls
async function apiCall(method, endpoint, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {}
    };

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

// Test 1: Login as admin and client
async function testLogin() {
  console.log('\n=== TEST 1: Login ===');
  
  const adminLogin = await apiCall('POST', '/auth/login', adminCredentials);
  if (adminLogin.success) {
    adminToken = adminLogin.data.data.accessToken;
    console.log('✓ Admin login successful');
  } else {
    console.log('✗ Admin login failed:', adminLogin.error);
    return false;
  }

  const clientLogin = await apiCall('POST', '/auth/login', clientCredentials);
  if (clientLogin.success) {
    clientToken = clientLogin.data.data.accessToken;
    testClientId = clientLogin.data.data.user._id;
    console.log('✓ Client login successful');
  } else {
    console.log('✗ Client login failed:', clientLogin.error);
    return false;
  }

  return true;
}

// Test 2: Create an invoice
async function testCreateInvoice() {
  console.log('\n=== TEST 2: Create Invoice ===');
  
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invoiceData = {
    invoiceNumber: `INV-${Date.now()}`,
    clientId: testClientId,
    dueDate: dueDate.toISOString(),
    items: [
      {
        description: 'Web Development Services',
        quantity: 40,
        unitPrice: 100,
        amount: 4000
      },
      {
        description: 'Design Services',
        quantity: 20,
        unitPrice: 80,
        amount: 1600
      }
    ],
    subtotal: 5600,
    taxRate: 10,
    tax: 560,
    discount: 160,
    totalAmount: 6000,
    notes: 'Payment due within 30 days',
    terms: 'Net 30',
    currency: 'USD'
  };

  const result = await apiCall('POST', '/invoices', invoiceData, adminToken);
  if (result.success) {
    testInvoiceId = result.data.data._id;
    console.log('✓ Invoice created successfully');
    console.log(`  Invoice Number: ${result.data.data.invoiceNumber}`);
    console.log(`  Total Amount: $${result.data.data.totalAmount}`);
    console.log(`  Payment Status: ${result.data.data.paymentStatus}`);
  } else {
    console.log('✗ Invoice creation failed:', result.error);
    return false;
  }

  return true;
}

// Test 3: Get invoices
async function testGetInvoices() {
  console.log('\n=== TEST 3: Get Invoices ===');
  
  const result = await apiCall('GET', '/invoices?page=1&limit=10', null, adminToken);
  if (result.success) {
    console.log('✓ Invoices retrieved successfully');
    console.log(`  Total invoices: ${result.data.pagination.total}`);
  } else {
    console.log('✗ Get invoices failed:', result.error);
    return false;
  }

  return true;
}

// Test 4: Record a payment (cash)
async function testRecordPayment() {
  console.log('\n=== TEST 4: Record Manual Payment ===');
  
  const paymentData = {
    invoiceId: testInvoiceId,
    amount: 3000,
    method: 'Cash',
    reference: 'CASH-001',
    notes: 'Partial payment received in cash'
  };

  const result = await apiCall('POST', '/payments', paymentData, adminToken);
  if (result.success) {
    testPaymentId = result.data.data._id;
    console.log('✓ Payment recorded successfully');
    console.log(`  Payment Amount: $${result.data.data.amount}`);
    console.log(`  Payment Method: ${result.data.data.method}`);
    console.log(`  Payment Status: ${result.data.data.status}`);
  } else {
    console.log('✗ Payment recording failed:', result.error);
    return false;
  }

  return true;
}

// Test 5: Check invoice payment status
async function testInvoicePaymentStatus() {
  console.log('\n=== TEST 5: Check Invoice Payment Status ===');
  
  const result = await apiCall('GET', `/invoices/${testInvoiceId}/payment-status`, null, adminToken);
  if (result.success) {
    const invoice = result.data.data.invoice;
    const summary = result.data.data.paymentSummary;
    console.log('✓ Invoice payment status retrieved');
    console.log(`  Total Amount: $${invoice.totalAmount}`);
    console.log(`  Paid Amount: $${invoice.paidAmount}`);
    console.log(`  Remaining Balance: $${invoice.remainingBalance}`);
    console.log(`  Payment Status: ${invoice.paymentStatus}`);
    console.log(`  Completed Payments: ${summary.completedCount}`);
    console.log(`  Total Completed: $${summary.totalCompleted}`);
  } else {
    console.log('✗ Get invoice payment status failed:', result.error);
    return false;
  }

  return true;
}

// Test 6: Record another payment (bank transfer)
async function testRecordSecondPayment() {
  console.log('\n=== TEST 6: Record Second Payment (Bank Transfer) ===');
  
  const paymentData = {
    invoiceId: testInvoiceId,
    amount: 3000,
    method: 'BankTransfer',
    reference: 'BANK-001',
    notes: 'Final payment received via bank transfer'
  };

  const result = await apiCall('POST', '/payments', paymentData, adminToken);
  if (result.success) {
    console.log('✓ Second payment recorded successfully');
    console.log(`  Payment Amount: $${result.data.data.amount}`);
    console.log(`  Payment Method: ${result.data.data.method}`);
    console.log(`  Invoice Payment Status: ${result.data.data.invoiceId.paymentStatus}`);
  } else {
    console.log('✗ Second payment recording failed:', result.error);
    return false;
  }

  return true;
}

// Test 7: Get all payments
async function testGetPayments() {
  console.log('\n=== TEST 7: Get All Payments ===');
  
  const result = await apiCall('GET', '/payments?page=1&limit=10', null, adminToken);
  if (result.success) {
    console.log('✓ Payments retrieved successfully');
    console.log(`  Total payments: ${result.data.pagination.total}`);
    result.data.data.forEach((payment, index) => {
      console.log(`  Payment ${index + 1}: $${payment.amount} - ${payment.method} - ${payment.status}`);
    });
  } else {
    console.log('✗ Get payments failed:', result.error);
    return false;
  }

  return true;
}

// Test 8: Filter payments by method
async function testFilterPayments() {
  console.log('\n=== TEST 8: Filter Payments by Method ===');
  
  const result = await apiCall('GET', '/payments?method=Cash', null, adminToken);
  if (result.success) {
    console.log('✓ Payments filtered successfully');
    console.log(`  Cash payments: ${result.data.pagination.total}`);
  } else {
    console.log('✗ Filter payments failed:', result.error);
    return false;
  }

  return true;
}

// Test 9: Get payment details
async function testGetPaymentDetails() {
  console.log('\n=== TEST 9: Get Payment Details ===');
  
  const result = await apiCall('GET', `/payments/${testPaymentId}`, null, adminToken);
  if (result.success) {
    console.log('✓ Payment details retrieved');
    console.log(`  Payment ID: ${result.data.data._id}`);
    console.log(`  Amount: $${result.data.data.amount}`);
    console.log(`  Method: ${result.data.data.method}`);
    console.log(`  Status: ${result.data.data.status}`);
  } else {
    console.log('✗ Get payment details failed:', result.error);
    return false;
  }

  return true;
}

// Test 10: Client can view their invoice
async function testClientViewInvoice() {
  console.log('\n=== TEST 10: Client View Their Invoice ===');
  
  const result = await apiCall('GET', `/invoices/${testInvoiceId}`, null, clientToken);
  if (result.success) {
    console.log('✓ Client can view their invoice');
    console.log(`  Invoice Number: ${result.data.data.invoiceNumber}`);
    console.log(`  Total Amount: $${result.data.data.totalAmount}`);
  } else {
    console.log('✗ Client view invoice failed:', result.error);
    return false;
  }

  return true;
}

// Test 11: Payment reconciliation
async function testReconciliation() {
  console.log('\n=== TEST 11: Payment Reconciliation ===');
  
  const result = await apiCall('GET', '/payments/reconcile', null, adminToken);
  if (result.success) {
    console.log('✓ Reconciliation completed');
    console.log(`  Total invoices checked: ${result.data.data.totalInvoices}`);
    console.log(`  Discrepancies found: ${result.data.data.discrepancies.length}`);
  } else {
    console.log('✗ Reconciliation failed:', result.error);
    return false;
  }

  return true;
}

// Test 12: Create an overdue invoice
async function testCreateOverdueInvoice() {
  console.log('\n=== TEST 12: Create Overdue Invoice ===');
  
  const pastDueDate = new Date();
  pastDueDate.setDate(pastDueDate.getDate() - 10);

  const invoiceData = {
    invoiceNumber: `INV-OVERDUE-${Date.now()}`,
    clientId: testClientId,
    dueDate: pastDueDate.toISOString(),
    items: [
      {
        description: 'Consulting Services',
        quantity: 10,
        unitPrice: 150,
        amount: 1500
      }
    ],
    subtotal: 1500,
    taxRate: 0,
    tax: 0,
    discount: 0,
    totalAmount: 1500,
    currency: 'USD'
  };

  const result = await apiCall('POST', '/invoices', invoiceData, adminToken);
  if (result.success) {
    console.log('✓ Overdue invoice created');
    console.log(`  Payment Status: ${result.data.data.paymentStatus}`);
  } else {
    console.log('✗ Create overdue invoice failed:', result.error);
    return false;
  }

  return true;
}

// Test 13: Mark overdue invoices
async function testMarkOverdueInvoices() {
  console.log('\n=== TEST 13: Mark Overdue Invoices ===');
  
  const result = await apiCall('POST', '/invoices/mark-overdue', null, adminToken);
  if (result.success) {
    console.log('✓ Overdue invoices marked');
    console.log(`  Invoices marked as overdue: ${result.data.data.count}`);
  } else {
    console.log('✗ Mark overdue invoices failed:', result.error);
    return false;
  }

  return true;
}

// Test 14: Refund a payment
async function testRefundPayment() {
  console.log('\n=== TEST 14: Refund Payment ===');
  
  const refundData = {
    amount: 1000,
    reason: 'Customer requested partial refund'
  };

  const result = await apiCall('POST', `/payments/${testPaymentId}/refund`, refundData, adminToken);
  if (result.success) {
    console.log('✓ Payment refunded successfully');
    console.log(`  Refunded Amount: $${result.data.data.refundedAmount}`);
    console.log(`  Payment Status: ${result.data.data.status}`);
  } else {
    console.log('✗ Refund payment failed:', result.error);
    return false;
  }

  return true;
}

// Test 15: Verify invoice updated after refund
async function testVerifyInvoiceAfterRefund() {
  console.log('\n=== TEST 15: Verify Invoice After Refund ===');
  
  const result = await apiCall('GET', `/invoices/${testInvoiceId}/payment-status`, null, adminToken);
  if (result.success) {
    const invoice = result.data.data.invoice;
    console.log('✓ Invoice verified after refund');
    console.log(`  Paid Amount: $${invoice.paidAmount}`);
    console.log(`  Remaining Balance: $${invoice.remainingBalance}`);
    console.log(`  Payment Status: ${invoice.paymentStatus}`);
  } else {
    console.log('✗ Verify invoice after refund failed:', result.error);
    return false;
  }

  return true;
}

// Run all tests
async function runTests() {
  console.log('===========================================');
  console.log('PAYMENT SYSTEM COMPREHENSIVE TEST');
  console.log('===========================================');

  const tests = [
    { name: 'Login', fn: testLogin },
    { name: 'Create Invoice', fn: testCreateInvoice },
    { name: 'Get Invoices', fn: testGetInvoices },
    { name: 'Record Payment', fn: testRecordPayment },
    { name: 'Invoice Payment Status', fn: testInvoicePaymentStatus },
    { name: 'Record Second Payment', fn: testRecordSecondPayment },
    { name: 'Get All Payments', fn: testGetPayments },
    { name: 'Filter Payments', fn: testFilterPayments },
    { name: 'Get Payment Details', fn: testGetPaymentDetails },
    { name: 'Client View Invoice', fn: testClientViewInvoice },
    { name: 'Reconciliation', fn: testReconciliation },
    { name: 'Create Overdue Invoice', fn: testCreateOverdueInvoice },
    { name: 'Mark Overdue Invoices', fn: testMarkOverdueInvoices },
    { name: 'Refund Payment', fn: testRefundPayment },
    { name: 'Verify Invoice After Refund', fn: testVerifyInvoiceAfterRefund }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await test.fn();
    if (result) {
      passed++;
    } else {
      failed++;
      console.log(`\n⚠️  Test failed: ${test.name}. Stopping tests.`);
      break;
    }
  }

  console.log('\n===========================================');
  console.log('TEST RESULTS');
  console.log('===========================================');
  console.log(`Total Tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('===========================================');

  if (failed === 0) {
    console.log('\n✓ All tests passed successfully!');
  } else {
    console.log('\n✗ Some tests failed. Please check the logs above.');
  }
}

// Start tests
runTests().catch(console.error);
