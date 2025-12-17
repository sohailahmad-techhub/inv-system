# JWT Authentication & Role-Based Access Control System
## with Dashboard & Reporting APIs

A complete JWT-based authentication system with role-based access control, comprehensive analytics, and reporting APIs built with Node.js, Express, and MongoDB.

## Features

### 🔐 Authentication APIs
- ✅ **POST /auth/register** - User registration with email validation
- ✅ **POST /auth/login** - User login returning JWT token
- ✅ **POST /auth/logout** - Token blacklist on logout
- ✅ **POST /auth/refresh** - Refresh token endpoint
- ✅ **GET /auth/verify** - Verify token validity
- ✅ **POST /auth/forgot-password** - Password reset request
- ✅ **POST /auth/reset-password** - Password reset with token

### 👥 User Management APIs
- ✅ **POST /users** - Create user (Admin only)
- ✅ **GET /users** - List all users with pagination (Admin only)
- ✅ **GET /users/:id** - Get user details
- ✅ **PUT /users/:id** - Update user profile
- ✅ **DELETE /users/:id** - Delete user (Admin only)
- ✅ **PUT /users/:id/role** - Change user role (Admin only)
- ✅ **GET /users/profile** - Get own profile
- ✅ **PUT /users/profile** - Update own profile

### 📊 Dashboard & Analytics APIs

#### Dashboard Metrics APIs
- ✅ **GET /dashboard/summary** - Total revenue (month/year/all-time), pending payments, overdue invoices, total clients, average invoice value
- ✅ **GET /dashboard/revenue-chart** - Monthly/yearly revenue graph data with configurable period
- ✅ **GET /dashboard/pending-invoices** - List pending invoices with pagination
- ✅ **GET /dashboard/overdue-invoices** - List overdue invoices with pagination
- ✅ **GET /dashboard/recent-invoices** - Latest 10 invoices
- ✅ **GET /dashboard/top-clients** - Top clients by revenue (all-time, monthly, yearly)

#### Client Analytics APIs
- ✅ **GET /analytics/clients/:id** - Comprehensive client analytics:
  - Total invoices count and revenue
  - Average invoice value and payment time
  - Payment history (last 12 months)
  - Outstanding balance and status breakdown
  - Date range filtering support

#### Invoice Analytics APIs
- ✅ **GET /analytics/invoices** - Invoice analytics with:
  - Total invoices by status (paid, unpaid, overdue)
  - Monthly invoice trends
  - Invoice value distribution ranges
  - Average payment time analysis
  - Overdue payment rates

#### Payment Analytics APIs
- ✅ **GET /analytics/payments** - Payment analytics including:
  - Total payments and amount breakdown
  - Payment method distribution and success rates
  - Processing time analysis
  - Monthly payment trends
  - Fee and net amount calculations

### 📄 Export & Reporting APIs
- ✅ **POST /export/invoices-pdf** - Export invoices list as PDF with filters
- ✅ **POST /export/invoices-excel** - Export invoices to Excel/CSV with filters
- ✅ **POST /export/reports-pdf** - Export financial summary and client analysis reports as PDF
- ✅ **POST /export/financial-statement** - Generate detailed financial statements (revenue, expenses, profit)
- ✅ **POST /export/tax-report** - Generate tax reports by year and region

### ⚡ Performance Features
- ✅ **Intelligent Caching** - Dashboard data cached for 2-15 minutes based on data volatility
- ✅ **MongoDB Indexing** - Optimized indexes for frequently queried fields
- ✅ **Aggregation Pipelines** - Efficient MongoDB aggregation for complex analytics
- ✅ **Pagination** - All list endpoints support pagination for better performance

### 🗄️ Data Models

