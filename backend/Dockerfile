FROM node:18-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm rebuild sqlite3

COPY . .
RUN npm run build

RUN mkdir -p /app/data

EXPOSE 8000
ENV NODE_ENV=production
CMD ["npm", "start"]
