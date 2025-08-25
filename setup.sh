#!/bin/bash
set -e

# Use absolute path
PROJECT_DIR="/root/mclogs"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "➡️ Pulling latest code from Git..."
cd "$PROJECT_DIR"
git pull origin main

# Build frontend
echo "➡️ Building frontend..."
cd "$FRONTEND_DIR"
npm install
npm run build

# Backend deployment
echo "➡️ Deploying backend..."
cd "$BACKEND_DIR"

# Install dependencies
npm install

# Build TypeScript to JavaScript
echo "➡️ Building backend TypeScript..."
npm run build

# Create logs directory
mkdir -p logs

# Stop existing PM2 process if running
pm2 delete mclogs-backend 2>/dev/null || true

# Start with PM2 in production mode
echo "➡️ Starting backend with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Reload Nginx to serve the new frontend
echo "➡️ Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Update complete!"
echo "Backend running with PM2 - use 'pm2 logs mclogs-backend' to view logs"
echo "PM2 status: 'pm2 status'"