#### Invoice Model
```javascript
{
  invoiceNumber: String (unique, auto-generated),
  clientId: ObjectId (ref: User),
  createdBy: ObjectId (ref: User),
  items: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number
  }],
  subtotal: Number,
  taxAmount: Number,
  discountAmount: Number,
  total: Number,
  currency: String,
  status: Enum ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'),
  issueDate: Date,
  dueDate: Date,
  paidDate: Date,
  notes: String,
  isDeleted: Boolean
}
```

#### Payment Model
```javascript
{
  paymentNumber: String (unique, auto-generated),
  invoiceId: ObjectId (ref: Invoice),
  clientId: ObjectId (ref: User),
  amount: Number,
  currency: String,
  paymentMethod: Enum ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'CHECK', 'PAYPAL', 'STRIPE', 'OTHER'),
  status: Enum ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'),
  transactionId: String,
  paymentDate: Date,
  processedDate: Date,
  fees: Number,
  netAmount: Number,
  isDeleted: Boolean
}
```

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

### 🔐 Authentication

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

### 👥 User Management

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

### 📊 Dashboard & Analytics

#### Dashboard Summary
```bash
GET /dashboard/summary
Authorization: Bearer <access_token>
```

Response:
```json
{
  "success": true,
  "data": {
    "revenue": {
      "thisMonth": 15420.50,
      "thisYear": 185430.75,
      "allTime": 542150.25
    },
    "pendingPayments": {
      "amount": 8750.00,
      "count": 12
    },
    "overdueInvoices": {
      "count": 3,
      "amount": 2450.00
    },
    "totalClients": 47,
    "averageInvoiceValue": 315.75
  }
}
```

#### Revenue Chart Data
```bash
GET /dashboard/revenue-chart?period=monthly&year=2024
Authorization: Bearer <access_token>
```

#### Client Analytics
```bash
GET /analytics/clients/64a7b8c9d1e2f34567890123?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <access_token>
```

Response:
```json
{
  "success": true,
  "data": {
    "client": {
      "id": "64a7b8c9d1e2f34567890123",
      "name": "John Doe",
      "email": "john@example.com",
      "companyName": "Acme Corp"
    },
    "metrics": {
      "totalInvoices": 24,
      "totalRevenue": 15680.50,
      "averageInvoiceValue": 653.35,
      "outstandingBalance": 1850.00,
      "averagePaymentTime": 8.5
    },
    "paymentHistory": [
      {
        "period": "2024-12",
        "amount": 2450.00,
        "count": 3
      }
    ],
    "invoiceStatus": [
      {
        "status": "PAID",
        "count": 20,
        "totalValue": 13060.50
      }
    ]
  }
}
```

#### Invoice Analytics with Filters
```bash
GET /analytics/invoices?startDate=2024-01-01&endDate=2024-12-31&status=PAID
Authorization: Bearer <access_token>
```

#### Payment Analytics
```bash
GET /analytics/payments?paymentMethod=CREDIT_CARD&startDate=2024-01-01
Authorization: Bearer <access_token>
```

### 📄 Export & Reporting

#### Export Invoices as PDF
```bash
POST /export/invoices-pdf
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "filters": {
    "status": "PAID",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "clientId": "64a7b8c9d1e2f34567890123"
  }
}
```

#### Export Financial Statement
```bash
POST /export/financial-statement
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

#### Generate Tax Report
```bash
POST /export/tax-report
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "year": 2024,
  "region": "US"
}
```

#### Export Client Analysis Report
```bash
POST /export/reports-pdf
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "reportType": "client-analysis",
  "filters": {}
}
```

### 🔍 Query Parameters & Filters

All analytics endpoints support comprehensive filtering:

- **Date Range**: `startDate`, `endDate` (ISO 8601 format)
- **Pagination**: `page` (default: 1), `limit` (default: 10, max: 100)
- **Status Filtering**: `status` for invoices/payments
- **Client Filtering**: `clientId` for client-specific data
- **Period Selection**: `period` (all, month, year) for trend analysis
- **Payment Method**: `paymentMethod` for payment analytics
- **Year/Month**: `year`, `month` for specific period queries

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
