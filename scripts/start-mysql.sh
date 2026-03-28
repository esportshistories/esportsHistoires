#!/bin/bash

# MySQL Start Script for Development
# This script helps start MySQL server for development

echo "🔍 Checking MySQL server status..."

# Check if MySQL is already running
if systemctl is-active --quiet mysql 2>/dev/null || systemctl is-active --quiet mysqld 2>/dev/null; then
    echo "✅ MySQL server is already running"
    exit 0
fi

# Try to start MySQL using systemctl (most common on Linux)
if command -v systemctl &> /dev/null; then
    echo "📦 Attempting to start MySQL using systemctl..."
    
    # Try mysql service first
    if systemctl start mysql 2>/dev/null; then
        echo "✅ MySQL server started successfully"
        exit 0
    fi
    
    # Try mysqld service
    if systemctl start mysqld 2>/dev/null; then
        echo "✅ MySQL server started successfully"
        exit 0
    fi
fi

# Try mysqld_safe (older systems or manual installations)
if command -v mysqld_safe &> /dev/null; then
    echo "📦 Attempting to start MySQL using mysqld_safe..."
    mysqld_safe --user=mysql &
    sleep 2
    if pgrep -x mysqld > /dev/null; then
        echo "✅ MySQL server started successfully"
        exit 0
    fi
fi

# If all methods fail, provide instructions
echo "❌ Could not start MySQL server automatically"
echo ""
echo "Please start MySQL manually using one of these methods:"
echo "  • sudo systemctl start mysql"
echo "  • sudo systemctl start mysqld"
echo "  • mysqld_safe --user=mysql &"
echo ""
echo "Or install MySQL if it's not installed:"
echo "  • Ubuntu/Debian: sudo apt-get install mysql-server"
echo "  • CentOS/RHEL: sudo yum install mysql-server"
echo "  • macOS: brew install mysql && brew services start mysql"
echo ""
exit 1

