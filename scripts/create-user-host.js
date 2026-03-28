/**
 * Create User and Host Script
 * Creates a regular user and a host user in the database
 * 
 * Usage:
 *   node scripts/create-user-host.js [--env=production]
 * 
 * Examples:
 *   # Development (default):
 *   node scripts/create-user-host.js
 *   
 *   # Production:
 *   node scripts/create-user-host.js --env=production
 *   NODE_ENV=production node scripts/create-user-host.js
 * 
 * Environment:
 *   - Uses MONGODB_URI from environment variables or .env file
 *   - Works for both local and production databases
 *   - For production, set NODE_ENV=production or use --env=production flag
 */

const path = require('path');
const nodeEnv = process.env.NODE_ENV || 'development';

// Check for --env flag in arguments
const envArg = process.argv.find(arg => arg.startsWith('--env='));
const envFromArg = envArg ? envArg.split('=')[1] : null;
const environment = envFromArg || nodeEnv;

// Load appropriate .env file based on environment
if (environment === 'production') {
  // Production: Use environment variables directly (from system/Render)
  // Don't load .env file - use system environment variables
  console.log('🌐 Production environment detected');
} else {
  // Development/Staging: Load .env file
  const envFile = `.env.${environment}`;
  require('dotenv').config({ path: path.join(__dirname, `../${envFile}`) });
  console.log(`📁 Loaded ${envFile}`);
}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model');
const walletService = require('../services/wallet.service');
const { DATABASE } = require('../constants');

// User and Host credentials
const USER_EMAIL = 'user@gmail.com';
const USER_PASSWORD = 'Admin@123';
const USER_NAME = 'Test User';

const HOST_EMAIL = 'host@gmail.com';
const HOST_PASSWORD = 'Admin@123';
const HOST_NAME = 'Test Host';

/**
 * Create a user with the specified credentials
 */
const createUser = async (email, password, name, role) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    if (existingUser) {
      console.log(`⚠️  User with email ${email} already exists:`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Role: ${existingUser.role || 'user'}`);
      console.log(`   ID: ${existingUser._id}`);
      
      // Update existing user
      existingUser.role = role;
      existingUser.isEmailVerified = true;
      
      // Update password
      const salt = await bcrypt.genSalt(10);
      existingUser.password = await bcrypt.hash(password, salt);
      
      // Update name
      existingUser.name = name.trim();
      
      await existingUser.save();
      console.log(`✅ User updated successfully!`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   ID: ${existingUser._id}`);
      
      // Create wallet if it doesn't exist
      try {
        await walletService.getOrCreateWallet(existingUser._id.toString());
        console.log(`✅ Wallet verified/created for ${role}`);
      } catch (walletError) {
        console.warn(`⚠️  Warning: Could not create wallet:`, walletError.message);
      }
      
      return existingUser;
    } else {
      // Create new user
      console.log(`📝 Creating ${role} user...`);
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const user = new User({
        email: email.toLowerCase(),
        name: name.trim(),
        password: hashedPassword,
        role: role,
        isEmailVerified: true
      });

      await user.save();
      console.log(`✅ ${role} user created successfully!`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   ID: ${user._id}`);

      // Create wallet for user
      try {
        await walletService.getOrCreateWallet(user._id.toString());
        console.log(`✅ Wallet created for ${role}`);
      } catch (walletError) {
        console.warn(`⚠️  Warning: Could not create wallet:`, walletError.message);
        // Continue even if wallet creation fails
      }
      
      return user;
    }
  } catch (error) {
    console.error(`❌ Error creating ${role} user:`);
    console.error(error.message);
    if (error.code === 11000) {
      console.error(`💡 Tip: User with email ${email} already exists`);
    }
    throw error;
  }
};

/**
 * Main function to create user and host
 */
const createUserAndHost = async () => {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || DATABASE.MONGODB.DEFAULT_URI;
    
    if (!process.env.MONGODB_URI) {
      console.warn('⚠️  Warning: MONGODB_URI not found in environment variables');
      console.warn('   Using default MongoDB URI (localhost)');
      if (environment === 'production') {
        console.error('\n❌ Error: MONGODB_URI must be set for production environment!');
        console.error('   Set it as an environment variable:');
        console.error('   export MONGODB_URI="mongodb://your-production-uri"');
        process.exit(1);
      }
    }
    
    console.log(`🔌 Connecting to MongoDB (${environment})...`);
    console.log(`   URI: ${mongoURI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials in log
    
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected successfully\n');

    // Create user
    console.log('='.repeat(50));
    console.log('Creating User Account');
    console.log('='.repeat(50));
    await createUser(USER_EMAIL, USER_PASSWORD, USER_NAME, 'user');
    
    console.log('\n');
    
    // Create host
    console.log('='.repeat(50));
    console.log('Creating Host Account');
    console.log('='.repeat(50));
    await createUser(HOST_EMAIL, HOST_PASSWORD, HOST_NAME, 'host');

    console.log('\n🎉 Done!');
    console.log('\n📋 Created Accounts:');
    console.log('\n👤 User Account:');
    console.log(`   Email: ${USER_EMAIL}`);
    console.log(`   Password: ${USER_PASSWORD}`);
    console.log(`   Role: user`);
    console.log('\n🏠 Host Account:');
    console.log(`   Email: ${HOST_EMAIL}`);
    console.log(`   Password: ${HOST_PASSWORD}`);
    console.log(`   Role: host`);
    
  } catch (error) {
    console.error('\n❌ Error creating users:');
    console.error(error.message);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
};

// Run the script
createUserAndHost();

