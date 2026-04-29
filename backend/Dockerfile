# =============================================================================
# Backend Dockerfile — Multi-stage build
# Reference: https://docs.docker.com/build/building/multi-stage/
#
# Multi-stage builds let you have a development stage and a production stage
# in the same Dockerfile. The dev stage includes tools like nodemon.
# The prod stage is lean — only what's needed to run the app.
# =============================================================================

# ─── Stage 1: Base ─────────────────────────────────────────────────────────────
# Use official Node.js 20 on Alpine Linux (very small ~50MB vs ~350MB for full image)
FROM node:20-alpine AS base

# Set working directory inside the container
# All COPY, RUN, CMD commands after this use /app as the current directory
WORKDIR /app

# Copy package files FIRST before copying source code
# WHY: Docker builds in layers. If package.json hasn't changed, Docker reuses
# the cached npm install layer — dramatically speeding up rebuilds!
COPY package*.json ./

# ─── Stage 2: Development ──────────────────────────────────────────────────────
FROM base AS development

# Install ALL dependencies including devDependencies (nodemon, jest, etc.)
RUN npm install

# Copy the rest of the source code
COPY . .

EXPOSE 5000

# Use nodemon in dev — it restarts the server when you change a file
CMD ["npm", "run", "dev"]

# ─── Stage 3: Production ───────────────────────────────────────────────────────
FROM base AS production

# --omit=dev skips devDependencies (nodemon, jest) — smaller, more secure image
RUN npm install --omit=dev

COPY . .

EXPOSE 5000

# Use node directly in production — nodemon is for development only
CMD ["node", "src/app.js"]
