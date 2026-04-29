# =============================================================================
# Frontend Dockerfile — Multi-stage build
# Reference: https://docs.docker.com/build/building/multi-stage/
#
# Stage 1: Uses Node.js to build the React app into static HTML/CSS/JS files
# Stage 2: Uses Nginx (a lightweight web server) to serve those static files
#
# Why two stages?
# The Node.js build tools (Vite, npm, etc.) are only needed during build time.
# The final image only needs Nginx to serve static files — much smaller and safer.
# =============================================================================

# ─── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (for Docker layer caching)
COPY package*.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the production React bundle (outputs to /app/dist)
# The VITE_API_URL build arg allows injecting the API URL at build time
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ─── Stage 2: Serve ────────────────────────────────────────────────────────────
# Use official Nginx on Alpine Linux (~25MB vs ~350MB for full Nginx)
FROM nginx:alpine AS production

# Copy our custom Nginx config (handles React Router — single page app routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built files from the builder stage into the Nginx web root
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Nginx starts in the foreground (required for Docker containers)
CMD ["nginx", "-g", "daemon off;"]
