# Frontend Auth UI & Layout System

Complete authentication and layout system for the Invoice Management System.

## Features Implemented

### Authentication System
- ✅ Login page with email/password validation
- ✅ Registration page with password confirmation and strength indicator
- ✅ Forgot password page
- ✅ Password reset with token
- ✅ Email verification page
- ✅ JWT token management with localStorage
- ✅ Token refresh mechanism with axios interceptor
- ✅ Protected routes with role-based access control
- ✅ Auto logout on token expiration
- ✅ Session persistence

### Pages & Routes

#### Public Pages
- `/` - Home/Landing page (unauthenticated users)
- `/auth/login` - Login page
- `/auth/register` - Registration page
- `/auth/forgot-password` - Request password reset
- `/auth/reset-password` - Reset password with token
- `/auth/verify-email` - Email verification

#### Protected Pages
- `/dashboard` - Main dashboard (all authenticated users)
- `/invoices` - Invoice management (all users, role-based actions)
- `/clients` - Client management (Admin, Accountant only)
- `/payments` - Payment tracking (all users)
- `/reports` - Analytics & reports (Admin, Accountant only)
- `/users` - User management (Admin only)
- `/profile` - User profile & settings
- `/settings` - System settings & preferences

### Navigation Structure

**Admin Role:**
- Dashboard
- Invoices (full access)
- Clients
- Payments
- Reports
- Users
- Settings

**Accountant Role:**
- Dashboard
- Invoices
- Clients
- Payments
- Reports
- Settings

**Client Role:**
- Dashboard
- Invoices (view only)
- Payments (view only)
- Profile

### Authentication Context & Hooks

```typescript
// Usage
const { user, isAuthenticated, isLoading, login, register, logout, refreshProfile } = useAuth();
```

### Protected Routes

```typescript
// Protect all routes - redirects to login if not authenticated
<ProtectedRoute>
  <Component />
</ProtectedRoute>

// Protect with role requirements
<ProtectedRoute requiredRoles={['admin', 'accountant']}>
  <Component />
</ProtectedRoute>
```

### UI Components

#### Form Components
- `Button` - Primary, secondary, outline, danger variants with loading state
- `Input` - Text input with validation, error messages, icon support
- `Checkbox` - Checkbox with label and error support
- `Select` - Dropdown select with options
- `PasswordStrength` - Visual password strength indicator

#### Layout Components
- `Card` - Container with header, body, footer sections
- `Alert` - Success, error, warning, info variants
- `Modal` - Dialog component with customizable size
- `Badge` - Tags and badges with variants

#### Display Components
- `LoadingSpinner` - Animated spinner with message
- `Table` - Table with header, body, rows, cells
- `Pagination` - Pagination controls with page numbers
- `Tabs` - Tabbed content interface

#### Navigation Components
- `Navbar` - Top navigation with user profile dropdown and dark mode toggle
- `Sidebar` - Collapsible sidebar with role-based menu items
- `Layout` - Main layout wrapper with navbar and sidebar

### Dark Mode

- Toggle button in navbar
- Preference persisted in localStorage
- Smooth transitions between light and dark mode
- Applies to all components
- Proper color contrast maintained

