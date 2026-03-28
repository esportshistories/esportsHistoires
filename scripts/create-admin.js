/**
 * Create Admin User Script
 * Creates an admin user in the database
 * 
 * Usage:
 *   node scripts/create-admin.js <email> <password> <name> [--env=production]
 * 
 * Examples:
 *   # Development (default):
 *   node scripts/create-admin.js admin@example.com password123 "Admin Name"
 *   
 *   # Production:
 *   node scripts/create-admin.js admin@example.com password123 "Admin Name" --env=production
 *   NODE_ENV=production node scripts/create-admin.js admin@gmail.com Admin@123 "Admin Name"
 *   
 *   # With force update:
 *   node scripts/create-admin.js admin@example.com password123 "Admin Name" --force --env=production
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

// Get command line arguments
const args = process.argv.slice(2);

// Filter out --env flag from args for processing
const filteredArgs = args.filter(arg => !arg.startsWith('--env='));

if (filteredArgs.length < 3) {

  console.log('  npm run create-admin <email> <password> <name> [options]');
  console.log('\nExamples:');
  console.log('  # Development (default):');
  console.log('  node scripts/create-admin.js admin@example.com password123 "Admin Name"');
  console.log('\n  # Production:');
  console.log('  node scripts/create-admin.js admin@example.com password123 "Admin Name" --env=production');
  console.log('  NODE_ENV=production node scripts/create-admin.js admin@example.com password123 "Admin Name"');
  console.log('\n  # With force update:');
  console.log('  node scripts/create-admin.js admin@example.com password123 "Admin Name" --force --env=production');
  console.log('\nOptions:');
  console.log('  --force, -f              Force update if user already exists (non-interactive)');
  console.log('  --env=<environment>     Set environment: development, staging, production (default: development)');
  console.log('\nNote:');
  console.log('  - Email must be valid');
  console.log('  - Password must be at least 6 characters');
  console.log('  - Name must be at least 2 characters');
  console.log('  - For production, ensure MONGODB_URI is set in environment variables');
  console.log('  - Production uses system environment variables (not .env file)');
  process.exit(1);
}

const [email, password, name] = filteredArgs;

// Validate inputs
if (!email || !email.includes('@')) {
  console.error('❌ Error: Invalid email address');
  process.exit(1);
}

// Password validation: min 8 chars, 1+ capital, 1+ number, 1+ special char
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/;

if (!password || password.length < 8 || !PASSWORD_REGEX.test(password)) {
  console.error('❌ Error: Password must be at least 8 characters with at least one capital letter, one number, and one special character');
  process.exit(1);
}

if (!name || name.trim().length < 2) {
  console.error('❌ Error: Name must be at least 2 characters');
  process.exit(1);
}

/**
 * Main function to create admin user
 */
const createAdmin = async () => {
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

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log('⚠️  User with this email already exists:');
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Role: ${existingUser.role || 'user'}`);
      console.log(`   ID: ${existingUser._id}`);
      
      // Check if --force flag is provided
      const forceUpdate = filteredArgs.includes('--force') || filteredArgs.includes('-f');
      
      if (forceUpdate) {
        console.log('\n🔄 Force update enabled, updating user to admin...');
      } else {
        // Ask if user wants to update to admin (only in interactive mode)
        if (process.stdin.isTTY) {
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise(resolve => {
            readline.question('\nDo you want to update this user to admin role? (yes/no): ', resolve);
          });
          readline.close();

          if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
            console.log('\n❌ Operation cancelled');
            console.log('💡 Tip: Use --force flag to update without prompt');
            process.exit(0);
          }
        } else {
          console.log('\n❌ User already exists. Use --force flag to update:');
          console.log(`   node scripts/create-admin.js ${email} ${password} "${name}" --force`);
          process.exit(1);
        }
      }
      
      // Update existing user to admin
      existingUser.role = 'admin';
      existingUser.isEmailVerified = true;
      
      // Update password if provided
      if (password) {
        const salt = await bcrypt.genSalt(10);
        existingUser.password = await bcrypt.hash(password, salt);
      }
      
      // Update name if provided
      if (name) {
        existingUser.name = name.trim();
      }
      
      await existingUser.save();
      console.log('\n✅ User updated to admin successfully!');
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   ID: ${existingUser._id}`);
    } else {
      // Create new admin user
      console.log('📝 Creating admin user...');
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create admin user
      const admin = new User({
        email: email.toLowerCase(),
        name: name.trim(),
        password: hashedPassword,
        role: 'admin',
        isEmailVerified: true
      });

      await admin.save();
      console.log('✅ Admin user created successfully!');
      console.log(`   Email: ${admin.email}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   ID: ${admin._id}`);

      // Create wallet for admin
      try {
        await walletService.getOrCreateWallet(admin._id.toString());
        console.log('✅ Wallet created for admin');
      } catch (walletError) {
        console.warn('⚠️  Warning: Could not create wallet:', walletError.message);
        // Continue even if wallet creation fails
      }
    }

    console.log('\n🎉 Done!');
    console.log('\nYou can now login with:');
    console.log(`   Email: ${email.toLowerCase()}`);
    console.log(`   Password: ${password}`);
    
  } catch (error) {
    console.error('\n❌ Error creating admin user:');
    console.error(error.message);
    if (error.code === 11000) {
      console.error('\n💡 Tip: User with this email already exists');
    }
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
};

// Run the script
createAdmin();

