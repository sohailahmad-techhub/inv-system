# Payment System Documentation

## Overview

Complete payment management system with Stripe and PayPal integration for invoice payments, manual payment recording, refunds, and payment reconciliation.

## Features

### Core Payment Features
- ✅ Manual payment recording (Cash, Bank Transfer, Card)
- ✅ Stripe integration for online payments
- ✅ PayPal integration for online payments
- ✅ Automatic payment status updates
- ✅ Invoice-payment relationship tracking
- ✅ Partial payment support
- ✅ Refund handling (manual and automated)
- ✅ Payment reconciliation
- ✅ Overdue invoice tracking

### Invoice Management
- ✅ Create and manage invoices
- ✅ Track payment status (Unpaid, Paid, Partially Paid, Overdue)
- ✅ Automatic status updates based on payments
- ✅ Support for multiple currencies
- ✅ Tax and discount calculations
- ✅ Client-specific invoice access

### Payment Methods
- **Cash**: Manual entry by admin/accountant
- **Bank Transfer**: Manual entry with reference number
- **Card**: Manual entry
- **Stripe**: Automated online payment processing
- **PayPal**: Automated online payment processing

## Database Models

### Invoice Model
```javascript
{
  invoiceNumber: String (unique),
  clientId: ObjectId (ref: User),
  issueDate: Date,
  dueDate: Date,
  items: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    amount: Number
  }],
  subtotal: Number,
  tax: Number,
  taxRate: Number,
  discount: Number,
  totalAmount: Number,
  paidAmount: Number,
  paymentStatus: Enum ['Unpaid', 'Paid', 'Partially Paid', 'Overdue'],
  notes: String,
  terms: String,
  currency: String
}
```

### Payment Model
```javascript
{
  invoiceId: ObjectId (ref: Invoice),
  amount: Number,
  method: Enum ['Cash', 'BankTransfer', 'Card', 'Stripe', 'PayPal'],
  status: Enum ['Pending', 'Completed', 'Failed', 'Refunded'],
  date: Date,
  reference: String,
  transactionId: String,
  metadata: Object,
  refundId: String,
  refundedAmount: Number,
  refundedAt: Date,
  notes: String,
  processedBy: ObjectId (ref: User)
}
```

### PaymentMethod Model
```javascript
{
  userId: ObjectId (ref: User),
  type: Enum ['Cash', 'BankTransfer', 'Card', 'Stripe', 'PayPal'],
  details: {
    // Bank Transfer
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    
    // Card
    cardLast4: String,
    cardBrand: String,
    cardExpMonth: Number,
    cardExpYear: Number,
    
    // Stripe
    stripeCustomerId: String,
    stripePaymentMethodId: String,
    
    // PayPal
    paypalEmail: String,
    paypalPayerId: String
  },
  isDefault: Boolean,
  isActive: Boolean
}
```

## API Endpoints

### Invoice Endpoints

#### Create Invoice
```http
POST /invoices
Authorization: Bearer <admin_or_accountant_token>

{
  "invoiceNumber": "INV-001",
  "clientId": "user_id",
  "dueDate": "2024-12-31T00:00:00.000Z",
  "items": [
    {
      "description": "Web Development",
      "quantity": 40,
      "unitPrice": 100,
      "amount": 4000
    }
  ],
  "subtotal": 4000,
  "taxRate": 10,
  "tax": 400,
  "discount": 0,
  "totalAmount": 4400,
  "currency": "USD"
}
```

#### Get Invoices
```http
GET /invoices?page=1&limit=10&paymentStatus=Unpaid&clientId=user_id
Authorization: Bearer <token>
```

#### Get Invoice Payment Status
```http
GET /invoices/:id/payment-status
Authorization: Bearer <token>
```

#### Update Invoice
```http
PUT /invoices/:id
Authorization: Bearer <admin_or_accountant_token>

{
  "dueDate": "2024-12-31T00:00:00.000Z",
  "notes": "Updated notes"
}
```

#### Delete Invoice
```http
DELETE /invoices/:id
Authorization: Bearer <admin_token>
```

