require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/database');
const User = require('../models/User');

const seedUsers = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');
    
    // Create test users
    const users = [
      {
        email: 'admin@test.com',
        password: 'Admin123!',
        firstName: 'System',
        lastName: 'Administrator',
        role: 'ADMIN',
        companyName: 'TechCorp Inc.',
        phone: '+1234567890',
        address: {
          street: '123 Admin St',
          city: 'Admin City',
          state: 'Admin State',
          zipCode: '12345',
          country: 'USA'
        }
      },
      {
        email: 'accountant@test.com',
        password: 'Account123!',
        firstName: 'Jane',
        lastName: 'Accountant',
        role: 'ACCOUNTANT',
        companyName: 'Finance Corp',
        phone: '+1234567891',
        address: {
          street: '456 Finance Ave',
          city: 'Money City',
          state: 'Finance State',
          zipCode: '23456',
          country: 'USA'
        }
      },
      {
        email: 'client@test.com',
        password: 'Client123!',
        firstName: 'John',
        lastName: 'Client',
        role: 'CLIENT',
        companyName: 'Client Industries',
        phone: '+1234567892',
        address: {
          street: '789 Business Blvd',
          city: 'Client City',
          state: 'Business State',
          zipCode: '34567',
          country: 'USA'
        }
      },
      {
        email: 'john.doe@test.com',
        password: 'John123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'CLIENT',
        companyName: 'Doe Enterprises',
        phone: '+1234567893',
        address: {
          street: '321 Doe Street',
          city: 'Doe Town',
          state: 'Doe State',
          zipCode: '45678',
          country: 'USA'
        }
      },
      {
        email: 'sarah.smith@test.com',
        password: 'Sarah123!',
        firstName: 'Sarah',
        lastName: 'Smith',
        role: 'ACCOUNTANT',
        companyName: 'Smith Accounting',
        phone: '+1234567894',
        address: {
          street: '654 Smith Road',
          city: 'Smithville',
          state: 'Smith State',
          zipCode: '56789',
          country: 'USA'
        }
      }
    ];
    
    // Create users and hash passwords
    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      console.log(`Created user: ${user.email} (${user.role})`);
    }
    
    console.log('Seed completed successfully!');
    console.log('\nTest Accounts:');
    console.log('==============');
    console.log('Admin: admin@test.com / Admin123!');
    console.log('Accountant: accountant@test.com / Account123!');
    console.log('Client: client@test.com / Client123!');
    console.log('Client: john.doe@test.com / John123!');
    console.log('Accountant: sarah.smith@test.com / Sarah123!');
    
  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

// Run seeder if called directly
if (require.main === module) {
  seedUsers();
}

module.exports = seedUsers;