#!/bin/bash
set -e

PROJECT_DIR="~/mclogs"   # <-- adjust to your actual path

echo "➡️ Pulling latest code from Git..."
cd "$PROJECT_DIR"
git pull origin main

# Start backend in detached screen
if ! screen -list | grep -q "backend"; then
    echo "➡️ Starting backend in screen session..."
    screen -dmS backend bash -c "npm run dev"
else
    echo "➡️ Backend screen session already running. Restarting..."
    screen -S backend -X quit
    screen -dmS backend bash -c "npm run dev"
fi

# Build frontend
cd "$PROJECT_DIR/frontend"
npm run build

echo "➡️ Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Update complete!"