#### Mark Overdue Invoices
```http
POST /invoices/mark-overdue
Authorization: Bearer <admin_or_accountant_token>
```

### Payment Endpoints

#### Record Payment (Manual)
```http
POST /payments
Authorization: Bearer <admin_or_accountant_token>

{
  "invoiceId": "invoice_id",
  "amount": 1000,
  "method": "Cash",
  "reference": "CASH-001",
  "notes": "Payment received"
}
```

#### Get Payments
```http
GET /payments?page=1&limit=10&status=Completed&method=Cash&invoiceId=invoice_id
Authorization: Bearer <admin_or_accountant_token>
```

#### Get Payment Details
```http
GET /payments/:id
Authorization: Bearer <token>
```

#### Update Payment Status
```http
PUT /payments/:id
Authorization: Bearer <admin_or_accountant_token>

{
  "status": "Completed",
  "notes": "Updated notes"
}
```

#### Delete Pending Payment
```http
DELETE /payments/:id
Authorization: Bearer <admin_token>
```

#### Refund Payment
```http
POST /payments/:id/refund
Authorization: Bearer <admin_or_accountant_token>

{
  "amount": 500,
  "reason": "Customer request"
}
```

#### Payment Reconciliation
```http
GET /payments/reconcile
Authorization: Bearer <admin_or_accountant_token>
```

### Stripe Endpoints

#### Create Checkout Session
```http
POST /stripe/checkout
Authorization: Bearer <token>

{
  "invoiceId": "invoice_id"
}

Response:
{
  "paymentId": "payment_id",
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentIntentId": "pi_xxx",
  "amount": 1000,
  "currency": "USD"
}
```

#### Webhook Handler
```http
POST /stripe/webhook
Headers:
  stripe-signature: <signature>

Body: <raw webhook payload>
```

#### Get Payment Status
```http
GET /stripe/payment/:id
Authorization: Bearer <token>
```

#### Refund Stripe Payment
```http
POST /stripe/refund/:id
Authorization: Bearer <admin_or_accountant_token>

{
  "amount": 500,
  "reason": "requested_by_customer"
}
```

### PayPal Endpoints

#### Create PayPal Order
```http
POST /paypal/create-order
Authorization: Bearer <token>

{
  "invoiceId": "invoice_id"
}

Response:
{
  "paymentId": "payment_id",
  "orderId": "PAYPAL-ORDER-ID",
  "amount": 1000,
  "currency": "USD",
  "approvalUrl": "https://paypal.com/checkoutnow?token=xxx"
}
```

#### Capture PayPal Order
```http
POST /paypal/capture-order
Authorization: Bearer <token>

{
  "orderId": "PAYPAL-ORDER-ID"
}
```

#### Webhook Handler
```http
POST /paypal/webhook

Body: <webhook event payload>
```

#### Refund PayPal Payment
```http
POST /paypal/refund/:id
Authorization: Bearer <admin_or_accountant_token>

{
  "amount": 500,
  "reason": "Customer request"
}
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install stripe @paypal/checkout-server-sdk
```

### 2. Environment Variables
Add the following to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret

# PayPal Configuration
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox  # or 'live' for production

# Application Configuration
APP_NAME=Your Company Name
FRONTEND_URL=http://localhost:3000
```

### 3. Stripe Setup

1. **Create Stripe Account**: Sign up at https://stripe.com
2. **Get API Keys**: Dashboard → Developers → API keys
3. **Set Webhook**: 
   - Dashboard → Developers → Webhooks
   - Add endpoint: `https://yourdomain.com/stripe/webhook`
   - Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
   - Copy webhook secret

### 4. PayPal Setup

1. **Create PayPal Account**: Sign up at https://developer.paypal.com
2. **Create App**: Dashboard → My Apps & Credentials → Create App
3. **Get Credentials**: Copy Client ID and Secret
4. **Set Webhook** (optional):
   - Dashboard → Webhooks
   - Add webhook URL: `https://yourdomain.com/paypal/webhook`
   - Select events: Payment capture completed, Payment capture denied, Payment capture refunded

### 5. Test the System

