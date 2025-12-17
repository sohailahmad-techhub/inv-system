const http = require('http');

class APITester {
  constructor() {
    this.baseURL = 'http://localhost:5000';
    this.adminToken = '';
    this.accountantToken = '';
    this.clientToken = '';
  }

  makeRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
        }
      };

      if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }

      if (data) {
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
      }

      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(responseData);
            resolve({
              status: res.statusCode,
              data: parsedData
            });
          } catch (error) {
            resolve({
              status: res.statusCode,
              data: responseData
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async testHealthCheck() {
    console.log('\n🏥 TESTING: Health Check');
    try {
      const result = await this.makeRequest('GET', '/health');
      console.log(`✓ Health: ${result.data.message}`);
      return true;
    } catch (error) {
      console.log(`✗ Health check failed: ${error.message}`);
      return false;
    }
  }

  async testUserRegistration() {
    console.log('\n📝 TESTING: User Registration');
    try {
      const userData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        firstName: 'New',
        lastName: 'User',
        companyName: 'New Company Ltd'
      };
      
      const result = await this.makeRequest('POST', '/auth/register', userData);
      
      if (result.status === 201 && result.data.success) {
        console.log('✓ User registered successfully');
        console.log(`  - User: ${result.data.data.user.firstName} ${result.data.data.user.lastName}`);
        console.log(`  - Role: ${result.data.data.user.role}`);
        console.log(`  - Email: ${result.data.data.user.email}`);
        return true;
      } else {
        console.log('✗ Registration failed:', result.data);
        return false;
      }
    } catch (error) {
      console.log(`✗ Registration error: ${error.message}`);
      return false;
    }
  }

  async testUserLogin() {
    console.log('\n🔐 TESTING: User Login (All Roles)');
    
    // Test Admin Login
    try {
      const adminLogin = {
        email: 'admin@test.com',
        password: 'Admin123!'
      };
      
      const result = await this.makeRequest('POST', '/auth/login', adminLogin);
      
      if (result.status === 200 && result.data.success) {
        this.adminToken = result.data.data.accessToken;
        console.log('✓ Admin login successful');
        console.log(`  - Role: ${result.data.data.user.role}`);
        console.log(`  - User: ${result.data.data.user.firstName} ${result.data.data.user.lastName}`);
      }
    } catch (error) {
      console.log('✗ Admin login failed:', error.message);
    }

    // Test Accountant Login
    try {
      const accountantLogin = {
        email: 'accountant@test.com',
        password: 'Account123!'
      };
      
      const result = await this.makeRequest('POST', '/auth/login', accountantLogin);
      
      if (result.status === 200 && result.data.success) {
        this.accountantToken = result.data.data.accessToken;
        console.log('✓ Accountant login successful');
        console.log(`  - Role: ${result.data.data.user.role}`);
      }
    } catch (error) {
      console.log('✗ Accountant login failed:', error.message);
    }

    // Test Client Login
    try {
      const clientLogin = {
        email: 'client@test.com',
        password: 'Client123!'
      };
      
      const result = await this.makeRequest('POST', '/auth/login', clientLogin);
      
      if (result.status === 200 && result.data.success) {
        this.clientToken = result.data.data.accessToken;
        console.log('✓ Client login successful');
        console.log(`  - Role: ${result.data.data.user.role}`);
      }
    } catch (error) {
      console.log('✗ Client login failed:', error.message);
    }

    return !!(this.adminToken && this.accountantToken && this.clientToken);
  }

  async testTokenVerification() {
    console.log('\n🛡️  TESTING: Token Verification');
    
    if (!this.adminToken) {
      console.log('✗ No admin token available');
      return false;
    }

    try {
      const result = await this.makeRequest('GET', '/auth/verify', null, this.adminToken);
      
      if (result.status === 200 && result.data.success) {
        console.log('✓ Token verification successful');
        console.log(`  - User: ${result.data.data.user.firstName} ${result.data.data.user.lastName}`);
        console.log(`  - Role: ${result.data.data.user.role}`);
        return true;
      } else {
        console.log('✗ Token verification failed:', result.data);
        return false;
      }
    } catch (error) {
      console.log(`✗ Token verification error: ${error.message}`);
      return false;
    }
  }

  async testAdminEndpoints() {
    console.log('\n👑 TESTING: Admin Only Endpoints');
    
    if (!this.adminToken) {
      console.log('✗ No admin token available');
      return false;
    }

    // Test Get All Users
    try {
      const result = await this.makeRequest('GET', '/users?page=1&limit=5', null, this.adminToken);
      
      if (result.status === 200 && result.data.success) {
        console.log('✓ Get all users (Admin): SUCCESS');
        console.log(`  - Total users: ${result.data.data.pagination.totalUsers}`);
        console.log(`  - Current page: ${result.data.data.pagination.currentPage}`);
        return true;
      } else {
        console.log('✗ Get users failed:', result.data);
        return false;
      }
    } catch (error) {
      console.log(`✗ Get users error: ${error.message}`);
      return false;
    }
  }

  async testRoleBasedAccessControl() {
    console.log('\n🔒 TESTING: Role-Based Access Control');
    
    // Test if client can access admin endpoints (should fail)
    try {
      const result = await this.makeRequest('GET', '/users', null, this.clientToken);
      
      if (result.status === 403) {
        console.log('✓ Client properly blocked from admin endpoints');
      } else {
        console.log('✗ Client incorrectly accessed admin endpoints');
        return false;
      }
    } catch (error) {
      console.log('✓ Client access blocked (expected)');
    }

    // Test if accountant can access admin endpoints (should fail)
    try {
      const result = await this.makeRequest('GET', '/users', null, this.accountantToken);
      
      if (result.status === 403) {
        console.log('✓ Accountant properly blocked from admin endpoints');
        return true;
      } else {
        console.log('✗ Accountant incorrectly accessed admin endpoints');
        return false;
      }
    } catch (error) {
      console.log('✓ Accountant access blocked (expected)');
      return true;
    }
  }

  async testProfileManagement() {
    console.log('\n👤 TESTING: Profile Management');
    
    if (!this.adminToken) {
      console.log('✗ No admin token available');
      return false;
    }

    try {
      // Get own profile
      const result = await this.makeRequest('GET', '/users/profile', null, this.adminToken);
      
      if (result.status === 200 && result.data.success) {
        console.log('✓ Get profile: SUCCESS');
        console.log(`  - Profile: ${result.data.data.user.firstName} ${result.data.data.user.lastName}`);
        
        // Update profile
        const updateData = {
          firstName: 'System',
          lastName: 'Administrator',
          companyName: 'Updated TechCorp Inc.'
        };
        
        const updateResult = await this.makeRequest('PUT', '/users/profile', updateData, this.adminToken);
        
        if (updateResult.status === 200 && updateResult.data.success) {
          console.log('✓ Update profile: SUCCESS');
          return true;
        } else {
          console.log('✗ Update profile failed:', updateResult.data);
          return false;
        }
      } else {
        console.log('✗ Get profile failed:', result.data);
        return false;
      }
    } catch (error) {
      console.log(`✗ Profile management error: ${error.message}`);
      return false;
    }
  }

  async testTokenRefresh() {
    console.log('\n🔄 TESTING: Token Refresh');
    
    // First get a refresh token by logging in
    try {
      const loginResult = await this.makeRequest('POST', '/auth/login', {
        email: 'client@test.com',
        password: 'Client123!'
      });
      
      if (loginResult.status === 200 && loginResult.data.success) {
        const refreshToken = loginResult.data.data.refreshToken;
        
        // Test refresh
        const refreshResult = await this.makeRequest('POST', '/auth/refresh', {
          refreshToken: refreshToken
        });
        
        if (refreshResult.status === 200 && refreshResult.data.success) {
          console.log('✓ Token refresh: SUCCESS');
          console.log('  - New access token received');
          console.log('  - New refresh token received');
          return true;
        } else {
          console.log('✗ Token refresh failed:', refreshResult.data);
          return false;
        }
      }
    } catch (error) {
      console.log(`✗ Token refresh error: ${error.message}`);
      return false;
    }
  }

  async testPasswordReset() {
    console.log('\n🔑 TESTING: Password Reset');
    
    try {
      const result = await this.makeRequest('POST', '/auth/forgot-password', {
        email: 'admin@test.com'
      });
      
      if (result.status === 200) {
        console.log('✓ Forgot password: SUCCESS');
        console.log('  - Password reset email sent (simulated)');
        return true;
      } else {
        console.log('✗ Forgot password failed:', result.data);
        return false;
      }
    } catch (error) {
      console.log(`✗ Password reset error: ${error.message}`);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 COMPREHENSIVE JWT AUTHENTICATION & RBAC SYSTEM TEST');
    console.log('=======================================================');
    
    const tests = [
      { name: 'Health Check', fn: () => this.testHealthCheck() },
      { name: 'User Registration', fn: () => this.testUserRegistration() },
      { name: 'User Login', fn: () => this.testUserLogin() },
      { name: 'Token Verification', fn: () => this.testTokenVerification() },
      { name: 'Admin Endpoints', fn: () => this.testAdminEndpoints() },
      { name: 'Role-Based Access Control', fn: () => this.testRoleBasedAccessControl() },
      { name: 'Profile Management', fn: () => this.testProfileManagement() },
      { name: 'Token Refresh', fn: () => this.testTokenRefresh() },
      { name: 'Password Reset', fn: () => this.testPasswordReset() }
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (const test of tests) {
      try {
        const result = await test.fn();
        if (result) passedTests++;
      } catch (error) {
        console.log(`✗ ${test.name} failed with error:`, error.message);
      }
    }

    console.log('\n📊 TEST RESULTS');
    console.log('===============');
    console.log(`Tests Passed: ${passedTests}/${totalTests}`);
    console.log(`Success Rate: ${Math.round((passedTests/totalTests) * 100)}%`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 ALL TESTS PASSED! JWT Authentication & RBAC System is working perfectly!');
    } else {
      console.log(`\n⚠️  ${totalTests - passedTests} tests failed. Please check the system configuration.`);
    }

    console.log('\n✅ COMPREHENSIVE TEST COMPLETED');
  }
}

// Run the comprehensive test
const tester = new APITester();
tester.runAllTests().catch(console.error);