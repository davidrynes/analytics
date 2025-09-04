# Use Node.js 18 as base image
FROM node:18-slim

# Install system dependencies including Playwright browser dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    wget \
    gnupg \
    ca-certificates \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY requirements.txt ./

# Install Node.js dependencies
RUN npm install

# Install Python dependencies in virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV NODE_ENV=production
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Install Playwright and Chromium with system dependencies
RUN npx playwright install chromium
RUN npx playwright install-deps

# Copy source code
COPY . .

# Build React app
RUN npm run build

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]
