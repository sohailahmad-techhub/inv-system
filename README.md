# JWT Authentication & Role-Based Access Control System with Payment Management

A complete JWT-based authentication system with role-based access control and comprehensive payment management built with Node.js, Express, MongoDB, Stripe, and PayPal.

## Features

### Authentication APIs
- ✅ **POST /auth/register** - User registration with email validation
- ✅ **POST /auth/login** - User login returning JWT token
- ✅ **POST /auth/logout** - Token blacklist on logout
- ✅ **POST /auth/refresh** - Refresh token endpoint
- ✅ **GET /auth/verify** - Verify token validity
- ✅ **POST /auth/forgot-password** - Password reset request
- ✅ **POST /auth/reset-password** - Password reset with token

### User Management APIs
- ✅ **POST /users** - Create user (Admin only)
- ✅ **GET /users** - List all users with pagination (Admin only)
- ✅ **GET /users/:id** - Get user details
- ✅ **PUT /users/:id** - Update user profile
- ✅ **DELETE /users/:id** - Delete user (Admin only)
- ✅ **PUT /users/:id/role** - Change user role (Admin only)
- ✅ **GET /users/profile** - Get own profile
- ✅ **PUT /users/profile** - Update own profile

### Invoice Management APIs
- ✅ **POST /invoices** - Create invoice (Admin/Accountant)
- ✅ **GET /invoices** - List invoices with filters
- ✅ **GET /invoices/:id** - Get invoice details
- ✅ **PUT /invoices/:id** - Update invoice (Admin/Accountant)
- ✅ **DELETE /invoices/:id** - Delete invoice (Admin)
- ✅ **GET /invoices/:id/payment-status** - Get detailed payment status
- ✅ **POST /invoices/mark-overdue** - Mark overdue invoices

### Payment Management APIs
- ✅ **POST /payments** - Record manual payment (Admin/Accountant)
- ✅ **GET /payments** - List payments with filters (Admin/Accountant)
- ✅ **GET /payments/:id** - Get payment details
- ✅ **PUT /payments/:id** - Update payment status (Admin/Accountant)
- ✅ **DELETE /payments/:id** - Delete pending payment (Admin)
- ✅ **POST /payments/:id/refund** - Issue refund (Admin/Accountant)
- ✅ **GET /payments/reconcile** - Payment reconciliation report

### Stripe Integration
- ✅ **POST /stripe/checkout** - Create Stripe payment session
- ✅ **POST /stripe/webhook** - Handle Stripe webhook events
- ✅ **GET /stripe/payment/:id** - Check Stripe payment status
- ✅ **POST /stripe/refund/:id** - Process Stripe refund

### PayPal Integration
- ✅ **POST /paypal/create-order** - Create PayPal order
- ✅ **POST /paypal/capture-order** - Capture PayPal payment
- ✅ **POST /paypal/webhook** - Handle PayPal webhook events
- ✅ **POST /paypal/refund/:id** - Process PayPal refund

## Database Schema

