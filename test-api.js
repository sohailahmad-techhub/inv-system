const http = require('http');

const testEndpoint = (method, path, data = null) => {
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
};

const runTests = async () => {
  console.log('Testing JWT Authentication & RBAC System...\n');

  // Test 1: Health check
  console.log('1. Testing Health Endpoint');
  try {
    const result = await testEndpoint('GET', '/health');
    console.log('✓ Health check:', result.data);
  } catch (error) {
    console.log('✗ Health check failed:', error.message);
  }

  // Test 2: Register new user
  console.log('\n2. Testing User Registration');
  try {
    const userData = {
      email: 'test@example.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      companyName: 'Test Corp'
    };
    const result = await testEndpoint('POST', '/auth/register', userData);
    console.log('✓ Registration:', result.data);
  } catch (error) {
    console.log('✗ Registration failed:', error.message);
  }

  // Test 3: Login with seeded admin
  console.log('\n3. Testing Admin Login');
  try {
    const loginData = {
      email: 'admin@test.com',
      password: 'Admin123!'
    };
    const result = await testEndpoint('POST', '/auth/login', loginData);
    console.log('✓ Admin login:', result.data.success ? 'SUCCESS' : 'FAILED');
    
    if (result.data.success && result.data.data.accessToken) {
      global.adminToken = result.data.data.accessToken;
      console.log('Admin token saved for further tests');
    }
  } catch (error) {
    console.log('✗ Admin login failed:', error.message);
  }

  // Test 4: Get all users (Admin only)
  console.log('\n4. Testing Get All Users (Admin only)');
  if (global.adminToken) {
    try {
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/users?page=1&limit=5',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${global.adminToken}`
        }
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(responseData);
            console.log('✓ Get users:', data.success ? 'SUCCESS' : 'FAILED');
            if (data.success) {
              console.log(`Found ${data.data.users.length} users`);
            }
          } catch (error) {
            console.log('✗ Get users parse error:', error.message);
          }
        });
      });

      req.on('error', (error) => {
        console.log('✗ Get users failed:', error.message);
      });

      req.end();
    } catch (error) {
      console.log('✗ Get users failed:', error.message);
    }
  }

  console.log('\n✅ API Tests Completed');
};

// Run tests
runTests().catch(console.error);