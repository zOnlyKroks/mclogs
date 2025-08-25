#!/bin/bash

set -e  # exit on any error

echo "➡️ Pulling latest code from Git..."
cd "$PROJECT_DIR"

git pull origin main

screen -r backend 
npm run dev

#quit screen
screen -d backend

cd "$PROJECT_DIR/frontend"

npm run build

echo "➡️ Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Update complete!"