**Theme Colors:**
- Primary: Blue (#0ea5e9)
- Secondary: Indigo (#6366f1)
- Success: Green (#22c55e)
- Danger: Red (#ef4444)
- Warning: Amber (#f59e0b)
- Info: Cyan (#06b6d4)

### Authentication Flow

1. User visits `/` (unauthenticated)
2. User clicks "Sign In" → navigates to `/auth/login`
3. User enters email and password
4. Backend validates and returns JWT token + user data
5. Token stored in localStorage and added to axios headers
6. User redirected to `/dashboard`
7. Layout renders with sidebar navigation based on user role
8. Protected routes check authentication and role access
9. On token expiration, axios interceptor attempts refresh
10. If refresh fails, user is logged out and redirected to login

### Token Management

```typescript
// lib/auth.ts
- getToken() - Retrieve token from localStorage
- getUser() - Retrieve user data from localStorage
- isAuthenticated() - Check if user is authenticated
- refreshToken() - Refresh expired token via API

// Axios interceptors automatically:
// - Add Authorization header to all requests
// - Retry failed requests with refreshed token
// - Clear credentials on 401 response
```

### Form Validation

All forms include client-side validation with:
- Email format validation
- Password requirements (min 6 characters)
- Password confirmation matching
- Custom error messages
- Field-level error display

### Responsive Design

- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Responsive sidebar (collapsible on mobile)
- Mobile-friendly navigation

## File Structure

```
pages/
├── _app.tsx                 # App wrapper with AuthProvider
├── index.tsx                # Home page
├── dashboard.tsx            # Main dashboard
├── invoices/
│   └── index.tsx            # Invoices list
├── clients.tsx              # Client management
├── payments.tsx             # Payment tracking
├── reports.tsx              # Reports & analytics
├── users.tsx                # User management (admin)
├── profile.tsx              # User profile
├── settings.tsx             # Settings & preferences
└── auth/
    ├── login.tsx            # Login page
    ├── register.tsx         # Registration page
    ├── forgot-password.tsx  # Forgot password
    ├── reset-password.tsx   # Reset password
    └── verify-email.tsx     # Email verification

components/
├── Layout.tsx               # Main layout wrapper
├── Navbar.tsx               # Top navigation bar
├── Sidebar.tsx              # Side navigation
├── ProtectedRoute.tsx       # Route protection wrapper
└── ui/
    ├── Button.tsx           # Button component
    ├── Input.tsx            # Input field
    ├── Card.tsx             # Card container
    ├── Alert.tsx            # Alert messages
    ├── Checkbox.tsx         # Checkbox input
    ├── Modal.tsx            # Modal dialog
    ├── Select.tsx           # Select dropdown
    ├── Badge.tsx            # Badge/tag
    ├── Tabs.tsx             # Tabbed content
    ├── Table.tsx            # Table component
    ├── Pagination.tsx       # Pagination
    ├── LoadingSpinner.tsx   # Loading indicator
    └── PasswordStrength.tsx # Password strength

context/
└── AuthContext.tsx          # Auth state management

lib/
├── auth.ts                  # Auth service with JWT handling
└── apiClient.ts             # Axios instance with interceptors

styles/
└── globals.css              # Global styles & Tailwind
```

## Environment Variables

Create a `.env.local` file:

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000
```

## Running the Frontend

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm run start
```

## Authentication API Endpoints

The frontend expects these backend endpoints:

```
POST   /auth/login              - Login user
POST   /auth/register           - Register new user
POST   /auth/logout             - Logout user
POST   /auth/refresh            - Refresh token
GET    /auth/profile            - Get user profile
PUT    /auth/profile            - Update profile
POST   /auth/forgot-password    - Request password reset
POST   /auth/reset-password     - Reset password with token
GET    /auth/verify-email       - Verify email address
```

## Integration with Backend

The system uses axios for API calls with automatic token handling:

1. Token included in Authorization header: `Bearer {token}`
2. Failed requests with 401 status trigger token refresh
3. Refreshed token automatically retried
4. On persistent 401, user is logged out

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires localStorage support
- ES6+ JavaScript support required

## Accessibility Features

- Semantic HTML elements
- Form labels associated with inputs
- Error messages for validation feedback
- Keyboard navigation support
- Focus styles visible on all interactive elements
- ARIA attributes where applicable

## Security Features

- JWT tokens stored in localStorage
- HTTPS required in production
- Authorization header on protected requests
- Role-based access control on routes
- Token expiration and refresh
- Password strength validation
- XSS protection via React's automatic escaping
- CSRF protection via SameSite cookies (if using)

## Future Enhancements

- Two-factor authentication (2FA)
- Social login (Google, GitHub)
- Session timeout warning
- Remember me functionality
- Password reset email template
- User activity logging
- Account recovery options
- Advanced permission system