```bash
# Start the server
npm run dev

# Run payment system tests
node test-payment-system.js
```

## Payment Flows

### Manual Payment Flow
1. Admin/Accountant creates invoice
2. Admin/Accountant records payment manually
3. System automatically updates invoice payment status
4. Payment appears in payment history

### Stripe Payment Flow
1. Client views invoice
2. Client initiates Stripe payment
3. Frontend uses clientSecret to show Stripe checkout
4. Client completes payment
5. Stripe webhook notifies system
6. System updates payment status to "Completed"
7. Invoice status automatically updated

### PayPal Payment Flow
1. Client views invoice
2. Client initiates PayPal payment
3. System creates PayPal order
4. Client redirected to PayPal
5. Client approves payment
6. System captures payment
7. PayPal webhook confirms payment
8. Invoice status automatically updated

### Refund Flow
1. Admin/Accountant initiates refund
2. System processes refund through payment gateway
3. Payment status updated to "Refunded"
4. Invoice paid amount adjusted
5. Invoice status recalculated

## Security Considerations

### Webhook Security
- Stripe webhooks verified using signature
- PayPal webhooks should verify sender (implement if needed)
- Use HTTPS in production

### Payment Data
- Transaction IDs stored securely
- Sensitive card data never stored (handled by Stripe)
- PayPal payment details stored with minimal information

### Access Control
- Only ADMIN and ACCOUNTANT can record/manage payments
- Clients can only view their own invoices and payments
- ADMIN required for deletions

## Testing

### Manual Testing
Use the provided test script:
```bash
node test-payment-system.js
```

### Stripe Testing
Use Stripe test cards:
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002
- More: https://stripe.com/docs/testing

### PayPal Testing
Use PayPal sandbox accounts:
- Create test accounts in PayPal Developer Dashboard
- Use sandbox credentials for testing

## Troubleshooting

### Webhook Issues
- Verify webhook secret is correct
- Check webhook signature
- Ensure endpoint is publicly accessible
- Review webhook logs in Stripe/PayPal dashboard

### Payment Not Updating
- Check webhook is configured
- Verify payment ID matches
- Review server logs for errors
- Run reconciliation to find discrepancies

### Invoice Status Issues
- Run `/invoices/mark-overdue` to update statuses
- Check due dates are set correctly
- Verify payment amounts match invoice totals

## API Response Examples

### Successful Payment Recording
```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "data": {
    "_id": "payment_id",
    "invoiceId": {
      "_id": "invoice_id",
      "invoiceNumber": "INV-001",
      "totalAmount": 5000,
      "paidAmount": 3000,
      "paymentStatus": "Partially Paid"
    },
    "amount": 3000,
    "method": "Cash",
    "status": "Completed",
    "date": "2024-01-15T10:00:00.000Z",
    "reference": "CASH-001",
    "processedBy": {
      "_id": "user_id",
      "firstName": "Admin",
      "lastName": "User"
    }
  }
}
```

### Invoice Payment Status
```json
{
  "success": true,
  "data": {
    "invoice": {
      "id": "invoice_id",
      "invoiceNumber": "INV-001",
      "totalAmount": 5000,
      "paidAmount": 3000,
      "remainingBalance": 2000,
      "paymentStatus": "Partially Paid",
      "dueDate": "2024-12-31T00:00:00.000Z"
    },
    "paymentSummary": {
      "totalCompleted": 3000,
      "totalPending": 0,
      "completedCount": 2,
      "pendingCount": 0
    },
    "payments": [...]
  }
}
```

## Best Practices

1. **Always verify webhook signatures** before processing
2. **Use idempotent operations** for payment processing
3. **Log all payment transactions** for audit trail
4. **Run reconciliation regularly** to catch discrepancies
5. **Test in sandbox/test mode** before going live
6. **Set proper webhook retry logic** for failed deliveries
7. **Monitor payment failures** and handle appropriately
8. **Keep audit logs** of all payment modifications

## Support

For issues or questions:
1. Check server logs for error details
2. Review API documentation above
3. Test with sandbox/test credentials first
4. Verify environment variables are set correctly
