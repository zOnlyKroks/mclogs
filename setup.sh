#!/bin/bash
# update.sh — updates Git, rebuilds Docker, updates frontend, reloads Nginx

set -e  # exit on any error

# Config
PROJECT_DIR="$HOME/mclogs"
FRONTEND_CONTAINER_NAME="frontend"        # docker-compose service name
NGINX_FRONTEND_DIR="/var/www/mclogs_frontend"

echo "➡️ Pulling latest code from Git..."
cd "$PROJECT_DIR"

docker-compose down -v --rmi all --remove-orphans
docker system prune -a --volumes --force

git pull origin main

echo "➡️ Rebuilding Docker images..."
docker-compose build

echo "➡️ Starting containers..."
docker-compose up -d

echo "➡️ Copying frontend build to Nginx host path..."
FRONTEND_CONTAINER_ID=$(docker-compose ps -q "$FRONTEND_CONTAINER_NAME")
docker cp "$FRONTEND_CONTAINER_ID":/usr/share/nginx/html/. "$NGINX_FRONTEND_DIR"

echo "➡️ Setting permissions for Nginx..."
sudo chown -R www-data:www-data "$NGINX_FRONTEND_DIR"
sudo chmod -R 755 "$NGINX_FRONTEND_DIR"

echo "➡️ Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Update complete!"
