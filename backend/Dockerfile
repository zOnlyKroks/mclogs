FROM node:18-alpine

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies and rebuild native modules
RUN npm ci --only=production && npm rebuild sqlite3

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]