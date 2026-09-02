# MANGO RUSH — production image
FROM node:20-slim

# libsql ships prebuilt native binaries (@libsql/linux-x64-gnu), but keeping
# python3/make/g++ ensures the gcc runtime libs those binaries may link
# against are present, and acts as a safety net if any native module ever
# needs to be compiled from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Install dependencies first (libsql uses prebuilt binaries — no compilation needed)
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Copy the app
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
