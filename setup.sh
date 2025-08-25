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

# Start backend in detached screen
cd "$BACKEND_DIR"
npm install

if ! screen -list | grep -q "backend"; then
    echo "➡️ Starting backend in screen session..."
    screen -dmS backend bash -c "npm run start"
else
    echo "➡️ Backend screen session already running. Restarting..."
    screen -S backend -X quit
    screen -dmS backend bash -c "npm run start"
fi

# Reload Nginx to serve the new frontend
echo "➡️ Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Update complete!"
