# JWT Authentication & Role-Based Access Control System

A complete JWT-based authentication system with role-based access control built with Node.js, Express, and MongoDB.

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

## User Roles

- **ADMIN** - Full system access, can manage all users
- **ACCOUNTANT** - Limited access, can view and manage accounts
- **CLIENT** - Basic access, can only view their own profile

## Security Features

- ✅ Bcrypt password hashing (12 rounds)
- ✅ JWT token expiration (15 min access, 7 day refresh)
- ✅ Rate limiting on auth endpoints (5 requests per 15 minutes)
- ✅ CORS configuration
- ✅ Helmet security headers
- ✅ Input validation with express-validator
- ✅ Role-based access control middleware
- ✅ Token refresh mechanism

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

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
BCRYPT_SALT_ROUNDS=12
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

Use the provided test accounts or create new ones to test all endpoints. The system includes:

- Input validation for all endpoints
- Proper error responses
- Role-based access control
- Token refresh mechanism
- Password security

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
