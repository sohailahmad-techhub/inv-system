# Testing the Frontend Auth & Layout System

## Quick Start

1. **Start the backend:**
   ```bash
   npm run dev
   ```
   The backend will run on `http://localhost:5000`

2. **Start the frontend (in another terminal):**
   ```bash
   npm run dev
   ```
   The frontend will run on `http://localhost:3000`

## Testing Authentication

### 1. Landing Page
- **URL:** `http://localhost:3000/`
- **Expected:** Landing page with "Sign In" and "Create Account" buttons
- **Actions:**
  - Click "Sign In" → goes to `/auth/login`
  - Click "Create Account" → goes to `/auth/register`

### 2. Registration Flow
- **URL:** `http://localhost:3000/auth/register`
- **Test with:**
  ```
  Name: John Doe
  Email: john@example.com
  Company: Acme Corp (optional)
  Password: Test@123
  Confirm Password: Test@123
  ```
- **Expected:**
  - Form validates in real-time
  - Password strength indicator shows (should show "Strong" or "Good")
  - Submit button shows loading state
  - On success, redirects to dashboard
  - User data stored in localStorage

### 3. Login Flow
- **URL:** `http://localhost:3000/auth/login`
- **Test with:**
  ```
  Email: john@example.com
  Password: Test@123
  Remember Me: checked
  ```
- **Expected:**
  - Form validates
  - Submit shows loading state
  - Token stored in localStorage as `auth_token`
  - User data stored in localStorage as `auth_user`
  - Redirects to dashboard

### 4. Protected Routes
- **After login, verify:**
  - Can access `/dashboard` ✓
  - Can access `/invoices` ✓
  - Can access `/payments` ✓
  - Can access `/profile` ✓
  - Can access `/settings` ✓

### 5. Role-Based Access Control
- **Depends on user role** (set during registration/by backend):
  - **Admin:**
    - Can access: Dashboard, Invoices, Clients, Payments, Reports, Users, Settings
    - Navigate via sidebar - all items visible
  
  - **Accountant:**
    - Can access: Dashboard, Invoices, Clients, Payments, Reports, Settings
    - Sidebar: Users link hidden
  
  - **Client:**
    - Can access: Dashboard, Invoices, Payments, Profile
    - Sidebar: Clients and Reports links hidden
    - Invoices page: "Create Invoice" button hidden

### 6. Dark Mode Toggle
- **Location:** Top right of navbar (🌙/☀️ button)
- **Test:**
  - Click toggle button
  - Page transitions to dark mode
  - Preference persists after reload
  - All components properly styled in dark mode
  - Proper color contrast maintained

### 7. User Profile Dropdown
- **Location:** Top right of navbar (user initials)
- **Contains:**
  - User name, email, and role
  - Profile link
  - Settings link
  - Logout button
- **Test:**
  - Click dropdown to open/close
  - Click outside to close
  - Click Profile → goes to `/profile`
  - Click Settings → goes to `/settings`

### 8. Profile Page
- **URL:** `http://localhost:3000/profile`
- **Features:**
  - Display current profile info (name, email, role)
  - Edit button to update name/email
  - Change password section
  - Both sections show success/error messages

### 9. Sidebar Navigation
- **Features:**
  - Collapsible (collapse/expand button)
  - Hover states on menu items
  - Active link highlighting
  - Role-based visibility of items
  - Responsive (collapses on mobile)

### 10. Logout
- **From navbar dropdown:**
  - Click user dropdown
  - Click "Logout"
  - Tokens removed from localStorage
  - Redirected to `/auth/login`
  - Cannot access protected routes after logout

### 11. Forgot Password Flow
- **URL:** `http://localhost:3000/auth/forgot-password`
- **Test:**
  - Enter email address
  - Click "Send Reset Link"
  - Expected: Success message (actual email sending depends on backend)
  - Link would be: `/auth/reset-password?token=xyz`

### 12. Reset Password Flow
- **URL:** `http://localhost:3000/auth/reset-password?token=abc123`
- **Test:**
  - Enter new password
  - Confirm password
  - Password strength indicator shows
  - Click "Reset Password"
  - Success message appears
  - Redirects to `/auth/login`

### 13. Email Verification
- **URL:** `http://localhost:3000/auth/verify-email?token=xyz`
- **Test:**
  - Should show loading spinner initially
  - Then show success/error message
  - Success: shows "Go to Login" button
  - Error: shows "Back to Login" button

### 14. Form Validation
- **Login page:**
  - Empty email → "Email is required"
  - Invalid email → "Please enter a valid email"
  - Empty password → "Password is required"
  - Short password → "Password must be at least 6 characters"

- **Register page:**
  - Name < 2 chars → error
  - Invalid email → error
  - Password < 6 chars → error
  - Passwords don't match → "Passwords do not match"

## Testing Responsive Design

