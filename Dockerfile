FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy server directory
COPY server ./server

# Copy client directory  
COPY client ./client

# Install root dependencies
RUN npm ci

# Install server dependencies
WORKDIR /app/server
RUN npm ci

# Install client dependencies and build
WORKDIR /app/client
RUN npm ci && npm run build

# Set working directory back to app root for start
WORKDIR /app

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server/src/index.js"]
