FROM node:24-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY *.tgz ./
RUN npm install

# Copy source code
COPY . .
RUN npm run build

# Create temp directory for CAF files
RUN mkdir -p /tmp/caf-temp

# Set environment variables for web server
ENV WEB_SERVER_PORT=6700
ENV TEMP_DIR=/tmp/caf-temp
ENV DOWNLOAD_TIMEOUT_MS=300000

# Health check for the web server (port calculated as 6700 + JACKAL_WORKER_ID)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const workerId = parseInt(process.env.JACKAL_WORKER_ID || '1'); \
    const port = 6700 + workerId; \
    const options = { hostname: 'localhost', port: port, path: '/health', timeout: 5000 }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) { process.exit(0); } else { process.exit(1); } \
    }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => { req.destroy(); process.exit(1); }); \
    req.end();"

CMD ["npm", "run", "start"] 