### User Model
```javascript
{
  email: String (unique, required),
  password: String (hashed, required),
  firstName: String (required),
  lastName: String (required),
  role: String (enum: ADMIN, ACCOUNTANT, CLIENT),
  companyName: String,
  phone: String,
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  isActive: Boolean,
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Invoice Model
```javascript
{
  invoiceNumber: String (unique, required),
  clientId: ObjectId (ref: User, required),
  issueDate: Date (required),
  dueDate: Date (required),
  items: [{
    description: String (required),
    quantity: Number (required),
    unitPrice: Number (required),
    amount: Number (required)
  }],
  subtotal: Number (required),
  tax: Number,
  taxRate: Number,
  discount: Number,
  totalAmount: Number (required),
  paidAmount: Number (default: 0),
  paymentStatus: String (enum: Unpaid, Paid, Partially Paid, Overdue),
  notes: String,
  terms: String,
  currency: String (default: USD),
  createdAt: Date,
  updatedAt: Date
}
```

### Payment Model
```javascript
{
  invoiceId: ObjectId (ref: Invoice, required),
  amount: Number (required),
  method: String (enum: Cash, BankTransfer, Card, Stripe, PayPal),
  status: String (enum: Pending, Completed, Failed, Refunded),
  date: Date (required),
  reference: String,
  transactionId: String,
  metadata: Object,
  refundId: String,
  refundedAmount: Number,
  refundedAt: Date,
  notes: String,
  processedBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### PaymentMethod Model
```javascript
{
  userId: ObjectId (ref: User, required),
  type: String (enum: Cash, BankTransfer, Card, Stripe, PayPal),
  details: {
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    cardLast4: String,
    cardBrand: String,
    cardExpMonth: Number,
    cardExpYear: Number,
    stripeCustomerId: String,
    stripePaymentMethodId: String,
    paypalEmail: String,
    paypalPayerId: String
  },
  isDefault: Boolean,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## User Roles

- **ADMIN** - Full system access, can manage all users, invoices, and payments
- **ACCOUNTANT** - Can manage invoices and payments, view accounts
- **CLIENT** - Can view their own invoices and make payments

## Security Features

- ✅ Bcrypt password hashing (12 rounds)
- ✅ JWT token expiration (15 min access, 7 day refresh)
- ✅ Rate limiting on auth endpoints (5 requests per 15 minutes)
- ✅ CORS configuration
- ✅ Helmet security headers
- ✅ Input validation with express-validator
- ✅ Role-based access control middleware
- ✅ Token refresh mechanism
- ✅ Stripe webhook signature verification
- ✅ PayPal webhook validation
- ✅ Secure transaction ID storage
- ✅ Payment reconciliation reporting

## Installation

1. **Clone the repository**
   ```bash
   cd /home/engine/project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up MongoDB**
   ```bash
   # Make sure MongoDB is running
   mongod --dbpath /path/to/your/db
   ```

5. **Seed test data**
   ```bash
   npm run seed
   ```

6. **Start the server**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## Environment Variables

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/auth_jwt_rbac_system

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_REFRESH_SECRET=your_super_secret_refresh_jwt_key_here

# JWT Expiration
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Email Configuration (for password reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=noreply@yourapp.com

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
BCRYPT_SALT_ROUNDS=12

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret

# PayPal Configuration
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox

# Application Configuration
APP_NAME=Your Company Name
```

## API Usage Examples

### Authentication

#### Register User
```bash
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "companyName": "Example Corp"
}
```

#### Login
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

Response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { /* user object without password */ },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### Refresh Token
```bash
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### User Management

#### Get All Users (Admin only)
```bash
GET /users?page=1&limit=10&search=john&role=CLIENT
Authorization: Bearer <access_token>
```

#### Get User by ID
```bash
GET /users/64a7b8c9d1e2f34567890123
Authorization: Bearer <access_token>
```

#### Update User Profile
```bash
PUT /users/64a7b8c9d1e2f34567890123
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Smith",
  "companyName": "New Company Name"
}
```

#### Change User Role (Admin only)
```bash
PUT /users/64a7b8c9d1e2f34567890123/role
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "role": "ADMIN"
}
```

## Test Accounts

After running `npm run seed`, you'll have these test accounts:

- **Admin**: admin@test.com / Admin123!
- **Accountant**: accountant@test.com / Account123!
- **Client**: client@test.com / Client123!
- **Client**: john.doe@test.com / John123!
- **Accountant**: sarah.smith@test.com / Sarah123!

## Middleware

### Authentication Middleware
```javascript
const { authenticate } = require('./middleware/auth');
```

### Authorization Middleware
```javascript
const { authorize, requireAdmin } = require('./middleware/authorize');

// Role-specific authorization
router.get('/admin-only', authenticate, requireAdmin, handler);

// Multi-role authorization
router.get('/accountant-or-admin', authenticate, authorize('ACCOUNTANT', 'ADMIN'), handler);
```

## Error Handling

The system includes comprehensive error handling:

- **Validation errors** - Returns detailed field validation messages
- **Authentication errors** - Handles expired/invalid tokens
- **Authorization errors** - Proper RBAC enforcement
- **Rate limiting** - Prevents abuse of authentication endpoints
- **Global error handler** - Catches and handles all unhandled errors

## Rate Limiting

- **Auth endpoints**: 5 requests per 15 minutes per IP
- **General API**: 100 requests per 15 minutes per IP
- **Configurable** via environment variables

## Testing

### Authentication & User Management Testing
Use the provided test accounts or create new ones to test all endpoints. The system includes:

- Input validation for all endpoints
- Proper error responses
- Role-based access control
- Token refresh mechanism
- Password security

### Payment System Testing
Run the comprehensive payment system test:

```bash
node test-payment-system.js
```

This test covers:
- ✅ Invoice creation and management
- ✅ Manual payment recording (Cash, Bank Transfer)
- ✅ Payment status tracking
- ✅ Partial payment support
- ✅ Invoice payment status updates
- ✅ Payment filtering and pagination
- ✅ Client access control
- ✅ Payment reconciliation
- ✅ Overdue invoice marking
- ✅ Refund processing
- ✅ Invoice balance recalculation

For detailed payment system documentation, see [PAYMENT_SYSTEM_README.md](./PAYMENT_SYSTEM_README.md)

## Security Considerations

- All passwords are hashed with bcrypt (12 rounds)
- JWT tokens have configurable expiration times
- Refresh tokens are stored securely in the database
- Rate limiting prevents brute force attacks
- Input validation prevents injection attacks
- CORS is properly configured
- Security headers are added via Helmet

## Development

The system is built with modern Express.js patterns and includes:

- Async/await error handling
- Comprehensive validation
- Modular middleware architecture
- Clean controller separation
- Environment-based configuration
- Professional error responses

## Production Deployment

Before deploying to production:

1. Update all environment variables
2. Use strong, unique JWT secrets
3. Configure proper CORS origins
4. Set up production MongoDB instance
5. Enable HTTPS
6. Configure proper email service for password resets
7. Set up monitoring and logging
8. Consider using a process manager like PM2
9. Configure Stripe live mode credentials
10. Configure PayPal live mode credentials
11. Set up webhook endpoints with proper SSL
12. Test webhook delivery and signature verification
13. Enable payment gateway logging and monitoring

## Payment System Features

The system includes a complete payment management solution:

### Supported Payment Methods
- **Manual Entry**: Cash, Bank Transfer, Card
- **Stripe**: Credit/Debit card processing with automatic status updates
- **PayPal**: Order creation and capture with webhook support

### Key Capabilities
- Invoice creation with line items, tax, and discounts
- Automatic payment status tracking (Unpaid, Paid, Partially Paid, Overdue)
- Partial payment support with balance tracking
- Refund processing for both manual and gateway payments
- Payment reconciliation reports
- Transaction ID storage for all payments
- Webhook handling for Stripe and PayPal
- Role-based access control for payment operations

### Payment Workflow
1. Admin/Accountant creates invoice for client
2. Client receives invoice with remaining balance
3. Payment can be made via:
   - Manual entry by admin/accountant
   - Stripe online payment
   - PayPal online payment
4. Payment automatically updates invoice status
5. Webhooks confirm online payments
6. System tracks all transactions with audit trail

For complete payment system documentation, API examples, and integration guides, see [PAYMENT_SYSTEM_README.md](./PAYMENT_SYSTEM_README.md)