### Mobile (375px width)
```bash
# In browser DevTools, set device to iPhone 12
```
- **Expected:**
  - Sidebar collapses to icons only
  - Navigation is touch-friendly
  - Buttons are large enough to tap
  - Forms are single-column
  - All text is readable

### Tablet (768px width)
```bash
# In browser DevTools, set device to iPad
```
- **Expected:**
  - Sidebar visible but narrower
  - Cards are properly laid out in 2-column grid
  - Touch-friendly interface maintained

### Desktop (1024px+)
- **Expected:**
  - Full sidebar with labels
  - Multi-column layouts
  - Full feature set visible

## Testing Token Refresh

1. **Monitor Network tab in DevTools**
2. **Login to get a token**
3. **In DevTools Console:**
   ```javascript
   // Get token
   localStorage.getItem('auth_token')
   
   // Manually expire token (for testing, modify to short expiry in backend)
   // Make API request that would trigger 401
   ```
4. **Expected:** Automatic token refresh before retry

## Testing Dark Mode Persistence

1. **Login to dashboard**
2. **Toggle dark mode (🌙 button)**
3. **Refresh page (F5)**
4. **Expected:** Dark mode persists

## Testing Error Handling

### Wrong Credentials
- **Login with:**
  ```
  Email: wrong@example.com
  Password: wrongpassword
  ```
- **Expected:** Error message: "Invalid email or password"

### Email Already Exists
- **Register with existing email**
- **Expected:** Error message: "User with this email already exists"

### Duplicate Password Mismatch
- **Register with:**
  ```
  Password: Test@123
  Confirm: Different@456
  ```
- **Expected:** "Passwords do not match"

## Browser Console Checks

1. **No console errors when:**
   - Navigating between pages
   - Logging in/out
   - Toggling dark mode
   - Using forms

2. **Check localStorage:**
   ```javascript
   // After login
   console.log(localStorage.getItem('auth_token'))      // Should have JWT
   console.log(localStorage.getItem('auth_user'))       // Should have user object
   console.log(localStorage.getItem('theme'))           // Should have 'dark' or 'light'
   ```

## Performance Testing

1. **Page load time:** Should be < 3 seconds
2. **Dark mode toggle:** Should be instant (< 100ms)
3. **Navigation:** Should be smooth without lag
4. **Form submission:** Loading state should show immediately

## Accessibility Testing

### Keyboard Navigation
- Tab through form fields
- Enter to submit forms
- Tab to dropdown menu
- Arrow keys for selection

### Screen Reader
- Forms should have associated labels
- Error messages should be announced
- Buttons should have clear labels
- Icons should have alt text or aria-labels

## Common Issues & Solutions

### Issue: Token not persisting
- **Check:** DevTools > Application > Local Storage
- **Solution:** Ensure NEXT_PUBLIC_API_URL is correct

### Issue: Dark mode not persisting
- **Check:** localStorage.getItem('theme')
- **Solution:** Browser might be in private mode (localStorage not available)

### Issue: Protected routes not working
- **Check:** Is AuthProvider in _app.tsx?
- **Check:** Is user authenticated? (check localStorage)
- **Solution:** Ensure backend is running and returning user data

### Issue: API calls failing
- **Check:** Backend is running on port 5000
- **Check:** CORS is enabled on backend
- **Check:** Check browser console for error details

## Expected Test Results Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Landing Page | ✓ | Shows login/register buttons |
| Registration | ✓ | Creates user and stores token |
| Login | ✓ | Authenticates user |
| Protected Routes | ✓ | Blocks unauthenticated access |
| Role-Based Access | ✓ | Shows/hides content by role |
| Dark Mode | ✓ | Persists after reload |
| Sidebar Navigation | ✓ | Collapsible and responsive |
| User Dropdown | ✓ | Profile, settings, logout |
| Logout | ✓ | Clears tokens and redirects |
| Form Validation | ✓ | Shows errors in real-time |
| Password Strength | ✓ | Visual indicator on register |
| Password Reset | ✓ | Sends reset email (if backend configured) |
| Email Verification | ✓ | Verifies email with token |
| Token Refresh | ✓ | Auto-refreshes on 401 |
| Responsive Design | ✓ | Works on mobile/tablet/desktop |

## Acceptance Criteria Checklist

- [x] Login/register working with backend
- [x] JWT tokens stored and used correctly
- [x] Protected routes functional
- [x] Dark/light mode switching
- [x] Responsive design on mobile/tablet/desktop
- [x] All UI components styled consistently
- [x] Role-based navigation working
- [x] Error messages displaying correctly
- [x] Form validation working
- [x] Password strength indicator
- [x] Loading states on submit
- [x] Token refresh mechanism
- [x] Auto logout on token expiration
- [x] Persist auth state using localStorage
- [x] Redirect unauthenticated users to login
- [x] Protect routes based on user role
- [x] Sidebar with role-based menu
- [x] Top navigation bar with user dropdown
- [x] Dark mode toggle in navbar
- [x] Proper color contrast in dark mode
