# ---- Builder Stage ----
# Use a Node.js LTS version as the base image for building
FROM node:20-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Prune devDependencies after build
RUN npm prune --production

# ---- Final Stage ----
# Use a slim Node.js LTS Alpine image for the final stage
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy node_modules (production dependencies only) from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the built JavaScript code from the builder stage
COPY --from=builder /app/dist ./dist

# Copy package.json (needed for Node.js to understand it's a project)
COPY package.json .

# Expose any ports if this were a web server (not needed for stdio)
# EXPOSE 3000 

# Environment variable for the storage path inside the container
# This path should typically be mapped to a volume when running the container
ENV PERSONA_STORAGE_PATH=/app/data/personas.json

# Command to run the server script using Node.js
# Use tini as init process for proper signal handling and zombie reaping
# RUN apk add --no-cache tini
# ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"] 